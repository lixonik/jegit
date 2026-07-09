import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerRemoteCommands } from '../src/commands/remote';
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
  registerRemoteCommands({ subscriptions: [] } as never, repo);
  return handlers;
}

function makeRepo(gitOverrides: Record<string, unknown> = {}): Repository {
  return {
    git: {
      fetch: vi.fn(async () => undefined),
      hasUpstream: vi.fn(async () => true),
      pushForce: vi.fn(async () => undefined),
      pushTags: vi.fn(async () => undefined),
      upstreamRef: vi.fn(async () => 'origin/main'),
      branches: vi.fn(async () => ({ current: 'main', locals: ['main'], remotes: [] })),
      resetHard: vi.fn(async () => undefined),
      isShallow: vi.fn(async () => false),
      unshallow: vi.fn(async () => undefined),
      ...gitOverrides,
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('remote commands', () => {
  beforeEach(() => {
    win.showInformationMessage = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('refuses to force push without an upstream', async () => {
    const repo = makeRepo({ hasUpstream: vi.fn(async () => false) });
    const handlers = register(repo);
    await handlers['jegit.pushForce']();
    expect(repo.git.pushForce).not.toHaveBeenCalled();
  });

  it('force pushes only after the modal confirmation', async () => {
    const repo = makeRepo();
    const handlers = register(repo);
    await handlers['jegit.pushForce']();
    expect(repo.git.pushForce).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Force Push';
    await handlers['jegit.pushForce']();
    expect(repo.git.pushForce).toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('reports when there is no upstream to reset to', async () => {
    const repo = makeRepo({ upstreamRef: vi.fn(async () => '') });
    const handlers = register(repo);
    await handlers['jegit.resetToRemote']();
    expect(repo.git.resetHard).not.toHaveBeenCalled();
  });

  it('resets to the upstream after confirmation, fetching first', async () => {
    const repo = makeRepo();
    win.showWarningMessage = async () => 'Reset';
    const handlers = register(repo);
    await handlers['jegit.resetToRemote']();
    expect(repo.git.fetch).toHaveBeenCalled();
    expect(repo.git.resetHard).toHaveBeenCalledWith('origin/main');
  });

  it('unshallows only a shallow repository', async () => {
    const repo = makeRepo();
    const handlers = register(repo);
    await handlers['jegit.unshallow']();
    expect(repo.git.unshallow).not.toHaveBeenCalled();

    const shallow = makeRepo({ isShallow: vi.fn(async () => true) });
    const shallowHandlers = register(shallow);
    await shallowHandlers['jegit.unshallow']();
    expect(shallow.git.unshallow).toHaveBeenCalled();
  });
});
