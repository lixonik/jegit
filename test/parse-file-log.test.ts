import { describe, it, expect } from 'vitest';
import { parseFileLog, LOG_FS, LOG_RS } from '../src/git/git';

const rec = (fields: string[]) => fields.join(LOG_FS);
const stream = (...records: string[]) => records.join(LOG_RS);

describe('parseFileLog', () => {
  it('parses hash, first parent, author, date and subject', () => {
    const out = stream(rec(['h1', 'p1 p2', 'Ann', '2026-06-01T10:00:00Z', 'Edit file']));
    expect(parseFileLog(out)).toEqual([
      { hash: 'h1', parent: 'p1', author: 'Ann', date: '2026-06-01T10:00:00Z', subject: 'Edit file' },
    ]);
  });

  it('uses an empty parent for a root commit', () => {
    const out = stream(rec(['h0', '', 'A', 'd', 'init']));
    expect(parseFileLog(out)[0].parent).toBe('');
  });

  it('defaults a missing subject to an empty string', () => {
    const out = stream(['h', 'p', 'A', 'd'].join(LOG_FS));
    expect(parseFileLog(out)[0].subject).toBe('');
  });

  it('parses several records and skips blanks', () => {
    const out = stream(rec(['a', '', 'A', 'd', 's1']), '', rec(['b', 'a', 'B', 'd', 's2']));
    expect(parseFileLog(out).map((c) => c.hash)).toEqual(['a', 'b']);
  });

  it('returns empty for empty input', () => {
    expect(parseFileLog('')).toEqual([]);
  });
});
