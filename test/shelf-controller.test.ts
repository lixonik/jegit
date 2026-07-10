import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { ShelfController } from '../src/ui/shelfController';
import type { Repository } from '../src/model/repository';
import type { Incoming } from '../src/model/webviewMessages';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;

function makeRepo(overrides: Record<string, unknown> = {}): Repository {
  return {
    shelves: () => [{ id: 's1', name: 'Shelf 1' }],
    store: { activeId: 'cl1', getChangelist: () => ({ id: 'cl1', name: 'Feature X' }) },
    shelve: vi.fn(async () => undefined),
    unshelve: vi.fn(async () => 'ok'),
    renameShelf: vi.fn(async () => undefined),
    deleteShelf: vi.fn(async () => undefined),
    shelfPatchText: vi.fn(
      () => 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
    ),
    ...overrides,
  } as unknown as Repository;
}

const oneFile = [{ path: 'a.ts', untracked: false }];

describe('ShelfController', () => {
  let posts: object[];
  const post = (m: object) => posts.push(m);

  beforeEach(() => {
    posts = [];
    win.showInputBox = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('ignores messages of other tabs', async () => {
    const ctrl = new ShelfController(makeRepo(), post);
    expect(await ctrl.handle({ type: 'refresh' } as Incoming)).toBe(false);
    expect(posts).toEqual([]);
  });

  it('answers requestShelf with the shelf list', async () => {
    const ctrl = new ShelfController(makeRepo(), post);
    expect(await ctrl.handle({ type: 'requestShelf' } as Incoming)).toBe(true);
    expect(posts).toEqual([{ type: 'shelfData', entries: [{ id: 's1', name: 'Shelf 1' }] }]);
  });

  it('warns when shelving an empty selection', async () => {
    const repo = makeRepo();
    const warn = vi.fn(async () => undefined);
    win.showWarningMessage = warn;
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'shelve', items: [] } as Incoming);
    expect(warn).toHaveBeenCalled();
    expect(repo.shelve).not.toHaveBeenCalled();
  });

  it('shelves the selection under the entered name and reposts the shelf', async () => {
    const repo = makeRepo();
    win.showInputBox = async () => '  My shelf  ';
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'shelve', items: oneFile } as Incoming);
    expect(repo.shelve).toHaveBeenCalledWith('My shelf', oneFile);
    expect(posts).toContainEqual({ type: 'shelfData', entries: [{ id: 's1', name: 'Shelf 1' }] });
  });

  it('falls back to the active changelist name when the shelf name is blank', async () => {
    const repo = makeRepo();
    win.showInputBox = async () => '   ';
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'shelve', items: oneFile } as Incoming);
    expect(repo.shelve).toHaveBeenCalledWith('Feature X', oneFile);
  });

  it('does nothing when the shelf name prompt is cancelled', async () => {
    const repo = makeRepo();
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'shelve', items: oneFile } as Incoming);
    expect(repo.shelve).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
  });

  it('unshelves and reports conflicts without dropping the shelf', async () => {
    const repo = makeRepo({ unshelve: vi.fn(async () => 'conflicts') });
    const warn = vi.fn(async () => undefined);
    win.showWarningMessage = warn;
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'unshelve', id: 's1', keep: false } as Incoming);
    expect(repo.unshelve).toHaveBeenCalledWith('s1', false);
    expect(warn).toHaveBeenCalled();
  });

  it('renames a shelf with the trimmed input', async () => {
    const repo = makeRepo();
    win.showInputBox = async () => '  Renamed  ';
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'renameShelf', id: 's1' } as Incoming);
    expect(repo.renameShelf).toHaveBeenCalledWith('s1', 'Renamed');
  });

  it('keeps the name when the rename prompt is blank', async () => {
    const repo = makeRepo();
    win.showInputBox = async () => '   ';
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'renameShelf', id: 's1' } as Incoming);
    expect(repo.renameShelf).not.toHaveBeenCalled();
  });

  it('deletes a shelf only after confirmation', async () => {
    const repo = makeRepo();
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'deleteShelf', id: 's1' } as Incoming);
    expect(repo.deleteShelf).not.toHaveBeenCalled();
    win.showWarningMessage = async () => 'Delete';
    await ctrl.handle({ type: 'deleteShelf', id: 's1' } as Incoming);
    expect(repo.deleteShelf).toHaveBeenCalledWith('s1');
  });

  it('unshelves a single file and reposts the shelf', async () => {
    const repo = makeRepo({ unshelveFile: vi.fn(async () => 'clean') });
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'unshelveFile', id: 's1', path: 'src/a.ts' } as Incoming);
    expect(repo.unshelveFile).toHaveBeenCalledWith('s1', 'src/a.ts');
    expect(posts).toContainEqual({ type: 'shelfData', entries: [{ id: 's1', name: 'Shelf 1' }] });
    expect(info).toHaveBeenCalled();
  });

  it('reports a single-file unshelve miss without reposting', async () => {
    const repo = makeRepo({ unshelveFile: vi.fn(async () => 'missing') });
    const ctrl = new ShelfController(repo, post);
    await ctrl.handle({ type: 'unshelveFile', id: 's1', path: 'src/nope.ts' } as Incoming);
    expect(posts).toEqual([]);
  });

  it('shows a shelved file diff as a diff document', async () => {
    const shown: unknown[] = [];
    win.showTextDocument = async (doc: unknown) => {
      shown.push(doc);
      return undefined;
    };
    const ctrl = new ShelfController(makeRepo(), post);
    await ctrl.handle({ type: 'shelfFileDiff', id: 's1', path: 'src/a.ts' } as Incoming);
    expect(shown[0]).toEqual({
      content: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new',
      language: 'diff',
    });
  });

  it('reports when the shelf has no diff for the file', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const shown = vi.fn(async () => undefined);
    win.showTextDocument = shown;
    const ctrl = new ShelfController(makeRepo(), post);
    await ctrl.handle({ type: 'shelfFileDiff', id: 's1', path: 'src/other.ts' } as Incoming);
    expect(info).toHaveBeenCalled();
    expect(shown).not.toHaveBeenCalled();
  });
});
