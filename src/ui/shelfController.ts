import * as vscode from 'vscode';
import type { Repository } from '../model/repository';
import type { Incoming } from '../model/webviewMessages';
import { patchSectionFor } from '../util/diff';
import { isEmpty, isNil } from '../util/guards';

export type PostMessage = (message: object) => void;

/** Handles the Shelf tab's webview messages. */
export class ShelfController {
  constructor(
    private readonly repo: Repository,
    private readonly post: PostMessage,
  ) {}

  postShelf(): void {
    this.post({ type: 'shelfData', entries: this.repo.shelves() });
  }

  async handle(m: Incoming): Promise<boolean> {
    switch (m.type) {
      case 'requestShelf':
        this.postShelf();
        return true;
      case 'shelve':
        await this.shelve(m.items);
        return true;
      case 'unshelve':
        await this.unshelve(m.id, !!m.keep);
        return true;
      case 'renameShelf':
        await this.renameShelf(m.id);
        return true;
      case 'deleteShelf':
        await this.deleteShelf(m.id);
        return true;
      case 'shelfDiff':
        await this.showPatch(m.id);
        return true;
      case 'shelfFileDiff':
        await this.showFileDiff(m.id, m.path);
        return true;
      case 'unshelveFile':
        await this.unshelveFile(m.id, m.path);
        return true;
      default:
        return false;
    }
  }

  private async shelve(items: { path: string; untracked: boolean }[]): Promise<void> {
    if (isNil(items) || isEmpty(items)) {
      vscode.window.showWarningMessage('JeGit: select files to shelve.');
      return;
    }
    const def = this.repo.store.getChangelist(this.repo.store.activeId)?.name ?? 'Shelved changes';
    const name = await vscode.window.showInputBox({ prompt: 'Shelf name', value: def });
    if (name === undefined) return;
    try {
      await this.repo.shelve(name.trim() || def, items);
      this.postShelf();
      vscode.window.showInformationMessage(`JeGit: shelved ${items.length} file(s).`);
    } catch (err) {
      vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async unshelve(id: string, keep: boolean): Promise<void> {
    try {
      const res = await this.repo.unshelve(id, keep);
      this.postShelf();
      if (res === 'conflicts') {
        vscode.window.showWarningMessage(
          'JeGit: unshelved with conflicts -- resolve them, then commit. The shelf was kept.',
        );
      } else {
        vscode.window.showInformationMessage(keep ? 'JeGit: unshelved (shelf kept).' : 'JeGit: unshelved.');
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `JeGit: ${err instanceof Error ? err.message : String(err)} (patch may not apply cleanly)`,
      );
    }
  }

  private async renameShelf(id: string): Promise<void> {
    const entry = this.repo.shelves().find((e) => e.id === id);
    const name = await vscode.window.showInputBox({ prompt: 'Rename shelf', value: entry?.name });
    if (isNil(name) || isEmpty(name.trim())) return;
    await this.repo.renameShelf(id, name.trim());
    this.postShelf();
  }

  private async unshelveFile(id: string, rel: string): Promise<void> {
    try {
      const res = await this.repo.unshelveFile(id, rel);
      if (res === 'missing') {
        vscode.window.showInformationMessage('JeGit: no diff for that file in the shelf.');
        return;
      }
      this.postShelf();
      if (res === 'conflicts') {
        vscode.window.showWarningMessage('JeGit: unshelved with conflicts -- resolve them, then commit.');
      } else {
        vscode.window.showInformationMessage(`JeGit: unshelved ${rel} (shelf kept).`);
      }
    } catch (err) {
      vscode.window.showErrorMessage(
        `JeGit: ${err instanceof Error ? err.message : String(err)} (patch may not apply cleanly)`,
      );
    }
  }

  private async showPatch(id: string): Promise<void> {
    const patch = this.repo.shelfPatchText(id);
    if (isEmpty(patch.trim())) {
      vscode.window.showInformationMessage('JeGit: the shelf patch is empty or missing.');
      return;
    }
    const doc = await vscode.workspace.openTextDocument({ content: patch, language: 'diff' });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  private async showFileDiff(id: string, rel: string): Promise<void> {
    const section = patchSectionFor(this.repo.shelfPatchText(id), rel);
    if (isEmpty(section.trim())) {
      vscode.window.showInformationMessage('JeGit: no diff for that file in the shelf.');
      return;
    }
    const doc = await vscode.workspace.openTextDocument({ content: section, language: 'diff' });
    await vscode.window.showTextDocument(doc, { preview: true });
  }

  private async deleteShelf(id: string): Promise<void> {
    const ok = await vscode.window.showWarningMessage('Delete this shelf?', { modal: true }, 'Delete');
    if (ok !== 'Delete') return;
    await this.repo.deleteShelf(id);
    this.postShelf();
  }
}
