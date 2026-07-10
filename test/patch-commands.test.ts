import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { registerPatchCommands } from '../src/commands/patch';
import type { Repository } from '../src/model/repository';

type Handler = () => Promise<void>;
const win = vscode.window as unknown as Record<string, unknown>;
const cmd = vscode.commands as unknown as Record<string, unknown>;
const env = vscode.env as unknown as { clipboard: { readText: () => Promise<string> } };

function register(repo: Repository) {
  const handlers: Record<string, Handler> = {};
  cmd.registerCommand = (id: string, fn: Handler) => {
    handlers[id] = fn;
    return { dispose: () => undefined };
  };
  registerPatchCommands({ subscriptions: [] } as never, repo);
  return handlers;
}

function makeRepo(overrides: Record<string, unknown> = {}): Repository {
  return {
    git: { applyPatch: vi.fn(async () => undefined), ...overrides },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('patch commands', () => {
  beforeEach(() => {
    win.showOpenDialog = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('applies a picked patch file and refreshes', async () => {
    const repo = makeRepo();
    win.showOpenDialog = async () => [{ fsPath: 'D:/p.patch' }];
    const handlers = register(repo);
    await handlers['jegit.applyPatch']();
    expect(repo.git.applyPatch).toHaveBeenCalledWith('D:/p.patch');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('does nothing when the open dialog is cancelled', async () => {
    const repo = makeRepo();
    const handlers = register(repo);
    await handlers['jegit.applyPatch']();
    expect(repo.git.applyPatch).not.toHaveBeenCalled();
  });

  it('applies the clipboard text through a temp patch file', async () => {
    let applied = '';
    const repo = makeRepo({
      applyPatch: vi.fn(async (p: string) => {
        applied = fs.readFileSync(p, 'utf8');
      }),
    });
    env.clipboard.readText = async () => 'diff --git a/f b/f\n';
    const handlers = register(repo);
    await handlers['jegit.applyPatchClipboard']();
    expect(applied).toBe('diff --git a/f b/f\n');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('reports an empty clipboard instead of applying', async () => {
    const repo = makeRepo();
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const handlers = register(repo);
    await handlers['jegit.applyPatchClipboard']();
    expect(info).toHaveBeenCalled();
    expect(repo.git.applyPatch).not.toHaveBeenCalled();
  });
});
