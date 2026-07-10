import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { performBranchAction } from '../src/ui/branches';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;

function makeRepo(gitOverrides: Record<string, unknown> = {}): Repository {
  return {
    git: {
      checkout: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      pull: vi.fn(async () => undefined),
      updateBranch: vi.fn(async () => undefined),
      mergeBranch: vi.fn(async () => undefined),
      rebaseOnto: vi.fn(async () => undefined),
      setUpstream: vi.fn(async () => undefined),
      renameBranch: vi.fn(async () => undefined),
      deleteBranch: vi.fn(async () => undefined),
      diffRefs: vi.fn(async () => []),
      rangeCommits: vi.fn(async () => [{ hash: 'abcdef1234', subject: 'Fix a' }]),
      checkoutNew: vi.fn(async () => undefined),
      ...gitOverrides,
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('performBranchAction', () => {
  beforeEach(() => {
    win.showInputBox = async () => undefined;
    win.showQuickPick = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('checks out a local branch as is', async () => {
    const repo = makeRepo();
    await performBranchAction(repo, 'feature/x', 'main', false, 'checkout');
    expect(repo.git.checkout).toHaveBeenCalledWith('feature/x');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('strips the remote prefix when checking out a remote branch', async () => {
    const repo = makeRepo();
    await performBranchAction(repo, 'origin/feature/x', 'main', true, 'checkout');
    expect(repo.git.checkout).toHaveBeenCalledWith('feature/x');
  });

  it('pushes a local branch to the single remote', async () => {
    const repo = makeRepo({
      pushBranch: vi.fn(async () => undefined),
      remote: { list: vi.fn(async () => [{ name: 'origin', url: 'u' }]) },
    });
    await performBranchAction(repo, 'feature/x', 'main', false, 'push');
    expect(repo.git.pushBranch).toHaveBeenCalledWith('origin', 'feature/x');
  });

  it('asks which remote to push to and honours the cancel', async () => {
    const repo = makeRepo({
      pushBranch: vi.fn(async () => undefined),
      remote: {
        list: vi.fn(async () => [
          { name: 'origin', url: 'u' },
          { name: 'fork', url: 'f' },
        ]),
      },
    });
    await performBranchAction(repo, 'feature/x', 'main', false, 'push');
    expect(repo.git.pushBranch).not.toHaveBeenCalled();

    win.showQuickPick = async () => 'fork';
    await performBranchAction(repo, 'feature/x', 'main', false, 'push');
    expect(repo.git.pushBranch).toHaveBeenCalledWith('fork', 'feature/x');
  });

  it('merges with the picked mode', async () => {
    const repo = makeRepo();
    win.showQuickPick = async () => ({ label: 'Squash Merge', mode: 'squash' });
    await performBranchAction(repo, 'feature/x', 'main', false, 'merge');
    expect(repo.git.mergeBranch).toHaveBeenCalledWith('feature/x', 'squash');
  });

  it('skips the merge when the mode picker is cancelled', async () => {
    const repo = makeRepo();
    await performBranchAction(repo, 'feature/x', 'main', false, 'merge');
    expect(repo.git.mergeBranch).not.toHaveBeenCalled();
  });

  it('deletes a branch only after confirmation', async () => {
    const repo = makeRepo();
    await performBranchAction(repo, 'feature/x', 'main', false, 'delete');
    expect(repo.git.deleteBranch).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Delete';
    await performBranchAction(repo, 'feature/x', 'main', false, 'delete');
    expect(repo.git.deleteBranch).toHaveBeenCalledWith('feature/x', false);
  });

  it('falls back to force delete when the branch is not fully merged', async () => {
    const deleteBranch = vi
      .fn(async () => undefined)
      .mockRejectedValueOnce(new Error('not fully merged'));
    const repo = makeRepo({ deleteBranch });
    const answers = ['Delete', 'Force Delete'];
    win.showWarningMessage = async () => answers.shift();
    await performBranchAction(repo, 'feature/x', 'main', false, 'delete');
    expect(deleteBranch).toHaveBeenNthCalledWith(1, 'feature/x', false);
    expect(deleteBranch).toHaveBeenNthCalledWith(2, 'feature/x', true);
  });

  it('renames a branch with the entered name', async () => {
    const repo = makeRepo();
    win.showInputBox = async () => 'feature/renamed';
    await performBranchAction(repo, 'feature/x', 'main', false, 'rename');
    expect(repo.git.renameBranch).toHaveBeenCalledWith('feature/x', 'feature/renamed');
  });

  it('sets the upstream of the current branch', async () => {
    const repo = makeRepo();
    await performBranchAction(repo, 'origin/main', 'main', true, 'setupstream');
    expect(repo.git.setUpstream).toHaveBeenCalledWith('origin/main');
  });

  it('checkout and update pulls after switching', async () => {
    const repo = makeRepo();
    await performBranchAction(repo, 'feature/x', 'main', false, 'checkoutUpdate');
    expect(repo.git.checkout).toHaveBeenCalledWith('feature/x');
    expect(repo.git.pull).toHaveBeenCalledWith(false);
  });

  it('compare queries commits in both directions', async () => {
    const repo = makeRepo();
    const answers: unknown[] = [{ label: 'in', view: 'in' }, undefined];
    win.showQuickPick = async () => answers.shift();
    await performBranchAction(repo, 'feature/x', 'main', false, 'compare');
    expect(repo.git.rangeCommits).toHaveBeenCalledWith('main..feature/x');
    expect(repo.git.rangeCommits).toHaveBeenCalledWith('feature/x..main');
  });

  it('checkout and rebase switches then rebases onto the previous branch', async () => {
    const repo = makeRepo();
    await performBranchAction(repo, 'feature/x', 'main', false, 'checkoutRebase');
    expect(repo.git.checkout).toHaveBeenCalledWith('feature/x');
    expect(repo.git.rebaseOnto).toHaveBeenCalledWith('main');
  });
});
