import { describe, it, expect } from 'vitest';
import { parseRemotes } from '../src/git/git';

describe('parseRemotes', () => {
  it('returns one entry per remote using the fetch URL', () => {
    const out = [
      'origin\thttps://github.com/u/r.git (fetch)',
      'origin\thttps://github.com/u/r.git (push)',
      'upstream\tgit@github.com:o/r.git (fetch)',
      'upstream\tgit@github.com:o/r.git (push)',
    ].join('\n');
    expect(parseRemotes(out)).toEqual([
      { name: 'origin', url: 'https://github.com/u/r.git' },
      { name: 'upstream', url: 'git@github.com:o/r.git' },
    ]);
  });

  it('ignores push-only lines without a fetch entry', () => {
    const out = 'origin\thttps://x/y.git (push)';
    expect(parseRemotes(out)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(parseRemotes('')).toEqual([]);
  });
});
