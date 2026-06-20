import { describe, it, expect } from 'vitest';
import { splitHunks, buildHunkPatch } from '../src/util/diff';

const diff = [
  '--- a/f',
  '+++ b/f',
  '@@ -1 +1 @@',
  '-a',
  '+A',
  '@@ -10 +10 @@',
  '-y',
  '+Y',
].join('\n');

describe('buildHunkPatch', () => {
  it('round-trips a single selected hunk with the header', () => {
    const { header, hunks } = splitHunks(diff);
    const patch = buildHunkPatch(header, [hunks[1]]);
    expect(patch).toBe(['--- a/f', '+++ b/f', '@@ -10 +10 @@', '-y', '+Y', ''].join('\n'));
  });

  it('joins multiple hunks under one header and ends with a newline', () => {
    const { header, hunks } = splitHunks(diff);
    const patch = buildHunkPatch(header, hunks);
    expect(patch.startsWith('--- a/f\n+++ b/f\n@@ -1 +1 @@')).toBe(true);
    expect(patch).toContain('@@ -10 +10 @@');
    expect(patch.endsWith('\n')).toBe(true);
  });
});
