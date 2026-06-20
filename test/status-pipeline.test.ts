import { describe, it, expect } from 'vitest';
import { parseStatus } from '../src/git/git';
import { splitStaged } from '../src/util/stagingGroups';

// Detroit-style: run the real porcelain parser and the real staging grouper
// together, asserting the observable grouping of a representative status stream.
describe('parseStatus -> splitStaged pipeline', () => {
  it('groups a mixed porcelain -z stream into staged / unstaged / untracked', () => {
    const porcelain = ['M  staged.ts', ' M worktree.ts', 'MM both.ts', 'A  added.ts', '?? new.txt'].join('\0') + '\0';
    const r = splitStaged(parseStatus(porcelain));
    expect(r.staged.map((e) => e.path)).toEqual(['staged.ts', 'both.ts', 'added.ts']);
    expect(r.unstaged.map((e) => e.path)).toEqual(['worktree.ts', 'both.ts']);
    expect(r.untracked.map((e) => e.path)).toEqual(['new.txt']);
  });

  it('carries the correct per-side letters through the pipeline', () => {
    const r = splitStaged(parseStatus('AM ax.ts\0'));
    expect(r.staged).toEqual([{ path: 'ax.ts', letter: 'A' }]);
    expect(r.unstaged).toEqual([{ path: 'ax.ts', letter: 'M' }]);
  });
});
