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

  it('skips intent-to-add for an empty selection', async () => {
    const git = new RecordingGit();
    await git.addIntentToAdd([]);
    await git.addIntentToAdd(['new.ts']);
    expect(git.calls).toEqual([['add', '-N', '--', 'new.ts']]);
  });
});
