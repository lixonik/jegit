import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerOperationCommands } from '../src/commands/operations';
import type { Repository } from '../src/model/repository';

type Handler = () => Promise<void>;
const win = vscode.window as unknown as Record<string, unknown>;
const cmd = vscode.commands as unknown as Record<string, unknown>;

function register(repo: Repository) {
  const handlers: Record<string, Handler> = {};
  cmd.registerCommand = (id: string, fn: Handler) => {
    handlers[id] = fn;
    return { dispose: () => undefined };
  };
  registerOperationCommands({ subscriptions: [] } as never, repo);
  return handlers;
}

function makeRepo(operation: string | null): Repository {
  return {
    git: {
      operationState: vi.fn(async () => operation),
      continueOperation: vi.fn(async () => undefined),
      abortOperation: vi.fn(async () => undefined),
      skipRebase: vi.fn(async () => undefined),
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('operation commands', () => {
  beforeEach(() => {
    win.showInformationMessage = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('reports when there is nothing to continue', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const repo = makeRepo(null);
    const handlers = register(repo);
    await handlers['jegit.continueOperation']();
    expect(info).toHaveBeenCalled();
    expect(repo.git.continueOperation).not.toHaveBeenCalled();
  });

  it('continues the detected operation and refreshes', async () => {
    const repo = makeRepo('merge');
    const handlers = register(repo);
    await handlers['jegit.continueOperation']();
    expect(repo.git.continueOperation).toHaveBeenCalledWith('merge');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('aborts only after confirmation', async () => {
    const repo = makeRepo('rebase');
    const handlers = register(repo);
    await handlers['jegit.abortOperation']();
    expect(repo.git.abortOperation).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Abort';
    await handlers['jegit.abortOperation']();
    expect(repo.git.abortOperation).toHaveBeenCalledWith('rebase');
  });

  it('skips a commit only during a rebase', async () => {
    const merging = makeRepo('merge');
    const handlers = register(merging);
    await handlers['jegit.skipCommit']();
    expect(merging.git.skipRebase).not.toHaveBeenCalled();

    const rebasing = makeRepo('rebase');
    const rebaseHandlers = register(rebasing);
    await rebaseHandlers['jegit.skipCommit']();
    expect(rebasing.git.skipRebase).toHaveBeenCalled();
  });
});
