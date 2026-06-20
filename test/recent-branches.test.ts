import { describe, it, expect } from 'vitest';
import { parseRecentBranches } from '../src/util/recentBranches';

const reflog = (...lines: string[]) => lines.join('\n');

describe('parseRecentBranches', () => {
  it('returns checked-out branches most recent first', () => {
    const out = reflog(
      'checkout: moving from feat to main',
      'checkout: moving from main to feat',
      'commit: work',
    );
    expect(parseRecentBranches(out, 5)).toEqual(['main', 'feat']);
  });

  it('skips detached (40-hex) checkouts', () => {
    const hash = 'a'.repeat(40);
    const out = reflog(`checkout: moving from main to ${hash}`, 'checkout: moving from main to feat');
    expect(parseRecentBranches(out, 5)).toEqual(['feat']);
  });

  it('collapses duplicate destinations, keeping first occurrence order', () => {
    const out = reflog(
      'checkout: moving from a to main',
      'checkout: moving from main to a',
      'checkout: moving from a to main',
    );
    expect(parseRecentBranches(out, 5)).toEqual(['main', 'a']);
  });

  it('returns at most limit + 1 distinct branches', () => {
    const out = reflog(
      'checkout: moving from x to b1',
      'checkout: moving from b1 to b2',
      'checkout: moving from b2 to b3',
      'checkout: moving from b3 to b4',
    );
    expect(parseRecentBranches(out, 2)).toEqual(['b1', 'b2', 'b3']);
  });

  it('ignores non-checkout reflog lines', () => {
    const out = reflog('commit: a', 'reset: moving to HEAD~1', 'merge feat: Merge made by recursive');
    expect(parseRecentBranches(out, 5)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(parseRecentBranches('', 5)).toEqual([]);
  });
});
