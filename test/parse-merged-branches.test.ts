import { describe, it, expect } from 'vitest';
import { parseMergedBranches } from '../src/git/git';

describe('parseMergedBranches', () => {
  it('lists merged branches excluding the current one', () => {
    const out = ['* main', '  feature/x', '  old-work'].join('\n');
    expect(parseMergedBranches(out)).toEqual(['feature/x', 'old-work']);
  });

  it('ignores a detached-HEAD entry', () => {
    const out = ['* (HEAD detached at abc123)', '  main', '  topic'].join('\n');
    expect(parseMergedBranches(out)).toEqual(['main', 'topic']);
  });

  it('trims indentation and drops blank lines', () => {
    expect(parseMergedBranches('  a\n\n   b  \n')).toEqual(['a', 'b']);
  });

  it('returns empty for empty input', () => {
    expect(parseMergedBranches('')).toEqual([]);
  });
});
