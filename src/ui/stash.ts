import * as vscode from 'vscode';
import { Repository } from '../model/repository';
import { REV_SCHEME } from './quickDiff';

/** git stash push, with an optional message. */
export async function stashChanges(repo: Repository): Promise<void> {
  const message = await vscode.window.showInputBox({ prompt: 'Stash message (optional)', placeHolder: 'WIP' });
  if (message === undefined) return;
  try {
    await repo.git.stashPush(message.trim());
    vscode.window.showInformationMessage('JeGit: changes stashed.');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

/** Pick a stash and apply / pop / drop it. */
export async function unstash(repo: Repository): Promise<void> {
  const stashes = await repo.git.stashList();
  if (!stashes.length) {
    vscode.window.showInformationMessage('JeGit: no stashes.');
    return;
  }
  type Item = vscode.QuickPickItem & { ref: string };
  const items: Item[] = stashes.map((s) => ({ label: s.ref, description: s.subject, ref: s.ref }));
  if (stashes.length > 1) items.push({ label: '$(trash) Clear All Stashes', ref: '__clear__' });
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select a stash' });
  if (!pick) return;
  if (pick.ref === '__clear__') {
    const ok = await vscode.window.showWarningMessage('Drop all stashes?', { modal: true }, 'Clear All');
    if (ok !== 'Clear All') return;
    try {
      await repo.git.stashClear();
      vscode.window.showInformationMessage('JeGit: cleared all stashes.');
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await repo.refresh();
    }
    return;
  }

  type Act = vscode.QuickPickItem & { a: 'apply' | 'pop' | 'drop' | 'branch' | 'files' };
  const action = await vscode.window.showQuickPick<Act>(
    [
      { label: '$(diff) Show Changed Files', a: 'files' },
      { label: '$(check) Apply (keep stash)', a: 'apply' },
      { label: '$(arrow-down) Pop (apply and remove)', a: 'pop' },
      { label: '$(git-branch) Unstash to New Branch...', a: 'branch' },
      { label: '$(trash) Drop', a: 'drop' },
    ],
    { placeHolder: pick.ref },
  );
  if (!action) return;

  if (action.a === 'files') {
    const files = await repo.git.diffRefs(`${pick.ref}^`, pick.ref);
    if (!files.length) {
      vscode.window.showInformationMessage('JeGit: the stash has no tracked changes.');
      return;
    }
    type F = vscode.QuickPickItem & { path: string };
    const fileItems: F[] = files.map((f) => ({ label: f.path, description: f.status, path: f.path }));
    const file = await vscode.window.showQuickPick(fileItems, { placeHolder: `Files in ${pick.ref}` });
    if (!file) return;
    const left = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file.path, query: `${pick.ref}^` });
    const right = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file.path, query: pick.ref });
    const name = file.path.split('/').pop() ?? file.path;
    await vscode.commands.executeCommand('vscode.diff', left, right, `${name} (${pick.ref})`);
    return;
  }

  try {
    if (action.a === 'apply') {
      await repo.git.stashApply(pick.ref);
    } else if (action.a === 'pop') {
      await repo.git.stashPop(pick.ref);
    } else if (action.a === 'branch') {
      const name = await vscode.window.showInputBox({ prompt: 'New branch name for the stashed changes', placeHolder: 'feature/wip' });
      if (!name || !name.trim()) return;
      await repo.git.stashBranch(name.trim(), pick.ref);
    } else {
      const ok = await vscode.window.showWarningMessage(`Drop ${pick.ref}?`, { modal: true }, 'Drop');
      if (ok !== 'Drop') return;
      await repo.git.stashDrop(pick.ref);
    }
    vscode.window.showInformationMessage(`JeGit: stash ${action.a} done.`);
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}
