import { describe, it, expect } from 'vitest';
import { Git } from '../src/git/git';

class RecordingGit extends Git {
  readonly calls: string[][] = [];

  constructor() {
    super('D:/repo');
  }

  override async raw(args: string[]): Promise<string> {
    this.calls.push(args);
    return '';
  }
}

class ScriptedGit extends Git {
  readonly calls: string[][] = [];

  constructor(private readonly responses: Record<string, string | Error>) {
    super('D:/repo');
  }

  override async raw(args: string[]): Promise<string> {
    this.calls.push(args);
    const response = this.responses[args.join(' ')];
    if (response instanceof Error) throw response;
    return response ?? '';
  }
}

describe('Git.pushUpTo', () => {
  it('pushes the commit to the upstream remote of the current branch', async () => {
    const git = new ScriptedGit({
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'rev-parse --abbrev-ref --symbolic-full-name @{u}': 'fork/main\n',
    });
    await git.pushUpTo('abc123');
    expect(git.calls.at(-1)).toEqual(['push', 'fork', 'abc123:refs/heads/main']);
  });

  it('falls back to origin when the branch has no upstream', async () => {
    const git = new ScriptedGit({
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'rev-parse --abbrev-ref --symbolic-full-name @{u}': new Error('no upstream'),
    });
    await git.pushUpTo('abc123');
    expect(git.calls.at(-1)).toEqual(['push', 'origin', 'abc123:refs/heads/main']);
  });
});

class PatchGit extends Git {
  constructor(private readonly behavior: (args: string[]) => Promise<string>) {
    super('D:/repo');
  }

  override async raw(args: string[]): Promise<string> {
    return this.behavior(args);
  }
}

describe('Git query composition', () => {
  it('assembles the branch overview and drops remote HEAD entries', async () => {
    const git = new ScriptedGit({
      'rev-parse --abbrev-ref HEAD': 'main\n',
      'for-each-ref --format=%(refname:short) refs/heads': 'main\ndev\n',
      'for-each-ref --format=%(refname:short) refs/remotes': 'origin/HEAD\norigin/main\n',
    });
    expect(await git.branches()).toEqual({ current: 'main', locals: ['main', 'dev'], remotes: ['origin/main'] });
  });

  it('survives ref queries failing in an empty repository', async () => {
    const git = new ScriptedGit({
      'rev-parse --abbrev-ref HEAD': new Error('unborn branch'),
      'for-each-ref --format=%(refname:short) refs/heads': new Error('no refs'),
      'for-each-ref --format=%(refname:short) refs/remotes': new Error('no refs'),
    });
    expect(await git.branches()).toEqual({ current: '', locals: [], remotes: [] });
  });

  it('appends the path filter to the log arguments only when set', async () => {
    const git = new RecordingGit();
    await git.log(50, 'main', 'src/a.ts');
    await git.log(50, 'main');
    expect(git.calls[0].slice(-2)).toEqual(['--', 'src/a.ts']);
    expect(git.calls[1]).not.toContain('--');
    expect(git.calls[0]).toContain('--max-count=50');
    expect(git.calls[0][1]).toBe('main');
  });

  it('answers ancestry as a boolean from the merge-base exit code', async () => {
    const yes = new ScriptedGit({ 'merge-base --is-ancestor a b': '' });
    expect(await yes.isAncestor('a', 'b')).toBe(true);
    const no = new ScriptedGit({ 'merge-base --is-ancestor a b': new Error('exit 1') });
    expect(await no.isAncestor('a', 'b')).toBe(false);
  });
});

describe('Git.applyPatch3way', () => {
  it('reports clean when the straight apply succeeds', async () => {
    const git = new PatchGit(async () => '');
    expect(await git.applyPatch3way('p.patch')).toBe('clean');
  });

  it('falls back to a 3-way merge when the straight apply fails', async () => {
    const git = new PatchGit(async (args) => {
      if (args[0] === 'apply' && !args.includes('--3way')) throw new Error('does not apply');
      return '';
    });
    expect(await git.applyPatch3way('p.patch')).toBe('clean');
  });

  it('reports conflicts when the 3-way merge leaves unmerged entries', async () => {
    const git = new PatchGit(async (args) => {
      if (args[0] === 'apply') throw new Error('applied with conflicts');
      if (args[0] === 'ls-files') return '100644 abc 1\tsrc/a.ts\n';
      return '';
    });
    expect(await git.applyPatch3way('p.patch')).toBe('conflicts');
  });

  it('rethrows when the patch cannot be applied at all', async () => {
    const git = new PatchGit(async (args) => {
      if (args[0] === 'apply') throw new Error('corrupt patch');
      return '';
    });
    await expect(git.applyPatch3way('p.patch')).rejects.toThrow('corrupt patch');
  });
});

