import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { manageWorktrees } from '../src/ui/worktrees';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;
const cmd = vscode.commands as unknown as Record<string, AnyFn>;

function scriptQuickPick(...answers: unknown[]) {
  const queue = [...answers];
  win.showQuickPick = async () => queue.shift();
}

function scriptInputBox(...answers: (string | undefined)[]) {
  const queue = [...answers];
  win.showInputBox = async () => queue.shift();
}

function makeRepo(): Repository {
  return {
    git: {
      repoRoot: 'D:/repos/proj',
      branches: vi.fn(async () => ({ current: 'main', locals: ['main', 'dev'], remotes: [] })),
      worktree: {
        list: vi.fn(async () => [{ path: 'D:/repos/proj-dev', branch: 'dev', head: 'abc' }]),
        prune: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        add: vi.fn(async () => undefined),
        addNewBranch: vi.fn(async () => undefined),
      },
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('manageWorktrees', () => {
  beforeEach(() => {
    win.showQuickPick = async () => undefined;
    win.showInputBox = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    cmd.executeCommand = async () => undefined;
  });

  it('prunes stale worktrees', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'Prune', action: 'prune' });
    await manageWorktrees(repo);
    expect(repo.git.worktree.prune).toHaveBeenCalled();
  });

  it('removes a worktree only after confirmation', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'wt', dir: 'D:/repos/proj-dev' }, { label: 'Remove', a: 'remove' });
    await manageWorktrees(repo);
    expect(repo.git.worktree.remove).not.toHaveBeenCalled();

    scriptQuickPick({ label: 'wt', dir: 'D:/repos/proj-dev' }, { label: 'Remove', a: 'remove' });
    win.showWarningMessage = async () => 'Remove';
    await manageWorktrees(repo);
    expect(repo.git.worktree.remove).toHaveBeenCalledWith('D:/repos/proj-dev');
  });

  it('opens a worktree in a new window without removing it', async () => {
    const repo = makeRepo();
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    scriptQuickPick({ label: 'wt', dir: 'D:/repos/proj-dev' }, { label: 'Open', a: 'open' });
    await manageWorktrees(repo);
    expect(exec).toHaveBeenCalled();
    expect(repo.git.worktree.remove).not.toHaveBeenCalled();
  });

  it('adds a worktree for an existing branch', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'add', action: 'add' }, { label: 'dev', branch: 'dev' });
    scriptInputBox('D:/repos/proj-dev2');
    await manageWorktrees(repo);
    expect(repo.git.worktree.add).toHaveBeenCalledWith('D:/repos/proj-dev2', 'dev');
  });

  it('adds a worktree on a brand new branch based on the current one', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'add', action: 'add' }, { label: 'new', create: true });
    scriptInputBox('feature/x', 'D:/repos/proj-feature-x');
    await manageWorktrees(repo);
    expect(repo.git.worktree.addNewBranch).toHaveBeenCalledWith('D:/repos/proj-feature-x', 'feature/x', 'main');
  });

  it('creates nothing when the directory prompt is cancelled', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'add', action: 'add' }, { label: 'dev', branch: 'dev' });
    scriptInputBox(undefined);
    await manageWorktrees(repo);
    expect(repo.git.worktree.add).not.toHaveBeenCalled();
  });
});
