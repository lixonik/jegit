import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Git } from '../src/git/git';

class GitWithDir extends Git {
  constructor(private readonly gitDir: string) {
    super('D:/repo');
  }

  override async raw(args: string[]): Promise<string> {
    if (args.join(' ') === 'rev-parse --absolute-git-dir') return this.gitDir + '\n';
    return '';
  }
}

describe('Git.operationState', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jegit-gitdir-'));
  });

  it('reports a quiet repository as null', async () => {
    expect(await new GitWithDir(gitDir).operationState()).toBeNull();
  });

  it('detects an in-progress merge', async () => {
    fs.writeFileSync(path.join(gitDir, 'MERGE_HEAD'), 'abc');
    expect(await new GitWithDir(gitDir).operationState()).toBe('merge');
  });

  it('detects an in-progress rebase via either marker directory', async () => {
    fs.mkdirSync(path.join(gitDir, 'rebase-merge'));
    expect(await new GitWithDir(gitDir).operationState()).toBe('rebase');

    fs.rmdirSync(path.join(gitDir, 'rebase-merge'));
    fs.mkdirSync(path.join(gitDir, 'rebase-apply'));
    expect(await new GitWithDir(gitDir).operationState()).toBe('rebase');
  });

  it('prefers rebase over merge when both markers exist', async () => {
    fs.mkdirSync(path.join(gitDir, 'rebase-merge'));
    fs.writeFileSync(path.join(gitDir, 'MERGE_HEAD'), 'abc');
    expect(await new GitWithDir(gitDir).operationState()).toBe('rebase');
  });

  it('detects cherry-pick and revert states', async () => {
    fs.writeFileSync(path.join(gitDir, 'CHERRY_PICK_HEAD'), 'abc');
    expect(await new GitWithDir(gitDir).operationState()).toBe('cherry-pick');
    fs.unlinkSync(path.join(gitDir, 'CHERRY_PICK_HEAD'));
    fs.writeFileSync(path.join(gitDir, 'REVERT_HEAD'), 'abc');
    expect(await new GitWithDir(gitDir).operationState()).toBe('revert');
  });

  it('returns null when the git dir cannot be resolved', async () => {
    class BrokenGit extends Git {
      constructor() {
        super('D:/repo');
      }
      override async raw(): Promise<string> {
        throw new Error('not a repository');
      }
    }
    expect(await new BrokenGit().operationState()).toBeNull();
  });
});
