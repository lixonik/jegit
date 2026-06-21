import { describe, it, expect } from 'vitest';
import { parseRecentMessages } from '../src/git/git';

const RS = '\x1e';

describe('parseRecentMessages', () => {
  it('splits RS-separated messages and trims each', () => {
    const out = ['Add feature\n\n', 'Fix bug', '  Tidy up  '].join(RS);
    expect(parseRecentMessages(out)).toEqual(['Add feature', 'Fix bug', 'Tidy up']);
  });

  it('keeps multi-line message bodies intact', () => {
    const out = ['Subject line\n\nBody paragraph.', 'Second'].join(RS);
    expect(parseRecentMessages(out)[0]).toBe('Subject line\n\nBody paragraph.');
  });

  it('de-duplicates repeated messages, preserving first occurrence order', () => {
    const out = ['Same', 'Other', 'Same'].join(RS);
    expect(parseRecentMessages(out)).toEqual(['Same', 'Other']);
  });

  it('drops empty records and returns empty for empty input', () => {
    expect(parseRecentMessages(['Msg', '', '   '].join(RS))).toEqual(['Msg']);
    expect(parseRecentMessages('')).toEqual([]);
  });
});
