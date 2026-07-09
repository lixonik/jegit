import { describe, it, expect } from 'vitest';
import { ageBucket, ageColor } from '../src/util/blameAge';

const now = new Date('2026-07-09T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe('ageBucket', () => {
  it('puts fresh commits in the first bucket', () => {
    expect(ageBucket(daysAgo(0), now)).toBe(0);
    expect(ageBucket(daysAgo(6), now)).toBe(0);
  });

  it('spreads older commits across buckets', () => {
    expect(ageBucket(daysAgo(10), now)).toBe(1);
    expect(ageBucket(daysAgo(100), now)).toBe(2);
    expect(ageBucket(daysAgo(300), now)).toBe(3);
    expect(ageBucket(daysAgo(1000), now)).toBe(4);
  });

  it('treats unparsable dates as oldest', () => {
    expect(ageBucket('not-a-date', now)).toBe(4);
    expect(ageBucket('', now)).toBe(4);
  });
});

describe('ageColor', () => {
  it('gives distinct colors to fresh and ancient lines', () => {
    expect(ageColor(daysAgo(1), now)).not.toBe(ageColor(daysAgo(1000), now));
  });

  it('returns a defined color for every bucket', () => {
    for (const d of [0, 10, 100, 300, 1000]) {
      expect(ageColor(daysAgo(d), now)).toMatch(/^hsl\(/);
    }
  });
});
