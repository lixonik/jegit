import { describe, it, expect } from 'vitest';
import { toWebUrl, commitWebUrl, fileWebUrl, guessCloneDirName } from '../src/util/remoteUrl';

describe('toWebUrl', () => {
  it('https with .git', () => {
    expect(toWebUrl('https://github.com/u/r.git')).toBe('https://github.com/u/r');
  });
  it('scp shorthand', () => {
    expect(toWebUrl('git@github.com:u/r.git')).toBe('https://github.com/u/r');
  });
  it('ssh://', () => {
    expect(toWebUrl('ssh://git@gitlab.com/u/r.git')).toBe('https://gitlab.com/u/r');
  });
  it('scp shorthand with nested subgroups', () => {
    expect(toWebUrl('git@gitlab.com:group/sub/repo.git')).toBe('https://gitlab.com/group/sub/repo');
  });
  it('drops an explicit ssh port from the host', () => {
    expect(toWebUrl('ssh://git@github.com:22/u/r.git')).toBe('https://github.com/u/r');
  });
  it('https without a .git suffix', () => {
    expect(toWebUrl('https://github.com/u/r')).toBe('https://github.com/u/r');
  });
  it('upgrades http to https', () => {
    expect(toWebUrl('http://example.com/u/r.git')).toBe('https://example.com/u/r');
  });
  it('empty or invalid', () => {
    expect(toWebUrl('')).toBe('');
    expect(toWebUrl('not-a-url')).toBe('');
  });
});

describe('guessCloneDirName', () => {
  it('takes the last path segment and strips .git', () => {
    expect(guessCloneDirName('https://github.com/user/repo.git')).toBe('repo');
  });
  it('ignores trailing slashes', () => {
    expect(guessCloneDirName('https://github.com/user/repo/')).toBe('repo');
  });
  it('scp shorthand', () => {
    expect(guessCloneDirName('git@github.com:user/repo.git')).toBe('repo');
  });
  it('falls back to repo when nothing usable remains', () => {
    expect(guessCloneDirName('')).toBe('repo');
    expect(guessCloneDirName('.git')).toBe('repo');
  });
});

describe('commit and file urls', () => {
  it('commit url', () => {
    expect(commitWebUrl('https://github.com/u/r', 'abc123')).toBe('https://github.com/u/r/commit/abc123');
  });
  it('file url', () => {
    expect(fileWebUrl('https://github.com/u/r', 'main', 'src/a.ts')).toBe('https://github.com/u/r/blob/main/src/a.ts');
  });
  it('encodes a branch name with a slash in the file url', () => {
    expect(fileWebUrl('https://github.com/u/r', 'feature/x', 'a.ts')).toBe(
      'https://github.com/u/r/blob/feature%2Fx/a.ts',
    );
  });
  it('returns empty when there is no web base', () => {
    expect(commitWebUrl('', 'abc123')).toBe('');
    expect(fileWebUrl('', 'main', 'a.ts')).toBe('');
  });
});
