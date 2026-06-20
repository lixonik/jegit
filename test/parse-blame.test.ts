import { describe, it, expect } from 'vitest';
import { parseBlame } from '../src/git/git';

const H = 'a'.repeat(40);

describe('parseBlame', () => {
  it('parses one entry per content line with the commit fields', () => {
    const out = [
      `${H} 1 1 1`,
      'author Ann',
      'author-mail <ann@example.com>',
      'author-time 1700000000',
      'author-tz +0000',
      'summary Fix the thing',
      'filename f.ts',
      '\tconst a = 1;',
    ].join('\n');
    expect(parseBlame(out)).toEqual([
      { hash: H, author: 'Ann', email: 'ann@example.com', date: '2023-11-14', summary: 'Fix the thing' },
    ]);
  });

  it('lets later lines of the same commit inherit its fields', () => {
    const out = [
      `${H} 1 1 1`,
      'author Ann',
      'author-mail <ann@example.com>',
      'author-time 1700000000',
      'summary Fix the thing',
      '\tline one',
      `${H} 2 2`,
      '\tline two',
    ].join('\n');
    const r = parseBlame(out);
    expect(r).toHaveLength(2);
    expect(r[1]).toEqual({ hash: H, author: 'Ann', email: 'ann@example.com', date: '2023-11-14', summary: 'Fix the thing' });
  });

  it('returns empty for empty input', () => {
    expect(parseBlame('')).toEqual([]);
  });
});
