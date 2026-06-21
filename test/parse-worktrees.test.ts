import { describe, it, expect } from 'vitest';
import { parseWorktrees } from '../src/git/git';

describe('parseWorktrees', () => {
  it('parses multiple worktree records with branches', () => {
    const out = [
      'worktree /repo',
      'HEAD aaaa1111',
      'branch refs/heads/main',
      '',
      'worktree /repo/feature',
      'HEAD bbbb2222',
      'branch refs/heads/feature/login',
      '',
    ].join('\n');
    expect(parseWorktrees(out)).toEqual([
      { path: '/repo', head: 'aaaa1111', branch: 'main' },
      { path: '/repo/feature', head: 'bbbb2222', branch: 'feature/login' },
    ]);
  });

  it('labels a detached worktree', () => {
    const out = ['worktree /repo/wt', 'HEAD cccc3333', 'detached', ''].join('\n');
    expect(parseWorktrees(out)).toEqual([{ path: '/repo/wt', head: 'cccc3333', branch: '(detached)' }]);
  });

  it('keeps the last record without a trailing blank line', () => {
    const out = 'worktree /solo\nHEAD dddd4444\nbranch refs/heads/dev';
    expect(parseWorktrees(out)).toEqual([{ path: '/solo', head: 'dddd4444', branch: 'dev' }]);
  });

  it('returns empty for empty input', () => {
    expect(parseWorktrees('')).toEqual([]);
  });
});
