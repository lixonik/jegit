import { describe, it, expect } from 'vitest';
import { parseTagList } from '../src/git/git';

describe('parseTagList', () => {
  it('trims names and drops blank lines', () => {
    const out = 'v1.0.0\n  v0.9.0  \n\nv0.8.0\n';
    expect(parseTagList(out)).toEqual(['v1.0.0', 'v0.9.0', 'v0.8.0']);
  });

  it('preserves the given order (the caller controls sorting)', () => {
    expect(parseTagList('b\na\nc')).toEqual(['b', 'a', 'c']);
  });

  it('returns empty for empty input', () => {
    expect(parseTagList('')).toEqual([]);
  });
});
