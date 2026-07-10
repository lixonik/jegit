import * as vscode from 'vscode';
import type { Repository } from '../model/repository';
import { BlameController } from '../ui/blame';
import { showFileHistory } from '../ui/history';
import { REV_SCHEME } from '../ui/quickDiff';
import { toWebUrl, fileWebUrl } from '../util/remoteUrl';
import { isDefined, isEmpty, isNil } from '../util/guards';

export function registerFileCommands(context: vscode.ExtensionContext, repo: Repository): void {
  const blame = new BlameController(repo);
  context.subscriptions.push(blame);
  context.subscriptions.push(
    vscode.commands.registerCommand('jegit.toggleBlame', () => blame.toggle()),
    vscode.commands.registerCommand('jegit.fileHistory', () => showActiveFileHistory(repo)),
    vscode.commands.registerCommand('jegit.selectionHistory', () => showSelectionHistory(repo)),
    vscode.commands.registerCommand('jegit.openFileOnRemote', () => openActiveFileOnRemote(repo)),
    vscode.commands.registerCommand('jegit.compareFileWithBranch', () => compareActiveFileWithBranch(repo)),
  );
}

function activeFileUri(message: string): vscode.Uri | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  if (isNil(uri) || uri.scheme !== 'file') {
    vscode.window.showInformationMessage(message);
    return undefined;
  }
  return uri;
}

async function showActiveFileHistory(repo: Repository): Promise<void> {
  const uri = activeFileUri('JeGit: open a file to see its history.');
  if (isNil(uri)) return;
  await showFileHistory(repo, repo.relPathOf(uri));
}

async function showSelectionHistory(repo: Repository): Promise<void> {
  const uri = activeFileUri('JeGit: open a file to see the history of a selection.');
  const editor = vscode.window.activeTextEditor;
  if (isNil(uri) || isNil(editor)) return;
  const start = editor.selection.start.line + 1;
  const end = Math.max(editor.selection.end.line + 1, start);
  let text = '';
  try {
    text = await repo.git.logForLines(repo.relPathOf(uri), start, end);
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (isEmpty(text.trim())) {
    vscode.window.showInformationMessage('JeGit: no history for the selected lines.');
    return;
  }
  const doc = await vscode.workspace.openTextDocument({ content: text, language: 'diff' });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function openActiveFileOnRemote(repo: Repository): Promise<void> {
  const uri = activeFileUri('JeGit: open a file first.');
  if (isNil(uri)) return;
  const remotes = await repo.git.remote.list();
  const origin = remotes.find((r) => r.name === 'origin') ?? remotes[0];
  const web = isDefined(origin) ? toWebUrl(origin.url) : '';
  if (isEmpty(web)) {
    vscode.window.showInformationMessage('JeGit: could not determine the remote web URL.');
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(fileWebUrl(web, repo.branch || 'main', repo.relPathOf(uri))));
}

async function compareActiveFileWithBranch(repo: Repository): Promise<void> {
  const uri = activeFileUri('JeGit: open a file to compare.');
  if (isNil(uri)) return;
  const rel = repo.relPathOf(uri);
  const { current, locals, remotes } = await repo.git.branches();
  const items = [...locals, ...remotes].filter((b) => b !== current).map((b) => ({ label: b }));
  if (isEmpty(items)) {
    vscode.window.showInformationMessage('JeGit: no other branches to compare with.');
    return;
  }
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Compare ${rel.split('/').pop()} with branch`,
  });
  if (isNil(pick)) return;
  const left = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + rel, query: pick.label });
  const name = rel.split('/').pop() ?? rel;
  await vscode.commands.executeCommand('vscode.diff', left, uri, `${name} (${pick.label} <-> Working Tree)`);
}
