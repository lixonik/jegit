import * as vscode from 'vscode';
import type { Repository } from '../model/repository';
import { VersionControlView } from '../ui/versionControlView';
import { showBranches } from '../ui/branches';
import { manageRemotes } from '../ui/remotes';
import { manageWorktrees } from '../ui/worktrees';
import { stashChanges, unstash } from '../ui/stash';
import { showMergeResolver } from '../ui/mergeResolver';
import { browseFilesAt } from '../ui/browseRevision';
import { isConflicted } from '../util/status';
import { isDefined, isEmpty, isNil, notEmpty } from '../util/guards';

export function registerRepositoryCommands(
  context: vscode.ExtensionContext,
  repo: Repository,
  view: VersionControlView,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jegit.refresh', () => repo.refresh()),
    vscode.commands.registerCommand('jegit.newChangelist', () => newChangelist(repo)),
    vscode.commands.registerCommand('jegit.branches', () => showBranches(repo)),
    vscode.commands.registerCommand('jegit.manageRemotes', () => manageRemotes(repo)),
    vscode.commands.registerCommand('jegit.worktrees', () => manageWorktrees(repo)),
    vscode.commands.registerCommand('jegit.newTag', () => createTag(repo)),
    vscode.commands.registerCommand('jegit.browseAtRevision', () => browseAtRevision(repo)),
    vscode.commands.registerCommand('jegit.resolveConflicts', () => resolveConflicts(context, repo)),
    vscode.commands.registerCommand('jegit.cleanupBranches', () => cleanupMergedBranches(repo)),
    vscode.commands.registerCommand('jegit.stash', () => stashChanges(repo)),
    vscode.commands.registerCommand('jegit.unstash', () => unstash(repo)),
    vscode.commands.registerCommand('jegit.showCommitInLog', (hash: string) => view.revealCommitInLog(hash)),
    vscode.commands.registerCommand('jegit.focus', () =>
      vscode.commands.executeCommand(`${VersionControlView.viewId}.focus`),
    ),
  );
}

async function newChangelist(repo: Repository): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'New changelist name', placeHolder: 'Feature X' });
  if (isDefined(name) && notEmpty(name.trim())) await repo.newChangelist(name.trim());
}

async function createTag(repo: Repository): Promise<void> {
  const name = await vscode.window.showInputBox({ prompt: 'New tag name', placeHolder: 'v1.0.0' });
  if (isNil(name) || isEmpty(name)) return;
  const message = await vscode.window.showInputBox({ prompt: 'Tag message (optional, empty = lightweight tag)' });
  try {
    await repo.git.tag.create(name.trim(), '', message?.trim() || undefined);
    vscode.window.showInformationMessage(`JeGit: created tag ${name.trim()}.`);
    await repo.refresh();
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function browseAtRevision(repo: Repository): Promise<void> {
  const rev = await vscode.window.showInputBox({
    prompt: 'Browse repository at revision',
    placeHolder: 'branch, tag, or commit hash',
    value: 'HEAD',
  });
  if (isNil(rev) || isEmpty(rev.trim())) return;
  await browseFilesAt(repo, rev.trim());
}

async function resolveConflicts(context: vscode.ExtensionContext, repo: Repository): Promise<void> {
  const status = await repo.git.status().catch(() => []);
  const conflicted = status.filter((f) => isConflicted(f.status));
  if (isEmpty(conflicted)) {
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
    placeHolder: `${conflicted.length} conflicted file(s) -- resolve one`,
  });
  if (isNil(pick)) return;
  const action = await vscode.window.showQuickPick(
    ['$(git-merge) Merge...', '$(arrow-left) Accept Yours', '$(arrow-right) Accept Theirs'],
    { placeHolder: `Resolve ${pick.rel}` },
  );
  if (isNil(action)) return;
  if (action.endsWith('Merge...')) {
    await showMergeResolver(context, repo, pick.rel);
    return;
  }
  const side = action.endsWith('Accept Yours') ? 'ours' : 'theirs';
  try {
    await repo.git.checkoutSide(pick.rel, side);
    await repo.git.add([pick.rel]);
    vscode.window.showInformationMessage(`JeGit: resolved ${pick.rel} using ${side}.`);
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
  await resolveConflicts(context, repo);
}

async function cleanupMergedBranches(repo: Repository): Promise<void> {
  const { current } = await repo.git.branches();
  const merged = (await repo.git.mergedBranches()).filter((b) => b !== current && b !== 'main' && b !== 'master');
  if (isEmpty(merged)) {
    vscode.window.showInformationMessage('JeGit: no merged branches to clean up.');
    return;
  }
  const picks = await vscode.window.showQuickPick(
    merged.map((b) => ({ label: b, picked: true })),
    { canPickMany: true, placeHolder: 'Select merged branches to delete' },
  );
  if (isNil(picks) || isEmpty(picks)) return;
  try {
    for (const p of picks) await repo.git.deleteBranch(p.label, false);
    vscode.window.showInformationMessage(`JeGit: deleted ${picks.length} merged branch(es).`);
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}
