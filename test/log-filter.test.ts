import { describe, it, expect } from 'vitest';
import logfilter from '../media/logfilter.js';

const { commitMatches, uniqueAuthors, highlightSegments } = logfilter;
const commit = (over: Partial<{ subject: string; author: string; hash: string; date: string }> = {}) => ({
  subject: 'Fix bug',
  author: 'Ann',
  hash: 'abc1234',
  date: '2026-06-01T00:00:00Z',
  ...over,
});

describe('commitMatches', () => {
  it('passes everything with no filters', () => {
    expect(commitMatches(commit(), {})).toBe(true);
    expect(commitMatches(commit(), undefined as never)).toBe(true);
  });

  it('filters by exact author', () => {
    expect(commitMatches(commit({ author: 'Ann' }), { user: 'Ann' })).toBe(true);
    expect(commitMatches(commit({ author: 'Bob' }), { user: 'Ann' })).toBe(false);
  });

  it('matches text against subject, author or hash, case-insensitively', () => {
    expect(commitMatches(commit({ subject: 'Refactor parser' }), { text: 'parser' })).toBe(true);
    expect(commitMatches(commit({ author: 'Annabel' }), { text: 'annab' })).toBe(true);
    expect(commitMatches(commit({ hash: 'deadbeef' }), { text: 'beef' })).toBe(true);
    expect(commitMatches(commit(), { text: 'nope' })).toBe(false);
  });

  it('keeps commits newer than now - days and drops older ones', () => {
    const now = Date.parse('2026-06-10T00:00:00Z');
    expect(commitMatches(commit({ date: '2026-06-08T00:00:00Z' }), { days: 7, now })).toBe(true);
    expect(commitMatches(commit({ date: '2026-06-01T00:00:00Z' }), { days: 7, now })).toBe(false);
  });

  it('requires all active filters to pass', () => {
    const c = commit({ author: 'Ann', subject: 'Add feature' });
    expect(commitMatches(c, { user: 'Ann', text: 'feature' })).toBe(true);
    expect(commitMatches(c, { user: 'Ann', text: 'missing' })).toBe(false);
  });
});

describe('uniqueAuthors', () => {
  it('dedupes authors and sorts them case-insensitively by locale', () => {
    const commits = [
      commit({ author: 'Boris' }),
      commit({ author: 'ann' }),
      commit({ author: 'Boris' }),
      commit({ author: 'Carla' }),
    ];
    expect(uniqueAuthors(commits)).toEqual(['ann', 'Boris', 'Carla']);
  });

  it('returns empty for no commits', () => {
    expect(uniqueAuthors([])).toEqual([]);
  });
});

describe('highlightSegments', () => {
  it('returns a single unhighlighted segment when there is no query', () => {
    expect(highlightSegments('Fix login bug', '')).toEqual([{ text: 'Fix login bug', hl: false }]);
  });

  it('marks a case-insensitive match in the middle', () => {
    expect(highlightSegments('Fix Login bug', 'login')).toEqual([
      { text: 'Fix ', hl: false },
      { text: 'Login', hl: true },
      { text: ' bug', hl: false },
    ]);
  });

  it('marks every occurrence', () => {
    expect(highlightSegments('aXaXa', 'x')).toEqual([
      { text: 'a', hl: false },
      { text: 'X', hl: true },
      { text: 'a', hl: false },
      { text: 'X', hl: true },
      { text: 'a', hl: false },
    ]);
  });

  it('highlights a match at the very start and end', () => {
    expect(highlightSegments('abc', 'abc')).toEqual([{ text: 'abc', hl: true }]);
  });

  it('returns one plain segment when the query is absent from the text', () => {
    expect(highlightSegments('hello', 'zzz')).toEqual([{ text: 'hello', hl: false }]);
  });
});
