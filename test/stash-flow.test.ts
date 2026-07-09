import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { stashChanges, unstash } from '../src/ui/stash';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;

function scriptQuickPick(...answers: unknown[]) {
  const queue = [...answers];
  win.showQuickPick = async () => queue.shift();
}

function makeRepo(stashes: { ref: string; subject: string }[] = [{ ref: 'stash@{0}', subject: 'WIP' }]): Repository {
  return {
    git: {
      stash: {
        push: vi.fn(async () => undefined),
        list: vi.fn(async () => stashes),
        apply: vi.fn(async () => undefined),
        pop: vi.fn(async () => undefined),
        drop: vi.fn(async () => undefined),
        clear: vi.fn(async () => undefined),
        branch: vi.fn(async () => undefined),
      },
      diffRefs: vi.fn(async () => [{ status: 'M', path: 'a.ts' }]),
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('stashChanges', () => {
  beforeEach(() => {
    win.showInputBox = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('does nothing when the message prompt is cancelled', async () => {
    const repo = makeRepo();
    await stashChanges(repo);
    expect(repo.git.stash.push).not.toHaveBeenCalled();
  });

  it('stashes with the trimmed message and refreshes', async () => {
    const repo = makeRepo();
    win.showInputBox = async () => '  WIP thing  ';
    await stashChanges(repo);
    expect(repo.git.stash.push).toHaveBeenCalledWith('WIP thing');
    expect(repo.refresh).toHaveBeenCalled();
  });
});

describe('unstash', () => {
  beforeEach(() => {
    win.showQuickPick = async () => undefined;
    win.showInputBox = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('reports when there are no stashes', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    await unstash(makeRepo([]));
    expect(info).toHaveBeenCalled();
  });

  it('pops the picked stash', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'stash@{0}', ref: 'stash@{0}' }, { label: 'Pop', a: 'pop' });
    await unstash(repo);
    expect(repo.git.stash.pop).toHaveBeenCalledWith('stash@{0}');
  });

  it('unstashes to a new branch', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'stash@{0}', ref: 'stash@{0}' }, { label: 'Branch', a: 'branch' });
    win.showInputBox = async () => 'feature/wip';
    await unstash(repo);
    expect(repo.git.stash.branch).toHaveBeenCalledWith('feature/wip', 'stash@{0}');
  });

  it('drops a stash only after confirmation', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'stash@{0}', ref: 'stash@{0}' }, { label: 'Drop', a: 'drop' });
    await unstash(repo);
    expect(repo.git.stash.drop).not.toHaveBeenCalled();

    scriptQuickPick({ label: 'stash@{0}', ref: 'stash@{0}' }, { label: 'Drop', a: 'drop' });
    win.showWarningMessage = async () => 'Drop';
    await unstash(repo);
    expect(repo.git.stash.drop).toHaveBeenCalledWith('stash@{0}');
  });

  it('clears all stashes after confirmation', async () => {
    const repo = makeRepo([
      { ref: 'stash@{0}', subject: 'a' },
      { ref: 'stash@{1}', subject: 'b' },
    ]);
    scriptQuickPick({ label: 'Clear', ref: '__clear__' });
    win.showWarningMessage = async () => 'Clear All';
    await unstash(repo);
    expect(repo.git.stash.clear).toHaveBeenCalled();
  });

  it('previews the changed files of a stash', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'stash@{0}', ref: 'stash@{0}' }, { label: 'Files', a: 'files' }, undefined);
    await unstash(repo);
    expect(repo.git.diffRefs).toHaveBeenCalledWith('stash@{0}^', 'stash@{0}');
    expect(repo.git.stash.apply).not.toHaveBeenCalled();
  });
});
