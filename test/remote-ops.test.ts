import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { pushFlow, updateFlow } from '../src/ui/remoteOps';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;

function makeRepo(gitOverrides: Record<string, unknown> = {}): Repository {
  return {
    branch: 'main',
    git: {
      hasUpstream: vi.fn(async () => true),
      pushSetUpstream: vi.fn(async () => undefined),
      outgoingSubjects: vi.fn(async () => ['Fix a', 'Fix b']),
      push: vi.fn(async () => undefined),
      fetch: vi.fn(async () => undefined),
      aheadBehind: vi.fn(async () => ({ ahead: 0, behind: 2 })),
      pull: vi.fn(async () => undefined),
      remote: { list: vi.fn(async () => [{ name: 'origin', url: 'https://h/r.git' }]) },
      ...gitOverrides,
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('pushFlow', () => {
  beforeEach(() => {
    win.showInputBox = async () => undefined;
    win.showQuickPick = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('offers to set the upstream and respects a cancel', async () => {
    const repo = makeRepo({ hasUpstream: vi.fn(async () => false) });
    await pushFlow(repo);
    expect(repo.git.pushSetUpstream).not.toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('pushes with upstream setup after confirmation', async () => {
    const repo = makeRepo({ hasUpstream: vi.fn(async () => false) });
    win.showWarningMessage = async () => 'Push';
    await pushFlow(repo);
    expect(repo.git.pushSetUpstream).toHaveBeenCalledWith('origin');
  });

  it('lets the user choose the remote when several exist', async () => {
    const repo = makeRepo({
      hasUpstream: vi.fn(async () => false),
      remote: {
        list: vi.fn(async () => [
          { name: 'origin', url: 'https://h/r.git' },
          { name: 'fork', url: 'https://h/fork.git' },
        ]),
      },
    });
    win.showQuickPick = async () => ({ label: 'fork', description: 'https://h/fork.git' });
    win.showWarningMessage = async () => 'Push';
    await pushFlow(repo);
    expect(repo.git.pushSetUpstream).toHaveBeenCalledWith('fork');
  });

  it('does not push when there are no outgoing commits', async () => {
    const repo = makeRepo({ outgoingSubjects: vi.fn(async () => []) });
    await pushFlow(repo);
    expect(repo.git.push).not.toHaveBeenCalled();
  });

  it('pushes outgoing commits after the preview is confirmed', async () => {
    const repo = makeRepo();
    win.showInformationMessage = async () => 'Push';
    await pushFlow(repo);
    expect(repo.git.push).toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
  });
});

describe('updateFlow', () => {
  beforeEach(() => {
    win.showQuickPick = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('does nothing when already up to date', async () => {
    const repo = makeRepo({ aheadBehind: vi.fn(async () => ({ ahead: 0, behind: 0 })) });
    await updateFlow(repo);
    expect(repo.git.pull).not.toHaveBeenCalled();
  });

  it('pulls with rebase when the rebase option is picked', async () => {
    const repo = makeRepo();
    win.showQuickPick = async () => ({ label: 'Rebase onto incoming', rebase: true });
    await updateFlow(repo);
    expect(repo.git.pull).toHaveBeenCalledWith(true);
  });

  it('pulls with merge when the merge option is picked', async () => {
    const repo = makeRepo();
    win.showQuickPick = async () => ({ label: 'Merge incoming', rebase: false });
    await updateFlow(repo);
    expect(repo.git.pull).toHaveBeenCalledWith(false);
  });

  it('skips the pull when the mode picker is cancelled', async () => {
    const repo = makeRepo();
    await updateFlow(repo);
    expect(repo.git.pull).not.toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('reports a fetch failure and still refreshes', async () => {
    const err = vi.fn(async () => undefined);
    win.showErrorMessage = err;
    const repo = makeRepo({
      fetch: vi.fn(async () => {
        throw new Error('network down');
      }),
    });
    await updateFlow(repo);
    expect(err).toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
  });
});
