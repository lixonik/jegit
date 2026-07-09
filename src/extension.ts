import * as vscode from 'vscode';
import * as path from 'path';
import { Git } from './git/git';
import { registerBootstrapCommands } from './commands/bootstrap';
import { registerPatchCommands } from './commands/patch';
import { registerOperationCommands } from './commands/operations';
import { registerRemoteCommands } from './commands/remote';
import { registerFileCommands } from './commands/file';
import { ChangelistStore } from './model/changelistStore';
import { ShelfStore } from './model/shelfStore';
import { Repository } from './model/repository';
import { registerContentProviders, REV_SCHEME } from './ui/quickDiff';
import { VersionControlView } from './ui/versionControlView';
import { showBranches } from './ui/branches';
import { manageRemotes } from './ui/remotes';
import { manageWorktrees } from './ui/worktrees';
import { stashChanges, unstash } from './ui/stash';
import { showMergeResolver } from './ui/mergeResolver';
import { isConflicted } from './util/status';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];

  registerBootstrapCommands(context, folder);

  if (!folder) return;

  const repoRoot = await Git.findRepoRoot(folder.uri.fsPath);
  if (!repoRoot) return; // not a git repo -- jegit stays dormant

  const git = new Git(repoRoot);
  const store = new ChangelistStore(context.workspaceState);
  const storageBase = (context.storageUri ?? context.globalStorageUri).fsPath;
  const shelf = new ShelfStore(context.workspaceState, path.join(storageBase, 'shelf'));
  const repo = new Repository(git, store, shelf);
  context.subscriptions.push(repo);
  context.subscriptions.push(registerContentProviders(git));

  const view = new VersionControlView(context, repo);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VersionControlView.viewId, view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const branchItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  branchItem.command = 'jegit.branches';
  branchItem.tooltip = 'JeGit: Git branches';
  context.subscriptions.push(branchItem);
  const updateBranch = () => {
    const s = repo.sync;
    const ab = s && (s.ahead || s.behind) ? `  $(arrow-down)${s.behind} $(arrow-up)${s.ahead}` : '';
    branchItem.text = repo.branch ? `$(git-branch) ${repo.branch}${ab}` : '$(git-branch) JeGit';
    branchItem.show();
  };
  context.subscriptions.push(repo.onDidChange(updateBranch));

  const reg = (id: string, fn: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('jegit.refresh', () => repo.refresh());
  reg('jegit.newChangelist', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'New changelist name', placeHolder: 'Feature X' });
    if (name) await repo.newChangelist(name.trim());
  });
  reg('jegit.branches', () => showBranches(repo));
  reg('jegit.manageRemotes', () => manageRemotes(repo));
  reg('jegit.worktrees', () => manageWorktrees(repo));
  reg('jegit.newTag', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'New tag name', placeHolder: 'v1.0.0' });
    if (!name) return;
    const message = await vscode.window.showInputBox({ prompt: 'Tag message (optional, empty = lightweight tag)' });
    try {
      await git.createTag(name.trim(), '', message?.trim() || undefined);
      vscode.window.showInformationMessage(`JeGit: created tag ${name.trim()}.`);
      await repo.refresh();
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  registerRemoteCommands(context, repo);
  registerPatchCommands(context, repo);

  registerFileCommands(context, repo);
  reg('jegit.showCommitInLog', (hash: string) => view.revealCommitInLog(hash));

  registerOperationCommands(context, repo);
  reg('jegit.browseAtRevision', async () => {
    const rev = await vscode.window.showInputBox({
      prompt: 'Browse repository at revision',
      placeHolder: 'branch, tag, or commit hash',
      value: 'HEAD',
    });
    if (!rev || !rev.trim()) return;
    const files = await git.lsTree(rev.trim());
    if (!files.length) {
      vscode.window.showInformationMessage('JeGit: no files at that revision (or revision not found).');
      return;
    }
    const file = await vscode.window.showQuickPick(files, { placeHolder: `Files at ${rev.trim()} -- open one` });
    if (!file) return;
    const uri = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file, query: rev.trim() });
    await vscode.commands.executeCommand('vscode.open', uri);
  });
  reg('jegit.resolveConflicts', async () => {
    const status = await git.status().catch(() => []);
    const conflicted = status.filter((f) => isConflicted(f.status));
    if (!conflicted.length) {
      vscode.window.showInformationMessage('JeGit: no conflicts to resolve.');
      return;
    }
    type Item = vscode.QuickPickItem & { rel: string };
    const items: Item[] = conflicted.map((f) => ({
      label: '$(git-merge) ' + f.path,
      description: f.status,
      rel: f.path,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: `${conflicted.length} conflicted file(s) -- open in the merge resolver`,
    });
    if (!pick) return;
    await showMergeResolver(context, repo, pick.rel);
  });
  reg('jegit.cleanupBranches', async () => {
    const { current } = await git.branches();
    const merged = (await git.mergedBranches()).filter((b) => b !== current && b !== 'main' && b !== 'master');
    if (!merged.length) {
      vscode.window.showInformationMessage('JeGit: no merged branches to clean up.');
      return;
    }
    const picks = await vscode.window.showQuickPick(
      merged.map((b) => ({ label: b, picked: true })),
      { canPickMany: true, placeHolder: 'Select merged branches to delete' },
    );
    if (!picks || !picks.length) return;
    try {
      for (const p of picks) await git.deleteBranch(p.label, false);
      vscode.window.showInformationMessage(`JeGit: deleted ${picks.length} merged branch(es).`);
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await repo.refresh();
    }
  });
  reg('jegit.stash', () => stashChanges(repo));
  reg('jegit.unstash', () => unstash(repo));
  reg('jegit.focus', () => vscode.commands.executeCommand(`${VersionControlView.viewId}.focus`));

  await repo.refresh();
  updateBranch();

  // Reveal the jegit panel so it is discoverable instead of hidden behind the
  // Terminal tab in the bottom panel.
  if (vscode.workspace.getConfiguration('jegit').get('panel.autoReveal', true)) {
    void vscode.commands.executeCommand(`${VersionControlView.viewId}.focus`);
  }
}

export function deactivate(): void {}
