import * as vscode from 'vscode';
import * as fs from 'fs';
import type { Repository } from '../model/repository';
import type { Incoming } from '../model/webviewMessages';
import { performBranchAction } from './branches';
import { browseFilesAt } from './browseRevision';
import { showRebaseDialog } from './rebaseDialog';
import { REV_SCHEME } from './quickDiff';
import { toWebUrl, commitWebUrl, fileWebUrl } from '../util/remoteUrl';
import { isDefined, isEmpty, isNil, notEmpty } from '../util/guards';
import type { PostMessage } from './shelfController';

/** Handles the Log tab's webview messages: filters, the graph, and commit actions. */
export class LogController {
  private scope = '--all';
  private logPath = '';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repo: Repository,
    private readonly post: PostMessage,
  ) {}

  /** Select a commit by hash in the Log tab (used by the blame "Show Commit in Log" link). */
  async reveal(hash: string): Promise<void> {
    await this.postLog();
    await this.postBranches();
    this.post({ type: 'revealCommit', hash });
  }

  async handle(m: Incoming): Promise<boolean> {
    switch (m.type) {
      case 'requestLog':
        await this.postLog();
        await this.postBranches();
        return true;
      case 'setLogScope':
        this.scope = m.scope || '--all';
        await this.postLog();
        await this.postBranches();
        return true;
      case 'pushUpTo':
        await this.pushUpTo(m.hash);
        return true;
      case 'createPatchFromCommit':
        await this.createPatchFromCommit(m.hash);
        return true;
      case 'compareCommits':
        await this.compareCommits(m.a, m.b);
        return true;
      case 'browseAt':
        await browseFilesAt(this.repo, m.hash);
        return true;
      case 'branchCmd': {
        const { current } = await this.repo.git.branches();
        await performBranchAction(this.repo, m.ref, current, m.isRemote, m.action);
        await this.postLog();
        await this.postBranches();
        return true;
      }
      case 'logBranchFilter':
        await this.pickBranchFilter();
        return true;
      case 'logPathFilter':
        await this.pickPathFilter();
        return true;
      case 'commitDetails': {
        const [files, body, committer, branches, tags] = await Promise.all([
          this.repo.git.commitFiles(m.hash),
          this.repo.git.commitBody(m.hash),
          this.repo.git.commitCommitter(m.hash),
          this.repo.git.branchesContaining(m.hash),
          this.repo.git.tag.containing(m.hash),
        ]);
        this.post({ type: 'commitDetailsData', hash: m.hash, files, body, committer, branches, tags });
        return true;
      }
      case 'openRevDiff':
        await this.openRevDiff(m.hash, m.parent, m.path);
        return true;
      case 'openRevLocalDiff':
        await this.openRevLocalDiff(m.hash, m.path);
        return true;
      case 'openRevFileRemote':
        await this.openRevFileRemote(m.hash, m.path);
        return true;
      case 'copyHash':
        await vscode.env.clipboard.writeText(m.hash);
        vscode.window.showInformationMessage(`JeGit: copied ${m.hash.slice(0, 10)}`);
        return true;
      case 'copySubject':
        await vscode.env.clipboard.writeText(m.text);
        vscode.window.showInformationMessage('JeGit: commit subject copied to clipboard.');
        return true;
      case 'copyText':
        await vscode.env.clipboard.writeText(m.text);
        vscode.window.showInformationMessage(`JeGit: copied "${m.text}".`);
        return true;
      case 'copyMessage': {
        const body = await this.repo.git.commitBody(m.hash).catch(() => '');
        if (isEmpty(body.trim())) {
          vscode.window.showInformationMessage('JeGit: could not read the commit message.');
          return true;
        }
        await vscode.env.clipboard.writeText(body);
        vscode.window.showInformationMessage('JeGit: full commit message copied to clipboard.');
        return true;
      }
      case 'branchesContaining':
        await this.showContaining(m.hash, await this.repo.git.branchesContaining(m.hash), 'local branch', 'branch');
        return true;
      case 'tagsContaining':
        await this.showContaining(m.hash, await this.repo.git.tag.containing(m.hash), 'tag', 'tag');
        return true;
      case 'openCommitRemote':
        await this.openCommitOnRemote(m.hash);
        return true;
      case 'checkoutRev':
        await this.runLogOp(() => this.repo.git.checkout(m.hash), `checked out ${m.hash.slice(0, 7)} (detached)`);
        return true;
      case 'newBranchAt':
        await this.newBranchAt(m.hash);
        return true;
      case 'cherryPick':
        await this.runLogOp(() => this.repo.git.cherryPick(m.hash), `cherry-picked ${m.hash.slice(0, 7)}`);
        return true;
      case 'revertCommit':
        await this.runLogOp(() => this.repo.git.revert(m.hash), `reverted ${m.hash.slice(0, 7)}`);
        return true;
      case 'resetTo':
        await this.resetTo(m.hash);
        return true;
      case 'editMessage':
        await this.editMessage(m.hash);
        return true;
      case 'dropCommit':
        await this.dropCommit(m.hash);
        return true;
      case 'fixupCommit':
        await this.runLogOp(
          () => this.repo.git.rebaseAction(`${m.hash}~2`, m.hash, 'fixup', this.rebaseScript()),
          `fixed up ${m.hash.slice(0, 7)} into its parent`,
        );
        return true;
      case 'interactiveRebase':
        await showRebaseDialog(this.context, this.repo, m.hash);
        await this.postLog();
        return true;
      case 'undoCommit':
        await this.undoCommit(m.hash);
        return true;
      case 'squashTo':
        await this.squashTo(m.hash);
        return true;
      case 'tagAt':
        await this.tagAt(m.hash);
        return true;
      default:
        return false;
    }
  }

  private async postLog(): Promise<void> {
    const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
    const commits = await this.repo.git.log(limit, this.scope, this.logPath);
    this.post({ type: 'logData', commits });
  }

  /** Send the branch tree (and the active log scope) to the Log tab's left panel. */
  private async postBranches(): Promise<void> {
    try {
      const { current, locals, remotes } = await this.repo.git.branches();
      const outgoing = await this.repo.git.outgoingHashes();
      this.post({
        type: 'branchData',
        current,
        locals,
        remotes,
        outgoing,
        scope: this.scope,
        logPath: this.logPath,
      });
    } catch {
      /* no branches yet (empty repo) */
    }
  }

  private async pushUpTo(hash: string): Promise<void> {
    if (!(await this.repo.git.isAncestor(hash, 'HEAD'))) {
      vscode.window.showInformationMessage('JeGit: that commit is not on the current branch.');
      return;
    }
    const ok = await vscode.window.showWarningMessage(
      `Push all commits up to ${hash.slice(0, 7)} to the remote?`,
      { modal: true },
      'Push',
    );
    if (ok !== 'Push') return;
    await this.runLogOp(() => this.repo.git.pushUpTo(hash), `pushed up to ${hash.slice(0, 7)}`);
  }

  private async createPatchFromCommit(hash: string): Promise<void> {
    try {
      const patch = await this.repo.git.commitPatch(hash);
      if (isEmpty(patch.trim())) {
        vscode.window.showInformationMessage('JeGit: nothing to export from this commit.');
        return;
      }
      const uri = await vscode.window.showSaveDialog({
        defaultUri: this.repo.absUri(hash.slice(0, 7) + '.patch'),
        filters: { Patch: ['patch', 'diff'] },
      });
      if (isNil(uri)) return;
      fs.writeFileSync(uri.fsPath, patch, 'utf8');
      vscode.window.showInformationMessage(`JeGit: created patch ${uri.fsPath.split(/[\\/]/).pop()}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async compareCommits(a: string, b: string): Promise<void> {
    const files = await this.repo.git.diffRefs(a, b);
    if (isEmpty(files)) {
      vscode.window.showInformationMessage('JeGit: no differences between the selected commits.');
      return;
    }
    type F = vscode.QuickPickItem & { path: string };
    const items: F[] = files.map((f) => ({
      label: f.path.split('/').pop() ?? f.path,
      description: `${f.status}  ${f.path}`,
      path: f.path,
    }));
    const file = await vscode.window.showQuickPick(items, {
      placeHolder: `Changed files: ${a.slice(0, 7)} <-> ${b.slice(0, 7)}`,
    });
    if (isNil(file)) return;
    const left = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file.path, query: a });
    const right = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file.path, query: b });
    const name = file.path.split('/').pop() ?? file.path;
    await vscode.commands.executeCommand('vscode.diff', left, right, `${name} (${a.slice(0, 7)} <-> ${b.slice(0, 7)})`);
  }

  private async pickBranchFilter(): Promise<void> {
    const { current, locals, remotes } = await this.repo.git.branches();
    type Item = vscode.QuickPickItem & { scope: string };
    const items: Item[] = [{ label: '$(git-branch) All branches', scope: '--all' }];
    for (const b of locals) items.push({ label: b, description: b === current ? 'current' : undefined, scope: b });
    for (const b of remotes) items.push({ label: '$(cloud) ' + b, scope: b });
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Show log for' });
    if (isNil(pick)) return;
    this.scope = pick.scope;
    await this.postLog();
  }

  private async pickPathFilter(): Promise<void> {
    const p = await vscode.window.showInputBox({
      prompt: 'Filter Log by path (empty = all paths)',
      value: this.logPath,
      placeHolder: 'src/app/foo.ts',
    });
    if (isNil(p)) return;
    this.logPath = p.trim();
    await this.postLog();
    await this.postBranches();
  }

  private async showContaining(hash: string, refs: string[], noun: string, kind: string): Promise<void> {
    if (isEmpty(refs)) {
      vscode.window.showInformationMessage(`JeGit: no ${noun} contains ${hash.slice(0, 10)}.`);
      return;
    }
    const pick = await vscode.window.showQuickPick(refs, {
      title: `${kind === 'tag' ? 'Tags' : 'Branches'} containing ${hash.slice(0, 10)}`,
      placeHolder: `Select a ${kind} to show its history`,
    });
    if (isDefined(pick)) {
      this.scope = pick;
      await this.postLog();
      await this.postBranches();
    }
  }

  private async openCommitOnRemote(hash: string): Promise<void> {
    const remotes = await this.repo.git.remote.list();
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
    const web = isDefined(origin) ? toWebUrl(origin.url) : '';
    if (isEmpty(web)) {
      vscode.window.showInformationMessage('JeGit: could not determine the remote web URL.');
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(commitWebUrl(web, hash)));
  }

  private async openRevFileRemote(hash: string, rel: string): Promise<void> {
    const remotes = await this.repo.git.remote.list();
    const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
    const web = isDefined(origin) ? toWebUrl(origin.url) : '';
    if (isEmpty(web)) {
      vscode.window.showInformationMessage('JeGit: could not determine the remote web URL.');
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(fileWebUrl(web, hash, rel)));
  }

  private async newBranchAt(hash: string): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: `New branch at ${hash.slice(0, 7)}`, placeHolder: 'feature/x' });
    if (isNil(name) || isEmpty(name)) return;
    await this.runLogOp(() => this.repo.git.checkoutNew(name.trim(), hash), `created ${name.trim()}`);
  }

  private async resetTo(hash: string): Promise<void> {
    type ModeItem = vscode.QuickPickItem & { mode: 'soft' | 'mixed' | 'hard' };
    const items: ModeItem[] = [
      { label: 'Soft', description: 'keep all changes staged', mode: 'soft' },
      { label: 'Mixed', description: 'keep changes, unstaged', mode: 'mixed' },
      { label: 'Hard', description: 'discard all local changes', mode: 'hard' },
    ];
    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: `Reset ${this.repo.branch} to ${hash.slice(0, 7)}`,
    });
    if (isNil(choice)) return;
    if (choice.mode === 'hard') {
      const ok = await vscode.window.showWarningMessage(
        'Hard reset will discard local changes. Continue?',
        { modal: true },
        'Reset',
      );
      if (ok !== 'Reset') return;
    }
    await this.runLogOp(() => this.repo.git.reset(hash, choice.mode), `reset to ${hash.slice(0, 7)}`);
  }

  private async editMessage(hash: string): Promise<void> {
    const head = await this.repo.git.headHash();
    const current = await this.repo.git.commitBody(hash);
    const message = await vscode.window.showInputBox({ prompt: 'Edit commit message', value: current });
    if (isNil(message) || isEmpty(message.trim())) return;
    if (hash === head) {
      await this.runLogOp(() => this.repo.git.amendMessage(message.trim()), 'reworded the latest commit');
    } else {
      await this.runLogOp(
        () => this.repo.git.rebaseAction(`${hash}~1`, hash, 'reword', this.rebaseScript(), message.trim()),
        `reworded ${hash.slice(0, 7)}`,
      );
    }
  }

  private async dropCommit(hash: string): Promise<void> {
    const ok = await vscode.window.showWarningMessage(
      `Drop commit ${hash.slice(0, 7)}? Its changes will be discarded.`,
      { modal: true },
      'Drop',
    );
    if (ok !== 'Drop') return;
    const head = await this.repo.git.headHash();
    if (hash === head) {
      await this.runLogOp(() => this.repo.git.resetHard(`${hash}~1`), `dropped ${hash.slice(0, 7)}`);
    } else {
      await this.runLogOp(
        () => this.repo.git.rebaseAction(`${hash}~1`, hash, 'drop', this.rebaseScript()),
        `dropped ${hash.slice(0, 7)}`,
      );
    }
  }

  private async undoCommit(hash: string): Promise<void> {
    const head = await this.repo.git.headHash();
    if (hash !== head) {
      vscode.window.showInformationMessage('JeGit: only the latest commit can be undone.');
      return;
    }
    const ok = await vscode.window.showWarningMessage(
      'Undo the last commit? Its changes return to Local Changes.',
      { modal: true },
      'Undo Commit',
    );
    if (ok !== 'Undo Commit') return;
    await this.runLogOp(() => this.repo.git.undoLastCommit(), 'undid the last commit');
  }

  private async squashTo(hash: string): Promise<void> {
    const head = await this.repo.git.headHash();
    if (hash === head) {
      vscode.window.showInformationMessage('JeGit: pick an older commit; this squashes it and all newer commits into one.');
      return;
    }
    if (!(await this.repo.git.isAncestor(hash, 'HEAD'))) {
      vscode.window.showInformationMessage('JeGit: that commit is not in the current branch history.');
      return;
    }
    const combined = await this.repo.git.rangeMessages(`${hash}~1..HEAD`);
    const message = await vscode.window.showInputBox({
      prompt: `Squash ${hash.slice(0, 7)}..HEAD into one commit`,
      value: combined.split('\n')[0] || '',
    });
    if (isNil(message) || isEmpty(message.trim())) return;
    await this.runLogOp(async () => {
      await this.repo.git.reset(`${hash}~1`, 'soft');
      await this.repo.git.commitIndex(message.trim());
    }, `squashed ${hash.slice(0, 7)}..HEAD`);
  }

  private async tagAt(hash: string): Promise<void> {
    const name = await vscode.window.showInputBox({ prompt: 'New tag name', placeHolder: 'v1.0.0' });
    if (isNil(name) || isEmpty(name)) return;
    const message = await vscode.window.showInputBox({ prompt: 'Tag message (optional, empty = lightweight tag)' });
    await this.runLogOp(
      () => this.repo.git.tag.create(name.trim(), hash, message?.trim() || undefined),
      `created tag ${name.trim()}`,
    );
  }

  private async openRevDiff(hash: string, parent: string, rel: string): Promise<void> {
    const left = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + rel, query: parent });
    const right = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + rel, query: hash });
    const name = rel.split('/').pop() ?? rel;
    const sh = (h: string) => (notEmpty(h) ? h.slice(0, 7) : '∅');
    await vscode.commands.executeCommand('vscode.diff', left, right, `${name} (${sh(parent)} <-> ${sh(hash)})`);
  }

  private async openRevLocalDiff(hash: string, rel: string): Promise<void> {
    const left = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + rel, query: hash });
    const name = rel.split('/').pop() ?? rel;
    await vscode.commands.executeCommand('vscode.diff', left, this.repo.absUri(rel), `${name} (${hash.slice(0, 7)} <-> Local)`);
  }

  private rebaseScript(): string {
    return vscode.Uri.joinPath(this.context.extensionUri, 'media', 'rebase-editor.js').fsPath;
  }

  /** Run a Log action, report it, then refresh both the working tree and the log. */
  private async runLogOp(op: () => Promise<void>, ok: string): Promise<void> {
    try {
      await op();
      vscode.window.showInformationMessage(`JeGit: ${ok}.`);
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await this.repo.refresh();
      await this.postLog();
    }
  }
}
