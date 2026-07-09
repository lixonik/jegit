import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Repository } from '../model/repository';
import { DEFAULT_CHANGELIST_ID } from '../model/changelistStore';
import { HEAD_SCHEME } from './quickDiff';
import { renderVersionControlHtml } from './versionControlHtml';
import { ShelfController } from './shelfController';
import { LogController } from './logController';
import { showFileHistory } from './history';
import { showMergeResolver } from './mergeResolver';
import { splitHunks, buildHunkPatch } from '../util/diff';
import { splitStaged } from '../util/stagingGroups';
import { CommitMsg, Incoming } from '../model/webviewMessages';

/** The JetBrains-style Version Control tool window, rendered as a webview. */
export class VersionControlView implements vscode.WebviewViewProvider {
  static readonly viewId = 'jegit.versionControl';
  private view?: vscode.WebviewView;
  private readonly consoleLog: string[] = [];
  private readonly shelfCtrl: ShelfController;
  private readonly logCtrl: LogController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repo: Repository,
  ) {
    this.repo.onDidChange(() => this.postState());
    this.repo.git.commandLogger = (line) => this.pushConsole(line);
    const post = (m: object) => this.view?.webview.postMessage(m);
    this.shelfCtrl = new ShelfController(this.repo, post);
    this.logCtrl = new LogController(this.context, this.repo, post);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    view.webview.html = renderVersionControlHtml(view.webview, this.context.extensionUri);
    view.webview.onDidReceiveMessage((m: Incoming) => void this.onMessage(m));
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.repo.refresh();
    });
    void this.repo.refresh();
  }

  private async postState(): Promise<void> {
    const payload = this.repo.view();
    const operation = await this.repo.git.operationState().catch(() => null);
    const stagingOn = vscode.workspace.getConfiguration('jegit').get('stagingArea', false);
    const staging = stagingOn ? splitStaged(await this.repo.git.status().catch(() => [])) : null;
    this.view?.webview.postMessage({ type: 'state', payload, operation, staging });
  }

  private pushConsole(line: string): void {
    const entry = `$ ${line}`;
    this.consoleLog.push(entry);
    if (this.consoleLog.length > 500) this.consoleLog.shift();
    this.view?.webview.postMessage({ type: 'consoleLine', line: entry });
  }

  /** Focus the Log tab and select a commit by hash (used by the blame "Show Commit in Log" link). */
  async revealCommitInLog(hash: string): Promise<void> {
    await vscode.commands.executeCommand(`${VersionControlView.viewId}.focus`);
    await this.logCtrl.reveal(hash);
  }

  private async onMessage(m: Incoming): Promise<void> {
    if (await this.shelfCtrl.handle(m)) return;
    if (await this.logCtrl.handle(m)) return;
    switch (m.type) {
      case 'ready':
        this.postState();
        break;
      case 'refresh':
        await this.repo.refresh();
        break;
      case 'branches':
        await vscode.commands.executeCommand('jegit.branches');
        break;
      case 'requestConsole':
        this.view?.webview.postMessage({ type: 'consoleData', lines: this.consoleLog });
        break;
      case 'getLastCommitMessage': {
        const message = await this.repo.git.commitBody('HEAD');
        this.view?.webview.postMessage({ type: 'lastCommitMessage', message });
        break;
      }
      case 'opAction': {
        const cmd =
          m.action === 'continue'
            ? 'jegit.continueOperation'
            : m.action === 'abort'
              ? 'jegit.abortOperation'
              : 'jegit.skipCommit';
        await vscode.commands.executeCommand(cmd);
        await this.postState();
        break;
      }
      case 'annotate': {
        const doc = await vscode.workspace.openTextDocument(this.repo.absUri(m.path));
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('jegit.toggleBlame');
        break;
      }
      case 'recallMessage': {
        const messages = await this.repo.git.recentCommitMessages();
        if (!messages.length) {
          vscode.window.showInformationMessage('JeGit: no recent commit messages.');
          break;
        }
        const pick = await vscode.window.showQuickPick(
          messages.map((msg) => ({ label: msg.split('\n')[0], detail: msg, value: msg })),
          { title: 'Recent commit messages', placeHolder: 'Reuse a commit message' },
        );
        if (pick) this.view?.webview.postMessage({ type: 'setCommitMessage', text: pick.value });
        break;
      }
      case 'newChangelist': {
        const name = await vscode.window.showInputBox({ prompt: 'New changelist name', placeHolder: 'Feature X' });
        if (name) await this.repo.newChangelist(name.trim());
        break;
      }
      case 'renameChangelist': {
        const cl = this.repo.store.getChangelist(m.id);
        const name = await vscode.window.showInputBox({ prompt: 'Rename changelist', value: cl?.name });
        if (name) await this.repo.rename(m.id, name.trim());
        break;
      }
      case 'deleteChangelist':
        if (m.id === DEFAULT_CHANGELIST_ID) {
          vscode.window.showWarningMessage('JeGit: the default changelist cannot be deleted.');
        } else {
          await this.repo.remove(m.id);
        }
        break;
      case 'setActive':
        await this.repo.setActive(m.id);
        break;
      case 'move':
        await this.moveToChangelist(m.paths);
        break;
      case 'assignTo':
        await this.repo.move(m.paths, m.id);
        break;
      case 'openDiff':
        await this.openDiff(m.path, m.untracked);
        break;
      case 'openFile':
        await vscode.commands.executeCommand('vscode.open', this.repo.absUri(m.path));
        break;
      case 'mergeResolve':
        await showMergeResolver(this.context, this.repo, m.path);
        break;
      case 'markResolved':
        await this.repo.git.add(m.paths);
        await this.repo.refresh();
        break;
      case 'addToGitignore':
        await this.addToGitignore(m.path);
        break;
      case 'fileHistory':
        await showFileHistory(this.repo, m.path);
        break;
      case 'rollback':
        await this.rollback(m.items);
        break;
      case 'commit':
        await this.commit(m);
        break;
      case 'stage':
        if (m.paths.length) await this.repo.git.add(m.paths);
        await this.repo.refresh();
        break;
      case 'unstage':
        if (m.paths.length) await this.repo.git.unstage(m.paths);
        await this.repo.refresh();
        break;
      case 'commitStaged': {
        if (!m.message?.trim()) {
          vscode.window.showWarningMessage('JeGit: enter a commit message.');
          break;
        }
        try {
          await this.repo.git.commitIndex(m.message.trim());
          this.view?.webview.postMessage({ type: 'committed' });
          if (m.push) await vscode.commands.executeCommand('jegit.push');
        } catch (err) {
          vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)} (stage something first)`);
        } finally {
          await this.repo.refresh();
        }
        break;
      }
      case 'commitHunks':
        await this.commitHunks(m.path);
        break;
      case 'createPatch':
        await this.createPatch(m.items);
        break;
      case 'copyPath':
        await vscode.env.clipboard.writeText(m.absolute ? this.repo.absUri(m.path).fsPath : m.path);
        vscode.window.showInformationMessage('JeGit: path copied to clipboard.');
        break;
    }
  }

  private async commit(m: CommitMsg): Promise<void> {
    if (!m.paths?.length) {
      vscode.window.showWarningMessage('JeGit: select at least one file to commit.');
      return;
    }
    if (!m.message?.trim()) {
      vscode.window.showWarningMessage('JeGit: enter a commit message first.');
      return;
    }
    try {
      await this.repo.commit(m.paths, m.message.trim(), {
        amend: m.amend,
        push: m.push,
        signoff: m.signoff,
        author: m.author?.trim() || undefined,
      });
      this.view?.webview.postMessage({ type: 'committed' });
      vscode.window.showInformationMessage(
        `JeGit: committed ${m.paths.length} file(s)${m.push ? ' and pushed' : ''}.`,
      );
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Commit a subset of a file's hunks: stage selected hunks to the index, commit. */
  private async commitHunks(rel: string): Promise<void> {
    const diff = await this.repo.git.diffHead([rel]);
    if (!diff.trim()) {
      vscode.window.showInformationMessage('JeGit: no changes to commit in this file.');
      return;
    }
    const { header, hunks } = splitHunks(diff);
    if (!hunks.length) {
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
    if (!picked || !picked.length) return;
    const message = await vscode.window.showInputBox({ prompt: 'Commit message' });
    if (!message || !message.trim()) return;

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
    if (!items.length) return;
    const untracked = items.filter((i) => i.untracked).map((i) => i.path);
    const all = items.map((i) => i.path);
    try {
      if (untracked.length) await this.repo.git.addIntentToAdd(untracked);
      const patch = await this.repo.git.diffHead(all);
      if (untracked.length) await this.repo.git.raw(['reset', '-q', '--', ...untracked]).catch(() => undefined);
      if (!patch.trim()) {
        vscode.window.showInformationMessage('JeGit: nothing to put in the patch.');
        return;
      }
      const uri = await vscode.window.showSaveDialog({
        defaultUri: this.repo.absUri('changes.patch'),
        filters: { Patch: ['patch', 'diff'] },
      });
      if (!uri) return;
      fs.writeFileSync(uri.fsPath, patch, 'utf8');
      vscode.window.showInformationMessage(`JeGit: created patch ${uri.fsPath.split(/[\\/]/).pop()}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async moveToChangelist(paths: string[]): Promise<void> {
    if (!paths?.length) return;
    type Item = vscode.QuickPickItem & { id: string };
    const items: Item[] = this.repo.store.changelists
      .filter((c) => c.id !== this.repo.store.activeId)
      .map((c) => ({ label: c.name, id: c.id }));
    items.push({ label: '$(add) New changelist...', id: '__new__' });
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Move to changelist' });
    if (!pick) return;
    let id = pick.id;
    if (id === '__new__') {
      const name = await vscode.window.showInputBox({ prompt: 'New changelist name' });
      if (!name) return;
      id = (await this.repo.newChangelist(name.trim(), false)).id;
    }
    await this.repo.move(paths, id);
  }

  private async rollback(items: { path: string; untracked: boolean }[]): Promise<void> {
    if (!items?.length) return;
    const confirm = await vscode.window.showWarningMessage(
      `Rollback ${items.length} file(s)? Local changes will be lost.`,
      { modal: true },
      'Rollback',
    );
    if (confirm !== 'Rollback') return;
    const tracked = items.filter((i) => !i.untracked).map((i) => i.path);
    const untracked = items.filter((i) => i.untracked).map((i) => i.path);
    try {
      if (tracked.length) await this.repo.git.raw(['checkout', 'HEAD', '--', ...tracked]);
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
        const sep = cur && !cur.endsWith('\n') ? '\n' : '';
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
