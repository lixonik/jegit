import * as vscode from 'vscode';
import { Git } from '../git/git';
import { guessCloneDirName } from '../util/remoteUrl';
import { isEmpty, isNil } from '../util/guards';

/** Init and Clone are registered unconditionally: they must work without a repo. */
export function registerBootstrapCommands(
  context: vscode.ExtensionContext,
  folder: vscode.WorkspaceFolder | undefined,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jegit.init', () => initRepository(folder)),
    vscode.commands.registerCommand('jegit.clone', () => cloneRepository()),
  );
}

async function initRepository(folder: vscode.WorkspaceFolder | undefined): Promise<void> {
  if (isNil(folder)) {
    vscode.window.showInformationMessage('JeGit: open a folder first.');
    return;
  }
  if (await Git.findRepoRoot(folder.uri.fsPath)) {
    vscode.window.showInformationMessage('JeGit: this folder is already inside a git repository.');
    return;
  }
  try {
    await Git.init(folder.uri.fsPath);
    const reload = await vscode.window.showInformationMessage(
      'JeGit: git repository created. Reload the window to activate JeGit?',
      'Reload',
    );
    if (reload === 'Reload') await vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: git init failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function cloneRepository(): Promise<void> {
  const url = await vscode.window.showInputBox({
    prompt: 'Repository URL to clone',
    placeHolder: 'https://github.com/user/repo.git',
  });
  if (isNil(url) || isEmpty(url.trim())) return;
  const guess = guessCloneDirName(url);
  const parents = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Clone Here',
  });
  if (isNil(parents) || isEmpty(parents)) return;
  try {
    const target = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `JeGit: cloning ${guess}...` },
      () => Git.clone(url.trim(), parents[0].fsPath, guess),
    );
    const open = await vscode.window.showInformationMessage(`JeGit: cloned to ${target}.`, 'Open', 'Open in New Window');
    if (open) {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target), {
        forceNewWindow: open === 'Open in New Window',
      });
    }
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: clone failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
