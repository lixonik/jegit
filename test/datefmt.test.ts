import { describe, it, expect } from 'vitest';
import datefmt from '../media/datefmt.js';

const { relativeDate } = datefmt;
const now = Date.parse('2026-06-10T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();
const S = 1000;
const MIN = 60 * S;
const H = 60 * MIN;
const D = 24 * H;

describe('relativeDate', () => {
  it('says just now within the last minute', () => {
    expect(relativeDate(ago(30 * S), now)).toBe('just now');
  });

  it('counts minutes and singularizes one', () => {
    expect(relativeDate(ago(MIN), now)).toBe('1 minute ago');
    expect(relativeDate(ago(5 * MIN), now)).toBe('5 minutes ago');
  });

  it('counts hours', () => {
    expect(relativeDate(ago(H), now)).toBe('1 hour ago');
    expect(relativeDate(ago(3 * H), now)).toBe('3 hours ago');
  });

  it('counts days up to a month', () => {
    expect(relativeDate(ago(D), now)).toBe('1 day ago');
    expect(relativeDate(ago(10 * D), now)).toBe('10 days ago');
  });

  it('falls back to an ISO date for 30+ days', () => {
    expect(relativeDate('2026-01-15T08:00:00Z', now)).toBe('2026-01-15');
  });

  it('shows an absolute date for a future timestamp', () => {
    expect(relativeDate('2026-06-20T00:00:00Z', now)).toBe('2026-06-20');
  });

  it('returns empty for missing or unparseable input', () => {
    expect(relativeDate('', now)).toBe('');
    expect(relativeDate('not-a-date', now)).toBe('');
  });
});
