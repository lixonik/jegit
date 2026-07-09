import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Repository } from '../model/repository';
import { isEmpty, isNil } from '../util/guards';

export function registerPatchCommands(context: vscode.ExtensionContext, repo: Repository): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jegit.applyPatch', () => applyPatchFromFile(repo)),
    vscode.commands.registerCommand('jegit.applyPatchClipboard', () => applyPatchFromClipboard(repo)),
  );
}

async function applyPatchFromFile(repo: Repository): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { Patch: ['patch', 'diff'] },
    openLabel: 'Apply Patch',
  });
  if (isNil(uris) || isEmpty(uris)) return;
  try {
    await repo.git.applyPatch(uris[0].fsPath);
    vscode.window.showInformationMessage('JeGit: patch applied.');
    await repo.refresh();
  } catch (err) {
    vscode.window.showErrorMessage(
      `JeGit: ${err instanceof Error ? err.message : String(err)} (patch may not apply cleanly)`,
    );
  }
}

async function applyPatchFromClipboard(repo: Repository): Promise<void> {
  const text = await vscode.env.clipboard.readText();
  if (isEmpty(text.trim())) {
    vscode.window.showInformationMessage('JeGit: clipboard has no patch.');
    return;
  }
  const tmp = path.join(os.tmpdir(), `jegit-clip-${Date.now()}.patch`);
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    await repo.git.applyPatch(tmp);
    vscode.window.showInformationMessage('JeGit: patch applied from clipboard.');
    await repo.refresh();
  } catch (err) {
    vscode.window.showErrorMessage(
      `JeGit: ${err instanceof Error ? err.message : String(err)} (patch may not apply cleanly)`,
    );
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
