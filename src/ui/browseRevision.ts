import * as vscode from 'vscode';
import type { Repository } from '../model/repository';
import { REV_SCHEME } from './quickDiff';
import { isEmpty, isNil } from '../util/guards';

export async function browseFilesAt(repo: Repository, rev: string): Promise<void> {
  const files = await repo.git.lsTree(rev);
  if (isEmpty(files)) {
    vscode.window.showInformationMessage('JeGit: no files at that revision (or revision not found).');
    return;
  }
  const file = await vscode.window.showQuickPick(files, { placeHolder: `Files at ${rev} -- open one` });
  if (isNil(file)) return;
  const uri = vscode.Uri.from({ scheme: REV_SCHEME, path: '/' + file, query: rev });
  await vscode.commands.executeCommand('vscode.open', uri);
}
