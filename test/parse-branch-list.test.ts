import { describe, it, expect } from 'vitest';
import { parseBranchList } from '../src/git/git';

describe('parseBranchList', () => {
  it('keeps the current branch and strips the * marker', () => {
    const out = ['* main', '  feature/login', '  release'].join('\n');
    expect(parseBranchList(out)).toEqual(['main', 'feature/login', 'release']);
  });

  it('strips the + marker for branches checked out in another worktree', () => {
    const out = ['  main', '+ wip', '* dev'].join('\n');
    expect(parseBranchList(out)).toEqual(['main', 'wip', 'dev']);
  });

  it('drops a detached-HEAD entry', () => {
    const out = ['* (HEAD detached at abc1234)', '  main'].join('\n');
    expect(parseBranchList(out)).toEqual(['main']);
  });

  it('returns empty for empty input', () => {
    expect(parseBranchList('')).toEqual([]);
  });
});
