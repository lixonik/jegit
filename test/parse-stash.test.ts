import { describe, it, expect } from 'vitest';
import { parseStashList } from '../src/git/git';

const FS = '\x1f';

describe('parseStashList', () => {
  it('splits each line into ref and subject', () => {
    const out = [`stash@{0}${FS}WIP on main: abc Fix bug`, `stash@{1}${FS}On feat: scratch`].join('\n');
    expect(parseStashList(out)).toEqual([
      { ref: 'stash@{0}', subject: 'WIP on main: abc Fix bug' },
      { ref: 'stash@{1}', subject: 'On feat: scratch' },
    ]);
  });

  it('defaults a missing subject to an empty string', () => {
    expect(parseStashList('stash@{0}')).toEqual([{ ref: 'stash@{0}', subject: '' }]);
  });

  it('ignores blank lines', () => {
    const out = [`stash@{0}${FS}a`, '', '   ', `stash@{1}${FS}b`].join('\n');
    expect(parseStashList(out).map((s) => s.ref)).toEqual(['stash@{0}', 'stash@{1}']);
  });

  it('returns empty for empty input', () => {
    expect(parseStashList('')).toEqual([]);
  });
});
