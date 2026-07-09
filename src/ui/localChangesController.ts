import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Repository } from '../model/repository';
import { DEFAULT_CHANGELIST_ID } from '../model/changelistStore';
import { HEAD_SCHEME } from './quickDiff';
import { showFileHistory } from './history';
import { showMergeResolver } from './mergeResolver';
import { splitHunks, buildHunkPatch } from '../util/diff';
import { lintCommitMessage } from '../util/commitMessage';
import type { CommitMsg, Incoming } from '../model/webviewMessages';
import { isDefined, isEmpty, isNil, notEmpty } from '../util/guards';
import type { PostMessage } from './shelfController';

/** Handles the Local Changes tab's webview messages: changelists, diffs, commits. */
export class LocalChangesController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repo: Repository,
    private readonly post: PostMessage,
  ) {}

  async handle(m: Incoming): Promise<boolean> {
    switch (m.type) {
      case 'newChangelist': {
        const name = await vscode.window.showInputBox({ prompt: 'New changelist name', placeHolder: 'Feature X' });
        if (isDefined(name) && notEmpty(name)) await this.repo.newChangelist(name.trim());
        return true;
      }
      case 'renameChangelist': {
        const cl = this.repo.store.getChangelist(m.id);
        const name = await vscode.window.showInputBox({ prompt: 'Rename changelist', value: cl?.name });
        if (isDefined(name) && notEmpty(name)) await this.repo.rename(m.id, name.trim());
        return true;
      }
      case 'deleteChangelist':
        if (m.id === DEFAULT_CHANGELIST_ID) {
          vscode.window.showWarningMessage('JeGit: the default changelist cannot be deleted.');
        } else {
          await this.repo.remove(m.id);
        }
        return true;
      case 'setActive':
        await this.repo.setActive(m.id);
        return true;
      case 'move':
        await this.moveToChangelist(m.paths);
        return true;
      case 'assignTo':
        await this.repo.move(m.paths, m.id);
        return true;
      case 'openDiff':
        await this.openDiff(m.path, m.untracked);
        return true;
      case 'openFile':
        await vscode.commands.executeCommand('vscode.open', this.repo.absUri(m.path));
        return true;
      case 'mergeResolve':
        await showMergeResolver(this.context, this.repo, m.path);
        return true;
      case 'markResolved':
        await this.repo.git.add(m.paths);
        await this.repo.refresh();
        return true;
      case 'addToGitignore':
        await this.addToGitignore(m.path);
        return true;
      case 'fileHistory':
        await showFileHistory(this.repo, m.path);
        return true;
      case 'annotate': {
        const doc = await vscode.workspace.openTextDocument(this.repo.absUri(m.path));
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('jegit.toggleBlame');
        return true;
      }
      case 'getLastCommitMessage': {
        const message = await this.repo.git.commitBody('HEAD');
        this.post({ type: 'lastCommitMessage', message });
        return true;
      }
      case 'recallMessage':
        await this.recallMessage();
        return true;
      case 'rollback':
        await this.rollback(m.items);
        return true;
      case 'commit':
        await this.commit(m);
        return true;
      case 'stage':
        if (notEmpty(m.paths)) await this.repo.git.add(m.paths);
        await this.repo.refresh();
        return true;
      case 'unstage':
        if (notEmpty(m.paths)) await this.repo.git.unstage(m.paths);
        await this.repo.refresh();
        return true;
      case 'commitStaged':
        await this.commitStaged(m.message, m.push);
        return true;
      case 'commitHunks':
        await this.commitHunks(m.path);
        return true;
      case 'createPatch':
        await this.createPatch(m.items);
        return true;
      case 'copyPath':
        await vscode.env.clipboard.writeText(m.absolute ? this.repo.absUri(m.path).fsPath : m.path);
        vscode.window.showInformationMessage('JeGit: path copied to clipboard.');
        return true;
      default:
        return false;
    }
  }

  private async confirmMessageIssues(message: string): Promise<boolean> {
    const issues = lintCommitMessage(message);
    if (isEmpty(issues)) return true;
    const ok = await vscode.window.showWarningMessage(
      'The commit message has issues. Commit anyway?',
      { modal: true, detail: issues.join('\n') },
      'Commit Anyway',
    );
    return ok === 'Commit Anyway';
  }

  private async recallMessage(): Promise<void> {
    const messages = await this.repo.git.recentCommitMessages();
    if (isEmpty(messages)) {
      vscode.window.showInformationMessage('JeGit: no recent commit messages.');
      return;
    }
    const pick = await vscode.window.showQuickPick(
      messages.map((msg) => ({ label: msg.split('\n')[0], detail: msg, value: msg })),
      { title: 'Recent commit messages', placeHolder: 'Reuse a commit message' },
    );
    if (isDefined(pick)) this.post({ type: 'setCommitMessage', text: pick.value });
  }

  private async commit(m: CommitMsg): Promise<void> {
    if (isNil(m.paths) || isEmpty(m.paths)) {
      vscode.window.showWarningMessage('JeGit: select at least one file to commit.');
      return;
    }
    if (isNil(m.message) || isEmpty(m.message.trim())) {
      vscode.window.showWarningMessage('JeGit: enter a commit message first.');
      return;
    }
    if (!(await this.confirmMessageIssues(m.message.trim()))) return;
    try {
      await this.repo.commit(m.paths, m.message.trim(), {
        amend: m.amend,
        push: m.push,
        signoff: m.signoff,
        author: m.author?.trim() || undefined,
      });
      this.post({ type: 'committed' });
      vscode.window.showInformationMessage(
        `JeGit: committed ${m.paths.length} file(s)${m.push ? ' and pushed' : ''}.`,
      );
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async commitStaged(message: string, push: boolean): Promise<void> {
    if (isNil(message) || isEmpty(message.trim())) {
      vscode.window.showWarningMessage('JeGit: enter a commit message.');
      return;
    }
    if (!(await this.confirmMessageIssues(message.trim()))) return;
    try {
      await this.repo.git.commitIndex(message.trim());
      this.post({ type: 'committed' });
      if (push) await vscode.commands.executeCommand('jegit.push');
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)} (stage something first)`);
    } finally {
      await this.repo.refresh();
    }
  }

  /** Commit a subset of a file's hunks: stage selected hunks to the index, commit. */
  private async commitHunks(rel: string): Promise<void> {
    const diff = await this.repo.git.diffHead([rel]);
    if (isEmpty(diff.trim())) {
      vscode.window.showInformationMessage('JeGit: no changes to commit in this file.');
      return;
    }
    const { header, hunks } = splitHunks(diff);
    if (isEmpty(hunks)) {
      vscode.window.showInformationMessage('JeGit: no hunks found.');
      return;
    }
    type Hunk = vscode.QuickPickItem & { index: number };
    const items: Hunk[] = hunks.map((h, i) => ({
      label: h.header,
      detail: h.lines.slice(1, 4).join(' ').slice(0, 100),
      picked: true,
      index: i,
    }));
    const picked = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: `Select hunks of ${rel.split('/').pop()} to commit`,
    });
    if (isNil(picked) || isEmpty(picked)) return;
    const message = await vscode.window.showInputBox({ prompt: 'Commit message' });
    if (isNil(message) || isEmpty(message.trim())) return;

    const patch = buildHunkPatch(header, picked.map((p) => hunks[p.index]));
    const tmp = path.join(os.tmpdir(), `jegit-hunks-${Date.now()}.patch`);
    try {
      fs.writeFileSync(tmp, patch, 'utf8');
      await this.repo.git.applyCached(tmp);
      await this.repo.git.commitIndex(message.trim());
      vscode.window.showInformationMessage(`JeGit: committed ${picked.length} hunk(s) of ${rel.split('/').pop()}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: partial commit failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      await this.repo.refresh();
    }
  }

  /** Write the diff of the given files to a .patch file chosen by the user. */
  private async createPatch(items: { path: string; untracked: boolean }[]): Promise<void> {
    if (isEmpty(items)) return;
    const untracked = items.filter((i) => i.untracked).map((i) => i.path);
    const all = items.map((i) => i.path);
    try {
      if (notEmpty(untracked)) await this.repo.git.addIntentToAdd(untracked);
      const patch = await this.repo.git.diffHead(all);
      if (notEmpty(untracked)) await this.repo.git.raw(['reset', '-q', '--', ...untracked]).catch(() => undefined);
      if (isEmpty(patch.trim())) {
        vscode.window.showInformationMessage('JeGit: nothing to put in the patch.');
        return;
      }
      const uri = await vscode.window.showSaveDialog({
        defaultUri: this.repo.absUri('changes.patch'),
        filters: { Patch: ['patch', 'diff'] },
      });
      if (isNil(uri)) return;
      fs.writeFileSync(uri.fsPath, patch, 'utf8');
      vscode.window.showInformationMessage(`JeGit: created patch ${uri.fsPath.split(/[\\/]/).pop()}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async moveToChangelist(paths: string[]): Promise<void> {
    if (isNil(paths) || isEmpty(paths)) return;
    type Item = vscode.QuickPickItem & { id: string };
    const items: Item[] = this.repo.store.changelists
      .filter((c) => c.id !== this.repo.store.activeId)
      .map((c) => ({ label: c.name, id: c.id }));
    items.push({ label: '$(add) New changelist...', id: '__new__' });
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Move to changelist' });
    if (isNil(pick)) return;
    let id = pick.id;
    if (id === '__new__') {
      const name = await vscode.window.showInputBox({ prompt: 'New changelist name' });
      if (isNil(name) || isEmpty(name)) return;
      id = (await this.repo.newChangelist(name.trim(), false)).id;
    }
    await this.repo.move(paths, id);
  }

  private async rollback(items: { path: string; untracked: boolean }[]): Promise<void> {
    if (isNil(items) || isEmpty(items)) return;
    const confirm = await vscode.window.showWarningMessage(
      `Rollback ${items.length} file(s)? Local changes will be lost.`,
      { modal: true },
      'Rollback',
    );
    if (confirm !== 'Rollback') return;
    const tracked = items.filter((i) => !i.untracked).map((i) => i.path);
    const untracked = items.filter((i) => i.untracked).map((i) => i.path);
    try {
      if (notEmpty(tracked)) await this.repo.git.raw(['checkout', 'HEAD', '--', ...tracked]);
      for (const rel of untracked) {
        try {
          fs.unlinkSync(this.repo.absUri(rel).fsPath);
        } catch {
          /* already gone */
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await this.repo.refresh();
    }
  }

  private async addToGitignore(rel: string): Promise<void> {
    const gi = this.repo.absUri('.gitignore').fsPath;
    try {
      let cur = '';
      try {
        cur = fs.readFileSync(gi, 'utf8');
      } catch {
        /* no .gitignore yet */
      }
      const existing = cur.split('\n').map((s) => s.trim());
      if (!existing.includes(rel)) {
        const sep = notEmpty(cur) && !cur.endsWith('\n') ? '\n' : '';
        fs.appendFileSync(gi, sep + rel + '\n');
      }
      vscode.window.showInformationMessage(`JeGit: added ${rel} to .gitignore.`);
      await this.repo.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async openDiff(rel: string, untracked: boolean): Promise<void> {
    const abs = this.repo.absUri(rel);
    if (untracked) {
      await vscode.commands.executeCommand('vscode.open', abs);
      return;
    }
    const head = abs.with({ scheme: HEAD_SCHEME, query: rel });
    const name = rel.split('/').pop() ?? rel;
    await vscode.commands.executeCommand('vscode.diff', head, abs, `${name} (HEAD <-> Working Tree)`);
  }
}
