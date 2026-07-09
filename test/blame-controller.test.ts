import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { BlameController } from '../src/ui/blame';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;

const blameLines = [
  { hash: 'a'.repeat(40), author: 'Dev One', email: 'd1@e', date: '2026-07-01', summary: 'Fix a' },
  { hash: 'b'.repeat(40), author: 'Dev Two', email: 'd2@e', date: '2026-01-01', summary: 'Fix b' },
];

function makeEditor(lineCount = 2) {
  return {
    document: {
      uri: { scheme: 'file', fsPath: 'D:/repo/src/a.ts', toString: () => 'file:///repo/src/a.ts' },
      lineCount,
    },
    setDecorations: vi.fn(),
  };
}

function makeRepo(rel = 'src/a.ts', blame: unknown[] = blameLines): Repository {
  return {
    relPathOf: () => rel,
    git: { blame: vi.fn(async () => blame) },
  } as unknown as Repository;
}

describe('BlameController', () => {
  beforeEach(() => {
    win.showInformationMessage = async () => undefined;
  });

  it('annotates each line with author, date and an age color', async () => {
    const editor = makeEditor();
    const ctrl = new BlameController(makeRepo());
    await ctrl.toggle(editor as never);
    const [, options] = editor.setDecorations.mock.calls[0];
    expect(options).toHaveLength(2);
    expect(options[0].renderOptions.before.contentText).toContain('Dev One');
    expect(options[0].renderOptions.before.contentText).toContain('2026-07-01');
    expect(options[0].renderOptions.before.color).toMatch(/^hsl\(/);
    expect(options[0].renderOptions.before.color).not.toBe(options[1].renderOptions.before.color);
  });

  it('clears the annotation on the second toggle', async () => {
    const editor = makeEditor();
    const ctrl = new BlameController(makeRepo());
    await ctrl.toggle(editor as never);
    await ctrl.toggle(editor as never);
    const last = editor.setDecorations.mock.calls.at(-1);
    expect(last![1]).toEqual([]);
  });

  it('refuses files outside the repository', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const editor = makeEditor();
    const ctrl = new BlameController(makeRepo('../outside.ts'));
    await ctrl.toggle(editor as never);
    expect(info).toHaveBeenCalled();
    expect(editor.setDecorations).not.toHaveBeenCalled();
  });

  it('reports untracked files without blame data', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const editor = makeEditor();
    const ctrl = new BlameController(makeRepo('src/a.ts', []));
    await ctrl.toggle(editor as never);
    expect(info).toHaveBeenCalled();
    expect(editor.setDecorations).not.toHaveBeenCalled();
  });
});
