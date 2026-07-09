import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerRepositoryCommands } from '../src/commands/repository';
import type { Repository } from '../src/model/repository';
import type { VersionControlView } from '../src/ui/versionControlView';

type Handler = (...args: unknown[]) => Promise<void>;
const win = vscode.window as unknown as Record<string, unknown>;
const cmd = vscode.commands as unknown as Record<string, unknown>;

function register(repo: Repository) {
  const handlers: Record<string, Handler> = {};
  cmd.registerCommand = (id: string, fn: Handler) => {
    handlers[id] = fn;
    return { dispose: () => undefined };
  };
  const view = { revealCommitInLog: vi.fn(async () => undefined) } as unknown as VersionControlView;
  registerRepositoryCommands({ subscriptions: [] } as never, repo, view);
  return { handlers, view };
}

function makeRepo(gitOverrides: Record<string, unknown> = {}): Repository {
  return {
    newChangelist: vi.fn(async () => ({ id: 'cl2' })),
    refresh: vi.fn(async () => undefined),
    git: {
      tag: { create: vi.fn(async () => undefined) },
      lsTree: vi.fn(async () => ['src/a.ts']),
      status: vi.fn(async () => []),
      branches: vi.fn(async () => ({ current: 'main', locals: ['main'], remotes: [] })),
      mergedBranches: vi.fn(async () => ['main', 'master', 'feature/done']),
      deleteBranch: vi.fn(async () => undefined),
      ...gitOverrides,
    },
  } as unknown as Repository;
}

describe('repository commands', () => {
  beforeEach(() => {
    win.showInputBox = async () => undefined;
    win.showQuickPick = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    cmd.executeCommand = async () => undefined;
  });

  it('creates a changelist only from a non-blank name', async () => {
    const repo = makeRepo();
    const { handlers } = register(repo);
    await handlers['jegit.newChangelist']();
    expect(repo.newChangelist).not.toHaveBeenCalled();

    win.showInputBox = async () => '  Feature X  ';
    await handlers['jegit.newChangelist']();
    expect(repo.newChangelist).toHaveBeenCalledWith('Feature X');
  });

  it('creates an annotated tag from the prompts', async () => {
    const repo = makeRepo();
    const inputs = ['v1.0.0', 'release message'];
    win.showInputBox = async () => inputs.shift();
    const { handlers } = register(repo);
    await handlers['jegit.newTag']();
    expect(repo.git.tag.create).toHaveBeenCalledWith('v1.0.0', '', 'release message');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('opens a picked file at the requested revision', async () => {
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    win.showInputBox = async () => 'v1.0';
    win.showQuickPick = async () => 'src/a.ts';
    const { handlers } = register(makeRepo());
    await handlers['jegit.browseAtRevision']();
    expect(exec).toHaveBeenCalledWith('vscode.open', expect.anything());
  });

  it('reports when there are no conflicts to resolve', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const { handlers } = register(makeRepo());
    await handlers['jegit.resolveConflicts']();
    expect(info).toHaveBeenCalled();
  });

  it('cleans up merged branches, never touching main or the current one', async () => {
    const repo = makeRepo();
    win.showQuickPick = async () => [{ label: 'feature/done' }];
    const { handlers } = register(repo);
    await handlers['jegit.cleanupBranches']();
    expect(repo.git.deleteBranch).toHaveBeenCalledTimes(1);
    expect(repo.git.deleteBranch).toHaveBeenCalledWith('feature/done', false);
  });
});