describe('Git argument assembly', () => {
  it('commits with the picked paths only', async () => {
    const git = new RecordingGit();
    await git.commit('Fix', ['a.ts', 'b.ts']);
    expect(git.calls[0]).toEqual(['commit', '-m', 'Fix', '--', 'a.ts', 'b.ts']);
  });

  it('adds amend, signoff and author flags on demand', async () => {
    const git = new RecordingGit();
    await git.commit('Fix', [], { amend: true, signoff: true, author: 'Dev <d@e>' });
    expect(git.calls[0]).toEqual(['commit', '-m', 'Fix', '--amend', '--signoff', '--author', 'Dev <d@e>']);
  });

  it('merges with the requested mode', async () => {
    const git = new RecordingGit();
    await git.mergeBranch('feature/x');
    await git.mergeBranch('feature/x', 'no-ff');
    await git.mergeBranch('feature/x', 'squash');
    expect(git.calls).toEqual([
      ['merge', 'feature/x'],
      ['merge', '--no-ff', 'feature/x'],
      ['merge', '--squash', 'feature/x'],
    ]);
  });

  it('resets with the requested mode', async () => {
    const git = new RecordingGit();
    await git.reset('abc', 'soft');
    await git.reset('abc', 'hard');
    expect(git.calls).toEqual([
      ['reset', '--soft', 'abc'],
      ['reset', '--hard', 'abc'],
    ]);
  });

  it('creates a branch from an optional base', async () => {
    const git = new RecordingGit();
    await git.checkoutNew('feature/x');
    await git.checkoutNew('feature/x', 'v1.0');
    expect(git.calls).toEqual([
      ['checkout', '-b', 'feature/x'],
      ['checkout', '-b', 'feature/x', 'v1.0'],
    ]);
  });

  it('deletes a branch with -d and forces with -D', async () => {
    const git = new RecordingGit();
    await git.deleteBranch('feature/x');
    await git.deleteBranch('feature/x', true);
    expect(git.calls).toEqual([
      ['branch', '-d', 'feature/x'],
      ['branch', '-D', 'feature/x'],
    ]);
  });

  it('reads blobs with the right revision spec', async () => {
    const git = new RecordingGit();
    await git.showHead('src/a.ts');
    await git.showRev('abc123', 'src/a.ts');
    await git.showStage(2, 'src/a.ts');
    expect(git.calls).toEqual([
      ['show', 'HEAD:src/a.ts'],
      ['show', 'abc123:src/a.ts'],
      ['show', ':2:src/a.ts'],
    ]);
  });

  it('returns an empty blob for an empty revision and on git failure', async () => {
    const git = new RecordingGit();
    expect(await git.showRev('', 'src/a.ts')).toBe('');
    expect(git.calls).toEqual([]);

    const failing = new ScriptedGit({});
    failing.raw = async () => {
      throw new Error('bad object');
    };
    expect(await failing.showHead('src/a.ts')).toBe('');
    expect(await failing.showStage(3, 'src/a.ts')).toBe('');
  });

  it('unstages only a non-empty selection', async () => {
    const git = new RecordingGit();
    await git.unstage([]);
    await git.unstage(['a.ts']);
    expect(git.calls).toEqual([['reset', '-q', 'HEAD', '--', 'a.ts']]);
  });

  it('restores a file from a revision', async () => {
    const git = new RecordingGit();
    await git.restoreFile('abc123', 'src/a.ts');
    expect(git.calls).toEqual([['checkout', 'abc123', '--', 'src/a.ts']]);
  });

  it('skips intent-to-add for an empty selection', async () => {
    const git = new RecordingGit();
    await git.addIntentToAdd([]);
    await git.addIntentToAdd(['new.ts']);
    expect(git.calls).toEqual([['add', '-N', '--', 'new.ts']]);
  });

  it('checks out one side of a conflicted file', async () => {
    const git = new RecordingGit();
    await git.checkoutSide('src/a.ts', 'ours');
    await git.checkoutSide('src/a.ts', 'theirs');
    expect(git.calls).toEqual([
      ['checkout', '--ours', '--', 'src/a.ts'],
      ['checkout', '--theirs', '--', 'src/a.ts'],
    ]);
  });

  it('builds the line-range log query', async () => {
    const git = new RecordingGit();
    await git.logForLines('src/a.ts', 5, 10);
    expect(git.calls).toEqual([['log', '-L', '5,10:src/a.ts']]);
  });

  it('pushes a branch to an explicit remote', async () => {
    const git = new RecordingGit();
    await git.pushBranch('fork', 'feature/x');
    expect(git.calls).toEqual([['push', 'fork', 'feature/x']]);
  });

  it('deletes a branch on the remote', async () => {
    const git = new RecordingGit();
    await git.deleteRemoteBranch('origin', 'feature/x');
    expect(git.calls).toEqual([['push', 'origin', '--delete', 'feature/x']]);
  });

  it('fetches all remotes with pruning', async () => {
    const git = new RecordingGit();
    await git.fetchPrune();
    expect(git.calls).toEqual([['fetch', '--all', '--prune']]);
  });
});
