import { describe, it, expect } from 'vitest';
import { toItem } from '../src/model/repository';
import type { FileChange } from '../src/git/git';

const fc = (status: string, path: string, extra?: Partial<FileChange>): FileChange => ({
  path,
  status,
  staged: false,
  untracked: false,
  ...extra,
});

describe('toItem', () => {
  it('maps a modified file', () => {
    const i = toItem(fc(' M', 'a.ts'), '/r');
    expect(i).toMatchObject({ letter: 'M', statusLabel: 'Modified', conflicted: false, deleted: false, untracked: false });
  });

  it('maps an added file', () => {
    expect(toItem(fc('A ', 'b.ts'), '/r')).toMatchObject({ letter: 'A', statusLabel: 'Added' });
  });

  it('marks a deleted file', () => {
    const i = toItem(fc(' D', 'c.ts'), '/r');
    expect(i).toMatchObject({ letter: 'D', statusLabel: 'Deleted', deleted: true, conflicted: false });
  });

  it('keeps the original path for a rename', () => {
    const i = toItem(fc('R ', 'new.ts', { origPath: 'old.ts' }), '/r');
    expect(i).toMatchObject({ letter: 'R', statusLabel: 'Renamed', origPath: 'old.ts' });
  });

  it('labels an untracked file as Unversioned with a ? letter', () => {
    const i = toItem(fc('??', 'n.txt', { untracked: true }), '/r');
    expect(i).toMatchObject({ letter: '?', statusLabel: 'Unversioned', untracked: true, conflicted: false });
  });

  it('labels a conflict and does not mark it deleted even for DD', () => {
    expect(toItem(fc('UU', 'x.ts'), '/r')).toMatchObject({ letter: 'U', statusLabel: 'Merge conflict', conflicted: true });
    expect(toItem(fc('DD', 'y.ts'), '/r')).toMatchObject({ letter: 'U', statusLabel: 'Merge conflict', conflicted: true, deleted: false });
  });
});
