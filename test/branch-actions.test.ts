import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { performBranchAction, showBranches } from '../src/ui/branches';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;
const cmd = vscode.commands as unknown as Record<string, AnyFn>;

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

  it('deletes a remote branch only after the modal confirmation', async () => {
    const repo = makeRepo({ deleteRemoteBranch: vi.fn(async () => undefined) });
    await performBranchAction(repo, 'origin/feature/x', 'main', true, 'deleteRemote');
    expect(repo.git.deleteRemoteBranch).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Delete on Remote';
    await performBranchAction(repo, 'origin/feature/x', 'main', true, 'deleteRemote');
    expect(repo.git.deleteRemoteBranch).toHaveBeenCalledWith('origin', 'feature/x');
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

describe('showBranches', () => {
  function makePopupRepo() {
    return makeRepo({
      branches: vi.fn(async () => ({ current: 'main', locals: ['main'], remotes: [] })),
      recentBranches: vi.fn(async () => []),
      tag: { list: vi.fn(async () => []) },
    });
  }

  beforeEach(() => {
    win.showInputBox = async () => undefined;
    win.showQuickPick = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    cmd.executeCommand = async () => undefined;
  });

  it('checks out a typed tag or revision detached', async () => {
    const repo = makePopupRepo();
    win.showQuickPick = async (items: unknown) =>
      (items as { action?: string }[]).find((i) => i.action === 'checkoutRef');
    win.showInputBox = async () => ' v1.2.0 ';
    await showBranches(repo);
    expect(repo.git.checkout).toHaveBeenCalledWith('v1.2.0');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('creates a new branch from the current one', async () => {
    const repo = makePopupRepo();
    win.showQuickPick = async (items: unknown) => (items as { action?: string }[]).find((i) => i.action === 'new');
    win.showInputBox = async () => 'feature/z';
    await showBranches(repo);
    expect(repo.git.checkoutNew).toHaveBeenCalledWith('feature/z', 'main');
  });

  it('delegates the cleanup entry to the command', async () => {
    const repo = makePopupRepo();
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    win.showQuickPick = async (items: unknown) => (items as { action?: string }[]).find((i) => i.action === 'cleanup');
    await showBranches(repo);
    expect(exec).toHaveBeenCalledWith('jegit.cleanupBranches');
  });

  function makeTagRepo() {
    return makeRepo({
      branches: vi.fn(async () => ({ current: 'main', locals: ['main'], remotes: [] })),
      recentBranches: vi.fn(async () => []),
      tag: { list: vi.fn(async () => ['v1.0']), delete: vi.fn(async () => undefined) },
    });
  }

  function pickTagThen(action: string) {
    const picks = [
      async (items: unknown) => (items as { tag?: string }[]).find((i) => i.tag === 'v1.0'),
      async (items: unknown) => (items as { a?: string }[]).find((i) => i.a === action),
    ];
    win.showQuickPick = ((items: unknown) => picks.shift()!(items)) as AnyFn;
  }

  it('checks out a picked tag detached', async () => {
    const repo = makeTagRepo();
    pickTagThen('checkout');
    await showBranches(repo);
    expect(repo.git.checkout).toHaveBeenCalledWith('v1.0');
  });

  it('creates a branch from a picked tag', async () => {
    const repo = makeTagRepo();
    pickTagThen('newBranch');
    win.showInputBox = async () => 'release/1.0';
    await showBranches(repo);
    expect(repo.git.checkoutNew).toHaveBeenCalledWith('release/1.0', 'v1.0');
  });

  it('routes a picked branch into its actions menu', async () => {
    const repo = makeRepo({
      branches: vi.fn(async () => ({ current: 'main', locals: ['main', 'feature/x'], remotes: [] })),
      recentBranches: vi.fn(async () => []),
      tag: { list: vi.fn(async () => []) },
    });
    const picks = [
      async (items: unknown) => (items as { ref?: string }[]).find((i) => i.ref === 'feature/x'),
      async (items: unknown) => (items as { a?: string }[]).find((i) => i.a === 'checkout'),
    ];
    win.showQuickPick = ((items: unknown) => picks.shift()!(items)) as AnyFn;
    await showBranches(repo);
    expect(repo.git.checkout).toHaveBeenCalledWith('feature/x');
  });

  it('deletes a picked tag only after confirmation', async () => {
    const repo = makeTagRepo();
    pickTagThen('delete');
    await showBranches(repo);
    expect(repo.git.tag.delete).not.toHaveBeenCalled();

    pickTagThen('delete');
    win.showWarningMessage = async () => 'Delete';
    await showBranches(repo);
    expect(repo.git.tag.delete).toHaveBeenCalledWith('v1.0');
  });
});
