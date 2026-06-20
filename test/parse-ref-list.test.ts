import { describe, it, expect } from 'vitest';
import { parseRefList } from '../src/git/git';

describe('parseRefList', () => {
  it('trims and drops blank lines', () => {
    expect(parseRefList('main\n  feature/x  \n\n')).toEqual(['main', 'feature/x']);
  });

  it('keeps remote/HEAD by default', () => {
    const out = ['origin/main', 'origin/HEAD', 'origin/feature'].join('\n');
    expect(parseRefList(out)).toEqual(['origin/main', 'origin/HEAD', 'origin/feature']);
  });

  it('drops <remote>/HEAD entries when asked', () => {
    const out = ['origin/main', 'origin/HEAD', 'upstream/HEAD', 'origin/feature'].join('\n');
    expect(parseRefList(out, true)).toEqual(['origin/main', 'origin/feature']);
  });

  it('returns empty for empty input', () => {
    expect(parseRefList('')).toEqual([]);
    expect(parseRefList('', true)).toEqual([]);
  });
});
