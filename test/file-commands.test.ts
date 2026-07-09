import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerFileCommands } from '../src/commands/file';
import type { Repository } from '../src/model/repository';

type Handler = () => Promise<void>;
const win = vscode.window as unknown as Record<string, unknown>;
const cmd = vscode.commands as unknown as Record<string, unknown>;
const env = vscode.env as unknown as Record<string, unknown>;

function register(repo: Repository) {
  const handlers: Record<string, Handler> = {};
  cmd.registerCommand = (id: string, fn: Handler) => {
    handlers[id] = fn;
    return { dispose: () => undefined };
  };
  registerFileCommands({ subscriptions: [] } as never, repo);
  return handlers;
}

function makeRepo(overrides: Record<string, unknown> = {}): Repository {
  return {
    branch: 'main',
    relPathOf: () => 'src/a.ts',
    git: {
      remote: { list: vi.fn(async () => [{ name: 'origin', url: 'https://github.com/u/r.git' }]) },
      branches: vi.fn(async () => ({ current: 'main', locals: ['main', 'dev'], remotes: [] })),
      ...overrides,
    },
  } as unknown as Repository;
}

function setActiveEditor(scheme = 'file') {
  win.activeTextEditor = { document: { uri: { scheme, fsPath: 'D:/repo/src/a.ts' } } };
}

describe('file commands', () => {
  beforeEach(() => {
    win.activeTextEditor = undefined;
    win.showQuickPick = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    env.openExternal = vi.fn(async () => true);
  });

  it('asks to open a file first when there is no active editor', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const handlers = register(makeRepo());
    await handlers['jegit.openFileOnRemote']();
    expect(info).toHaveBeenCalled();
    expect(env.openExternal).not.toHaveBeenCalled();
  });

  it('opens the active file on the origin web url', async () => {
    setActiveEditor();
    const open = vi.fn(async () => true);
    env.openExternal = open;
    const handlers = register(makeRepo());
    await handlers['jegit.openFileOnRemote']();
    expect(open).toHaveBeenCalled();
    const uri = open.mock.calls[0][0] as { value?: string };
    expect(String(uri.value ?? uri)).toContain('github.com/u/r/blob/main/src/a.ts');
  });

  it('reports when no remote web url can be derived', async () => {
    setActiveEditor();
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const handlers = register(makeRepo({ remote: { list: vi.fn(async () => []) } }));
    await handlers['jegit.openFileOnRemote']();
    expect(info).toHaveBeenCalled();
    expect(env.openExternal).not.toHaveBeenCalled();
  });

  it('compares the active file with a picked branch via vscode.diff', async () => {
    setActiveEditor();
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    win.showQuickPick = async () => ({ label: 'dev' });
    const handlers = register(makeRepo());
    await handlers['jegit.compareFileWithBranch']();
    expect(exec).toHaveBeenCalled();
    expect(exec.mock.calls[0][0]).toBe('vscode.diff');
  });

  it('reports when there is no other branch to compare with', async () => {
    setActiveEditor();
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const handlers = register(
      makeRepo({ branches: vi.fn(async () => ({ current: 'main', locals: ['main'], remotes: [] })) }),
    );
    await handlers['jegit.compareFileWithBranch']();
    expect(info).toHaveBeenCalled();
  });
});
