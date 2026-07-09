import * as vscode from 'vscode';
import type { Repository } from '../model/repository';
import { isNil } from '../util/guards';

export function registerOperationCommands(context: vscode.ExtensionContext, repo: Repository): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jegit.continueOperation', () => continueOperation(repo)),
    vscode.commands.registerCommand('jegit.abortOperation', () => abortOperation(repo)),
    vscode.commands.registerCommand('jegit.skipCommit', () => skipRebaseCommit(repo)),
  );
}

async function continueOperation(repo: Repository): Promise<void> {
  const op = await repo.git.operationState();
  if (isNil(op)) {
    vscode.window.showInformationMessage('JeGit: no merge/rebase/cherry-pick in progress.');
    return;
  }
  try {
    await repo.git.continueOperation(op);
    vscode.window.showInformationMessage(`JeGit: ${op} continued.`);
  } catch (err) {
    vscode.window.showErrorMessage(
      `JeGit: ${err instanceof Error ? err.message : String(err)} (resolve all conflicts first)`,
    );
  } finally {
    await repo.refresh();
  }
}

async function abortOperation(repo: Repository): Promise<void> {
  const op = await repo.git.operationState();
  if (isNil(op)) {
    vscode.window.showInformationMessage('JeGit: no merge/rebase/cherry-pick in progress.');
    return;
  }
  const ok = await vscode.window.showWarningMessage(`Abort the in-progress ${op}?`, { modal: true }, 'Abort');
  if (ok !== 'Abort') return;
  try {
    await repo.git.abortOperation(op);
    vscode.window.showInformationMessage(`JeGit: ${op} aborted.`);
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

async function skipRebaseCommit(repo: Repository): Promise<void> {
  if ((await repo.git.operationState()) !== 'rebase') {
    vscode.window.showInformationMessage('JeGit: skip is only available during a rebase.');
    return;
  }
  try {
    await repo.git.skipRebase();
    vscode.window.showInformationMessage('JeGit: skipped the current commit.');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}
