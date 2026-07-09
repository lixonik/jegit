import * as vscode from 'vscode';
import * as path from 'path';
import { Git } from './git/git';
import { registerBootstrapCommands } from './commands/bootstrap';
import { registerPatchCommands } from './commands/patch';
import { registerOperationCommands } from './commands/operations';
import { registerRemoteCommands } from './commands/remote';
import { registerFileCommands } from './commands/file';
import { registerRepositoryCommands } from './commands/repository';
import { ChangelistStore } from './model/changelistStore';
import { ShelfStore } from './model/shelfStore';
import { Repository } from './model/repository';
import { registerContentProviders } from './ui/quickDiff';
import { VersionControlView } from './ui/versionControlView';
import { createBranchStatusBar } from './ui/statusBar';

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

  registerRepositoryCommands(context, repo, view);
  registerRemoteCommands(context, repo);
  registerPatchCommands(context, repo);
  registerFileCommands(context, repo);
  registerOperationCommands(context, repo);

  context.subscriptions.push(createBranchStatusBar(repo));

  await repo.refresh();

  // Reveal the jegit panel so it is discoverable instead of hidden behind the
  // Terminal tab in the bottom panel.
  if (vscode.workspace.getConfiguration('jegit').get('panel.autoReveal', true)) {
    void vscode.commands.executeCommand(`${VersionControlView.viewId}.focus`);
  }
}

export function deactivate(): void {}
