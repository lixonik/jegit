import { describe, it, expect } from 'vitest';
import { parseLog, LOG_FS, LOG_RS } from '../src/git/git';

const rec = (fields: string[]) => fields.join(LOG_FS);
const stream = (...records: string[]) => records.join(LOG_RS);

describe('parseLog', () => {
  it('parses hash, parents, author, email, date, refs and subject', () => {
    const out = stream(rec(['h1', 'p1 p2', 'Ann', 'ann@x', '2026-06-01T10:00:00+00:00', 'HEAD -> main, tag: v1', 'Subject']));
    expect(parseLog(out)).toEqual([
      {
        hash: 'h1',
        parents: ['p1', 'p2'],
        author: 'Ann',
        email: 'ann@x',
        date: '2026-06-01T10:00:00+00:00',
        refs: ['main', 'tag: v1'],
        subject: 'Subject',
      },
    ]);
  });

  it('treats a root commit as having no parents', () => {
    const out = stream(rec(['h0', '', 'A', 'a@x', '2026-01-01T00:00:00Z', '', 'init']));
    expect(parseLog(out)[0].parents).toEqual([]);
  });

  it('defaults a missing subject to an empty string', () => {
    const out = stream(['h', '', 'A', 'a@x', '2026-01-01T00:00:00Z', ''].join(LOG_FS));
    expect(parseLog(out)[0].subject).toBe('');
  });

  it('parses multiple records and skips blank ones', () => {
    const out = stream(
      rec(['a', '', 'A', 'a@x', 'd', '', 's1']),
      '',
      rec(['b', 'a', 'B', 'b@x', 'd', '', 's2']),
    );
    expect(parseLog(out).map((c) => c.hash)).toEqual(['a', 'b']);
  });

  it('returns empty for empty input', () => {
    expect(parseLog('')).toEqual([]);
  });
});
