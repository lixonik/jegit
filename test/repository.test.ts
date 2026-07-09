import { describe, it, expect, vi } from 'vitest';
import { Repository } from '../src/model/repository';
import type { Git } from '../src/git/git';
import type { ChangelistStore } from '../src/model/changelistStore';
import type { ShelfStore } from '../src/model/shelfStore';

function makeGit(overrides: Record<string, unknown> = {}): Git {
  return {
    repoRoot: 'D:/repo',
    status: vi.fn(async () => [{ path: 'a.ts', status: ' M', staged: false, untracked: false }]),
    currentBranch: vi.fn(async () => 'main'),
    aheadBehind: vi.fn(async () => ({ ahead: 1, behind: 2 })),
    add: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    push: vi.fn(async () => undefined),
    applyPatch3way: vi.fn(async () => 'clean'),
    ...overrides,
  } as unknown as Git;
}

function makeStore(): ChangelistStore {
  return {
    onDidChange: () => ({ dispose: () => undefined }),
    reconcile: vi.fn(async () => undefined),
    changelists: [{ id: 'default', name: 'Changes' }],
    activeId: 'default',
    changelistOf: () => 'default',
  } as unknown as ChangelistStore;
}

function makeShelf(entries: Record<string, unknown>[] = []): ShelfStore {
  return {
    list: () => entries,
    get: (id: string) => entries.find((e) => e.id === id),
    remove: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined),
    patchPath: (id: string) => `D:/shelf/${id}.patch`,
  } as unknown as ShelfStore;
}

describe('Repository', () => {
  it('refresh assembles branch, sync state and the changelist view', async () => {
    const repo = new Repository(makeGit(), makeStore(), makeShelf());
    const changed = vi.fn();
    repo.onDidChange(changed);
    await repo.refresh();
    expect(repo.branch).toBe('main');
    expect(repo.sync).toEqual({ ahead: 1, behind: 2 });
    expect(changed).toHaveBeenCalled();
    const view = repo.view();
    expect(view.total).toBe(1);
    expect(view.changelists[0].files[0].path).toBe('a.ts');
  });

  it('commit stages, commits with options and pushes only when asked', async () => {
    const git = makeGit();
    const repo = new Repository(git, makeStore(), makeShelf());
    await repo.commit(['a.ts'], 'Fix', { amend: true, signoff: false });
    expect(git.add).toHaveBeenCalledWith(['a.ts']);
    expect(git.commit).toHaveBeenCalledWith('Fix', ['a.ts'], { amend: true, signoff: false, author: undefined });
    expect(git.push).not.toHaveBeenCalled();

    await repo.commit(['a.ts'], 'Fix', { push: true });
    expect(git.push).toHaveBeenCalled();
  });

  it('unshelve reports a missing shelf', async () => {
    const repo = new Repository(makeGit(), makeStore(), makeShelf());
    expect(await repo.unshelve('nope')).toBe('missing');
  });

  it('unshelve drops the shelf on a clean apply unless kept', async () => {
    const shelf = makeShelf([{ id: 's1', name: 'WIP' }]);
    const repo = new Repository(makeGit(), makeStore(), shelf);
    expect(await repo.unshelve('s1')).toBe('clean');
    expect(shelf.remove).toHaveBeenCalledWith('s1');
  });

  it('unshelve keeps the shelf when conflicts remain', async () => {
    const shelf = makeShelf([{ id: 's1', name: 'WIP' }]);
    const git = makeGit({ applyPatch3way: vi.fn(async () => 'conflicts') });
    const repo = new Repository(git, makeStore(), shelf);
    expect(await repo.unshelve('s1')).toBe('conflicts');
    expect(shelf.remove).not.toHaveBeenCalled();
  });

  it('maps a workspace uri to a repo-relative path', () => {
    const repo = new Repository(makeGit(), makeStore(), makeShelf());
    expect(repo.relPathOf({ fsPath: 'D:/repo/src/a.ts' } as never)).toBe('src/a.ts');
  });

  it('coalesces a burst of watcher events into a single refresh', async () => {
    vi.useFakeTimers();
    try {
      const git = makeGit();
      const repo = new Repository(git, makeStore(), makeShelf());
      repo.scheduleRefresh();
      repo.scheduleRefresh();
      repo.scheduleRefresh();
      await vi.advanceTimersByTimeAsync(400);
      expect(git.status).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a pending refresh on dispose', async () => {
    vi.useFakeTimers();
    try {
      const git = makeGit();
      const repo = new Repository(git, makeStore(), makeShelf());
      repo.scheduleRefresh();
      repo.dispose();
      await vi.advanceTimersByTimeAsync(400);
      expect(git.status).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
