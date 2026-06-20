import { describe, it, expect } from 'vitest';
import { parseRangeCommits } from '../src/git/git';

const FS = '\x1f';

describe('parseRangeCommits', () => {
  it('splits each line into hash and subject', () => {
    const out = [`h1${FS}First commit`, `h2${FS}Second commit`].join('\n');
    expect(parseRangeCommits(out)).toEqual([
      { hash: 'h1', subject: 'First commit' },
      { hash: 'h2', subject: 'Second commit' },
    ]);
  });

  it('defaults a missing subject to an empty string', () => {
    expect(parseRangeCommits('h1')).toEqual([{ hash: 'h1', subject: '' }]);
  });

  it('skips blank lines', () => {
    const out = [`h1${FS}a`, '', '  ', `h2${FS}b`].join('\n');
    expect(parseRangeCommits(out).map((c) => c.hash)).toEqual(['h1', 'h2']);
  });

  it('returns empty for empty input', () => {
    expect(parseRangeCommits('')).toEqual([]);
  });
});
