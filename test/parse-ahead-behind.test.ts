import { describe, it, expect } from 'vitest';
import { parseAheadBehind } from '../src/git/git';

describe('parseAheadBehind', () => {
  it('reads behind from the left count and ahead from the right count', () => {
    expect(parseAheadBehind('2\t5')).toEqual({ behind: 2, ahead: 5 });
  });

  it('accepts space separation', () => {
    expect(parseAheadBehind('0 3\n')).toEqual({ behind: 0, ahead: 3 });
  });

  it('treats missing or non-numeric counts as zero', () => {
    expect(parseAheadBehind('')).toEqual({ behind: 0, ahead: 0 });
    expect(parseAheadBehind('x y')).toEqual({ behind: 0, ahead: 0 });
  });
});
