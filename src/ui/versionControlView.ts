import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Repository } from '../model/repository';
import { DEFAULT_CHANGELIST_ID } from '../model/changelistStore';
import { HEAD_SCHEME, REV_SCHEME } from './quickDiff';
import { renderVersionControlHtml } from './versionControlHtml';
import { ShelfController } from './shelfController';
import { showFileHistory } from './history';
import { showRebaseDialog } from './rebaseDialog';
import { performBranchAction } from './branches';
import { showMergeResolver } from './mergeResolver';
import { splitHunks, buildHunkPatch } from '../util/diff';
import { splitStaged } from '../util/stagingGroups';
import { toWebUrl, commitWebUrl } from '../util/remoteUrl';
import { CommitMsg, Incoming } from '../model/webviewMessages';

/** The JetBrains-style Version Control tool window, rendered as a webview. */
export class VersionControlView implements vscode.WebviewViewProvider {
  static readonly viewId = 'jegit.versionControl';
  private view?: vscode.WebviewView;
  private readonly consoleLog: string[] = [];
  private readonly shelfCtrl: ShelfController;
  private logScope = '--all';
  private logPath = '';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repo: Repository,
  ) {
    this.repo.onDidChange(() => this.postState());
    this.repo.git.commandLogger = (line) => this.pushConsole(line);
    this.shelfCtrl = new ShelfController(this.repo, (m) => this.view?.webview.postMessage(m));
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

  /** Send the branch tree (and the active log scope) to the Log tab's left panel. */
  private async postBranches(): Promise<void> {
    try {
      const { current, locals, remotes } = await this.repo.git.branches();
      const outgoing = await this.repo.git.outgoingHashes();
      this.view?.webview.postMessage({
        type: 'branchData',
        current,
        locals,
        remotes,
        outgoing,
        scope: this.logScope,
        logPath: this.logPath,
      });
    } catch {
      /* no branches yet (empty repo) */
    }
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
    const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
    const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
    this.view?.webview.postMessage({ type: 'logData', commits });
    await this.postBranches();
    this.view?.webview.postMessage({ type: 'revealCommit', hash });
  }

  private async onMessage(m: Incoming): Promise<void> {
    if (await this.shelfCtrl.handle(m)) return;
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
      case 'requestLog': {
        const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
        const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
        this.view?.webview.postMessage({ type: 'logData', commits });
        await this.postBranches();
        break;
      }
      case 'setLogScope': {
        this.logScope = m.scope || '--all';
        const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
        const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
        this.view?.webview.postMessage({ type: 'logData', commits });
        await this.postBranches();
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
      case 'pushUpTo': {
        if (!(await this.repo.git.isAncestor(m.hash, 'HEAD'))) {
          vscode.window.showInformationMessage('JeGit: that commit is not on the current branch.');
          break;
        }
        const ok = await vscode.window.showWarningMessage(
          `Push all commits up to ${m.hash.slice(0, 7)} to the remote?`,
          { modal: true },
          'Push',
        );
        if (ok !== 'Push') break;
        await this.runLogOp(() => this.repo.git.pushUpTo(m.hash), `pushed up to ${m.hash.slice(0, 7)}`);
        break;
      }
      case 'createPatchFromCommit': {
        try {
          const patch = await this.repo.git.commitPatch(m.hash);
          if (!patch.trim()) {
            vscode.window.showInformationMessage('JeGit: nothing to export from this commit.');
            break;
          }
          const uri = await vscode.window.showSaveDialog({
            defaultUri: this.repo.absUri(m.hash.slice(0, 7) + '.patch'),
            filters: { Patch: ['patch', 'diff'] },
          });
          if (!uri) break;
          fs.writeFileSync(uri.fsPath, patch, 'utf8');
          vscode.window.showInformationMessage(`JeGit: created patch ${uri.fsPath.split(/[\\/]/).pop()}.`);
        } catch (err) {
          vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
        }
        break;
      }
      case 'compareCommits': {
        const files = await this.repo.git.diffRefs(m.a, m.b);
        if (!files.length) {
          vscode.window.showInformationMessage('JeGit: no differences between the selected commits.');
          break;
        }
        type F = vscode.QuickPickItem & { path: string };
        const items: F[] = files.map((f) => ({
          label: f.path.split('/').pop() ?? f.path,
          description: `${f.status}  ${f.path}`,
          path: f.path,
        }));
        const file = await vscode.window.showQuickPick(items, {
          placeHolder: `Changed files: ${m.a.slice(0, 7)} <-> ${m.b.slice(0, 7)}`,
        });
        if (!file) break;
        const left = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file.path, query: m.a });
        const right = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file.path, query: m.b });
        const name = file.path.split('/').pop() ?? file.path;
        await vscode.commands.executeCommand('vscode.diff', left, right, `${name} (${m.a.slice(0, 7)} <-> ${m.b.slice(0, 7)})`);
        break;
      }
      case 'branchCmd': {
        const { current } = await this.repo.git.branches();
        await performBranchAction(this.repo, m.ref, current, m.isRemote, m.action);
        const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
        const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
        this.view?.webview.postMessage({ type: 'logData', commits });
        await this.postBranches();
        break;
      }
      case 'logBranchFilter': {
        const { current, locals, remotes } = await this.repo.git.branches();
        type Item = vscode.QuickPickItem & { scope: string };
        const items: Item[] = [{ label: '$(git-branch) All branches', scope: '--all' }];
        for (const b of locals) items.push({ label: b, description: b === current ? 'current' : undefined, scope: b });
        for (const b of remotes) items.push({ label: '$(cloud) ' + b, scope: b });
        const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Show log for' });
        if (!pick) break;
        this.logScope = pick.scope;
        const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
        const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
        this.view?.webview.postMessage({ type: 'logData', commits });
        break;
      }
      case 'logPathFilter': {
        const p = await vscode.window.showInputBox({
          prompt: 'Filter Log by path (empty = all paths)',
          value: this.logPath,
          placeHolder: 'src/app/foo.ts',
        });
        if (p === undefined) break;
        this.logPath = p.trim();
        const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
        const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
        this.view?.webview.postMessage({ type: 'logData', commits });
        await this.postBranches();
        break;
      }
      case 'commitDetails': {
        const [files, body, committer, branches, tags] = await Promise.all([
          this.repo.git.commitFiles(m.hash),
          this.repo.git.commitBody(m.hash),
          this.repo.git.commitCommitter(m.hash),
          this.repo.git.branchesContaining(m.hash),
          this.repo.git.tagsContaining(m.hash),
        ]);
        this.view?.webview.postMessage({ type: 'commitDetailsData', hash: m.hash, files, body, committer, branches, tags });
        break;
      }
      case 'openRevDiff':
        await this.openRevDiff(m.hash, m.parent, m.path);
        break;
      case 'copyHash':
        await vscode.env.clipboard.writeText(m.hash);
        vscode.window.showInformationMessage(`JeGit: copied ${m.hash.slice(0, 10)}`);
        break;
      case 'copySubject':
        await vscode.env.clipboard.writeText(m.text);
        vscode.window.showInformationMessage('JeGit: commit subject copied to clipboard.');
        break;
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
      case 'branchesContaining': {
        const containing = await this.repo.git.branchesContaining(m.hash);
        if (!containing.length) {
          vscode.window.showInformationMessage(`JeGit: no local branch contains ${m.hash.slice(0, 10)}.`);
          break;
        }
        const pick = await vscode.window.showQuickPick(containing, {
          title: `Branches containing ${m.hash.slice(0, 10)}`,
          placeHolder: 'Select a branch to show its history',
        });
        if (pick) {
          this.logScope = pick;
          const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
          const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
          this.view?.webview.postMessage({ type: 'logData', commits });
          await this.postBranches();
        }
        break;
      }
      case 'tagsContaining': {
        const tags = await this.repo.git.tagsContaining(m.hash);
        if (!tags.length) {
          vscode.window.showInformationMessage(`JeGit: no tag contains ${m.hash.slice(0, 10)}.`);
          break;
        }
        const pick = await vscode.window.showQuickPick(tags, {
          title: `Tags containing ${m.hash.slice(0, 10)}`,
          placeHolder: 'Select a tag to show its history',
        });
        if (pick) {
          this.logScope = pick;
          const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
          const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
          this.view?.webview.postMessage({ type: 'logData', commits });
          await this.postBranches();
        }
        break;
      }
      case 'openCommitRemote': {
        const remotes = await this.repo.git.remotesList();
        const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
        const web = origin ? toWebUrl(origin.url) : '';
        if (!web) {
          vscode.window.showInformationMessage('JeGit: could not determine the remote web URL.');
          break;
        }
        await vscode.env.openExternal(vscode.Uri.parse(commitWebUrl(web, m.hash)));
        break;
      }
      case 'checkoutRev':
        await this.runLogOp(() => this.repo.git.checkout(m.hash), `checked out ${m.hash.slice(0, 7)} (detached)`);
        break;
      case 'newBranchAt': {
        const name = await vscode.window.showInputBox({ prompt: `New branch at ${m.hash.slice(0, 7)}`, placeHolder: 'feature/x' });
        if (!name) break;
        await this.runLogOp(() => this.repo.git.checkoutNew(name.trim(), m.hash), `created ${name.trim()}`);
        break;
      }
      case 'cherryPick':
        await this.runLogOp(() => this.repo.git.cherryPick(m.hash), `cherry-picked ${m.hash.slice(0, 7)}`);
        break;
      case 'revertCommit':
        await this.runLogOp(() => this.repo.git.revert(m.hash), `reverted ${m.hash.slice(0, 7)}`);
        break;
      case 'resetTo': {
        type ModeItem = vscode.QuickPickItem & { mode: 'soft' | 'mixed' | 'hard' };
        const items: ModeItem[] = [
          { label: 'Soft', description: 'keep all changes staged', mode: 'soft' },
          { label: 'Mixed', description: 'keep changes, unstaged', mode: 'mixed' },
          { label: 'Hard', description: 'discard all local changes', mode: 'hard' },
        ];
        const choice = await vscode.window.showQuickPick(items, {
          placeHolder: `Reset ${this.repo.branch} to ${m.hash.slice(0, 7)}`,
        });
        if (!choice) break;
        if (choice.mode === 'hard') {
          const ok = await vscode.window.showWarningMessage(
            'Hard reset will discard local changes. Continue?',
            { modal: true },
            'Reset',
          );
          if (ok !== 'Reset') break;
        }
        await this.runLogOp(() => this.repo.git.reset(m.hash, choice.mode), `reset to ${m.hash.slice(0, 7)}`);
        break;
      }
      case 'editMessage': {
        const head = await this.repo.git.headHash();
        const current = await this.repo.git.commitBody(m.hash);
        const message = await vscode.window.showInputBox({ prompt: 'Edit commit message', value: current });
        if (message === undefined || !message.trim()) break;
        if (m.hash === head) {
          await this.runLogOp(() => this.repo.git.amendMessage(message.trim()), 'reworded the latest commit');
        } else {
          await this.runLogOp(
            () => this.repo.git.rebaseAction(`${m.hash}~1`, m.hash, 'reword', this.rebaseScript(), message.trim()),
            `reworded ${m.hash.slice(0, 7)}`,
          );
        }
        break;
      }
      case 'dropCommit': {
        const ok = await vscode.window.showWarningMessage(
          `Drop commit ${m.hash.slice(0, 7)}? Its changes will be discarded.`,
          { modal: true },
          'Drop',
        );
        if (ok !== 'Drop') break;
        const head = await this.repo.git.headHash();
        if (m.hash === head) {
          await this.runLogOp(() => this.repo.git.resetHard(`${m.hash}~1`), `dropped ${m.hash.slice(0, 7)}`);
        } else {
          await this.runLogOp(
            () => this.repo.git.rebaseAction(`${m.hash}~1`, m.hash, 'drop', this.rebaseScript()),
            `dropped ${m.hash.slice(0, 7)}`,
          );
        }
        break;
      }
      case 'fixupCommit':
        await this.runLogOp(
          () => this.repo.git.rebaseAction(`${m.hash}~2`, m.hash, 'fixup', this.rebaseScript()),
          `fixed up ${m.hash.slice(0, 7)} into its parent`,
        );
        break;
      case 'interactiveRebase': {
        await showRebaseDialog(this.context, this.repo, m.hash);
        const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
        const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
        this.view?.webview.postMessage({ type: 'logData', commits });
        break;
      }
      case 'undoCommit': {
        const head = await this.repo.git.headHash();
        if (m.hash !== head) {
          vscode.window.showInformationMessage('JeGit: only the latest commit can be undone.');
          break;
        }
        const ok = await vscode.window.showWarningMessage(
          'Undo the last commit? Its changes return to Local Changes.',
          { modal: true },
          'Undo Commit',
        );
        if (ok !== 'Undo Commit') break;
        await this.runLogOp(() => this.repo.git.undoLastCommit(), 'undid the last commit');
        break;
      }
      case 'squashTo': {
        const head = await this.repo.git.headHash();
        if (m.hash === head) {
          vscode.window.showInformationMessage('JeGit: pick an older commit; this squashes it and all newer commits into one.');
          break;
        }
        if (!(await this.repo.git.isAncestor(m.hash, 'HEAD'))) {
          vscode.window.showInformationMessage('JeGit: that commit is not in the current branch history.');
          break;
        }
        const combined = await this.repo.git.rangeMessages(`${m.hash}~1..HEAD`);
        const message = await vscode.window.showInputBox({
          prompt: `Squash ${m.hash.slice(0, 7)}..HEAD into one commit`,
          value: combined.split('\n')[0] || '',
        });
        if (!message || !message.trim()) break;
        await this.runLogOp(async () => {
          await this.repo.git.reset(`${m.hash}~1`, 'soft');
          await this.repo.git.commitIndex(message.trim());
        }, `squashed ${m.hash.slice(0, 7)}..HEAD`);
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
      case 'tagAt': {
        const name = await vscode.window.showInputBox({ prompt: 'New tag name', placeHolder: 'v1.0.0' });
        if (!name) break;
        const message = await vscode.window.showInputBox({ prompt: 'Tag message (optional, empty = lightweight tag)' });
        await this.runLogOp(
          () => this.repo.git.createTag(name.trim(), m.hash, message?.trim() || undefined),
          `created tag ${name.trim()}`,
        );
        break;
      }
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

  private async openRevDiff(hash: string, parent: string, rel: string): Promise<void> {
    const left = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + rel, query: parent });
    const right = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + rel, query: hash });
    const name = rel.split('/').pop() ?? rel;
    const sh = (h: string) => (h ? h.slice(0, 7) : '∅');
    await vscode.commands.executeCommand('vscode.diff', left, right, `${name} (${sh(parent)} <-> ${sh(hash)})`);
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
      const limit = vscode.workspace.getConfiguration('jegit').get('log.maxCount', 400);
      const commits = await this.repo.git.log(limit, this.logScope, this.logPath);
      this.view?.webview.postMessage({ type: 'logData', commits });
    }
  }

}
