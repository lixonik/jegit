import { describe, it, expect, vi } from 'vitest';
import { GitStash } from '../src/git/stash';
import { GitWorktrees } from '../src/git/worktrees';
import { GitRemotes } from '../src/git/remotes';
import { GitTags } from '../src/git/tags';

function recorder(out = '') {
  const calls: string[][] = [];
  const raw = vi.fn(async (args: string[]) => {
    calls.push(args);
    return out;
  });
  return { raw, calls };
}

const failing = async () => {
  throw new Error('git failed');
};

describe('GitStash', () => {
  it('pushes with a message only when one is given', async () => {
    const { raw, calls } = recorder();
    const stash = new GitStash(raw);
    await stash.push('WIP');
    await stash.push('');
    expect(calls[0]).toEqual(['stash', 'push', '-m', 'WIP']);
    expect(calls[1]).toEqual(['stash', 'push']);
  });

  it('parses the stash list and survives a git failure', async () => {
    const { raw } = recorder('stash@{0}\x1fWIP on main\n');
    expect(await new GitStash(raw).list()).toEqual([{ ref: 'stash@{0}', subject: 'WIP on main' }]);
    expect(await new GitStash(failing).list()).toEqual([]);
  });

  it('creates a branch from a stash', async () => {
    const { raw, calls } = recorder();
    await new GitStash(raw).branch('feature/wip', 'stash@{1}');
    expect(calls[0]).toEqual(['stash', 'branch', 'feature/wip', 'stash@{1}']);
  });
});

describe('GitWorktrees', () => {
  it('adds a worktree on a new branch', async () => {
    const { raw, calls } = recorder();
    await new GitWorktrees(raw).addNewBranch('../wt', 'feature/x', 'main');
    expect(calls[0]).toEqual(['worktree', 'add', '-b', 'feature/x', '../wt', 'main']);
  });

  it('parses the worktree list and survives a git failure', async () => {
    const { raw } = recorder('worktree /repo\nHEAD abc\nbranch refs/heads/main\n');
    expect(await new GitWorktrees(raw).list()).toEqual([{ path: '/repo', head: 'abc', branch: 'main' }]);
    expect(await new GitWorktrees(failing).list()).toEqual([]);
  });
});

describe('GitRemotes', () => {
  it('parses fetch remotes uniquely', async () => {
    const { raw } = recorder('origin https://h/r.git (fetch)\norigin https://h/r.git (push)\n');
    expect(await new GitRemotes(raw).list()).toEqual([{ name: 'origin', url: 'https://h/r.git' }]);
  });

  it('sets a remote url', async () => {
    const { raw, calls } = recorder();
    await new GitRemotes(raw).setUrl('origin', 'https://h/new.git');
    expect(calls[0]).toEqual(['remote', 'set-url', 'origin', 'https://h/new.git']);
  });

  it('survives a git failure when listing', async () => {
    expect(await new GitRemotes(failing).list()).toEqual([]);
  });
});

describe('GitTags', () => {
  it('creates lightweight and annotated tags', async () => {
    const { raw, calls } = recorder();
    const tags = new GitTags(raw);
    await tags.create('v1', 'abc');
    await tags.create('v2', '', 'release');
    expect(calls[0]).toEqual(['tag', 'v1', 'abc']);
    expect(calls[1]).toEqual(['tag', '-a', 'v2', '-m', 'release']);
  });

  it('lists newest tags up to the limit', async () => {
    const { raw } = recorder('v3\nv2\nv1\n');
    expect(await new GitTags(raw).list(2)).toEqual(['v3', 'v2']);
  });

  it('queries tags containing a commit, newest first', async () => {
    const { raw, calls } = recorder('v2\n');
    expect(await new GitTags(raw).containing('abc')).toEqual(['v2']);
    expect(calls[0]).toEqual(['tag', '--contains', 'abc', '--sort=-creatordate']);
  });

  it('deletes a tag', async () => {
    const { raw, calls } = recorder();
    await new GitTags(raw).delete('v1');
    expect(calls[0]).toEqual(['tag', '-d', 'v1']);
  });

  it('survives a git failure when listing', async () => {
    expect(await new GitTags(failing).list()).toEqual([]);
    expect(await new GitTags(failing).containing('abc')).toEqual([]);
  });
});
