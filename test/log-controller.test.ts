import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { LogController } from '../src/ui/logController';
import type { Repository } from '../src/model/repository';
import type { Incoming } from '../src/model/webviewMessages';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;

function makeGit(overrides: Record<string, unknown> = {}) {
  return {
    log: vi.fn(async () => []),
    branches: vi.fn(async () => ({ current: 'main', locals: ['main'], remotes: [] })),
    outgoingHashes: vi.fn(async () => []),
    headHash: vi.fn(async () => 'headhash'),
    isAncestor: vi.fn(async () => true),
    rangeMessages: vi.fn(async () => 'first subject\nrest'),
    reset: vi.fn(async () => undefined),
    resetHard: vi.fn(async () => undefined),
    commitIndex: vi.fn(async () => undefined),
    commitBody: vi.fn(async () => 'old message'),
    amendMessage: vi.fn(async () => undefined),
    rebaseAction: vi.fn(async () => undefined),
    undoLastCommit: vi.fn(async () => undefined),
    checkout: vi.fn(async () => undefined),
    checkoutNew: vi.fn(async () => undefined),
    cherryPick: vi.fn(async () => undefined),
    pushUpTo: vi.fn(async () => undefined),
    commitFiles: vi.fn(async () => [{ status: 'M', path: 'a.ts' }]),
    commitCommitter: vi.fn(async () => ({ name: 'Dev', date: '2026-07-01' })),
    branchesContaining: vi.fn(async () => ['main']),
    tag: { containing: vi.fn(async () => ['v1']), create: vi.fn(async () => undefined) },
    ...overrides,
  };
}

function makeRepo(git: ReturnType<typeof makeGit>): Repository {
  return { git, branch: 'main', refresh: vi.fn(async () => undefined) } as unknown as Repository;
}

function makeController(git = makeGit()) {
  const posts: Array<Record<string, unknown>> = [];
  const repo = makeRepo(git);
  const ctrl = new LogController(
    { extensionUri: {} } as never,
    repo,
    (m) => posts.push(m as Record<string, unknown>),
  );
  return { ctrl, git, repo, posts };
}

describe('LogController', () => {
  beforeEach(() => {
    win.showInputBox = async () => undefined;
    win.showQuickPick = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('ignores messages of other tabs', async () => {
    const { ctrl, posts } = makeController();
    expect(await ctrl.handle({ type: 'refresh' } as Incoming)).toBe(false);
    expect(posts).toEqual([]);
  });

  it('answers requestLog with logData and branchData', async () => {
    const { ctrl, posts } = makeController();
    expect(await ctrl.handle({ type: 'requestLog' } as Incoming)).toBe(true);
    expect(posts.map((p) => p.type)).toEqual(['logData', 'branchData']);
  });

  it('falls back to --all when setLogScope gets an empty scope', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'setLogScope', scope: '' } as Incoming);
    expect(git.log).toHaveBeenCalledWith(400, '--all', '');
  });

  it('undoes only the latest commit', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'undoCommit', hash: 'nothead' } as Incoming);
    expect(git.undoLastCommit).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Undo Commit';
    await ctrl.handle({ type: 'undoCommit', hash: 'headhash' } as Incoming);
    expect(git.undoLastCommit).toHaveBeenCalled();
  });

  it('refuses to squash the head commit or a non-ancestor', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'squashTo', hash: 'headhash' } as Incoming);
    expect(git.reset).not.toHaveBeenCalled();

    git.isAncestor = vi.fn(async () => false) as never;
    await ctrl.handle({ type: 'squashTo', hash: 'older' } as Incoming);
    expect(git.reset).not.toHaveBeenCalled();
  });

  it('squashes via soft reset plus commit of the index', async () => {
    const { ctrl, git } = makeController();
    win.showInputBox = async () => 'combined subject';
    await ctrl.handle({ type: 'squashTo', hash: 'older' } as Incoming);
    expect(git.reset).toHaveBeenCalledWith('older~1', 'soft');
    expect(git.commitIndex).toHaveBeenCalledWith('combined subject');
  });

  it('rewords the head commit by amending', async () => {
    const { ctrl, git } = makeController();
    win.showInputBox = async () => 'new message';
    await ctrl.handle({ type: 'editMessage', hash: 'headhash' } as Incoming);
    expect(git.amendMessage).toHaveBeenCalledWith('new message');
    expect(git.rebaseAction).not.toHaveBeenCalled();
  });

  it('rewords an older commit via a rebase action', async () => {
    const { ctrl, git } = makeController();
    win.showInputBox = async () => 'new message';
    await ctrl.handle({ type: 'editMessage', hash: 'older' } as Incoming);
    expect(git.rebaseAction).toHaveBeenCalledWith('older~1', 'older', 'reword', expect.any(String), 'new message');
    expect(git.amendMessage).not.toHaveBeenCalled();
  });

  it('drops the head commit with a hard reset to its parent', async () => {
    const { ctrl, git } = makeController();
    win.showWarningMessage = async () => 'Drop';
    await ctrl.handle({ type: 'dropCommit', hash: 'headhash' } as Incoming);
    expect(git.resetHard).toHaveBeenCalledWith('headhash~1');
    expect(git.rebaseAction).not.toHaveBeenCalled();
  });

  it('does not create a branch when the name prompt is cancelled', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'newBranchAt', hash: 'abc' } as Incoming);
    expect(git.checkoutNew).not.toHaveBeenCalled();
  });

  it('copies a commit hash to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    (vscode.env.clipboard as { writeText: unknown }).writeText = writeText;
    const { ctrl } = makeController();
    await ctrl.handle({ type: 'copyHash', hash: 'abcdef1234567890' } as Incoming);
    expect(writeText).toHaveBeenCalledWith('abcdef1234567890');
  });

  it('refuses to push up to a commit outside the current branch', async () => {
    const { ctrl, git } = makeController(makeGit({ isAncestor: vi.fn(async () => false) }));
    await ctrl.handle({ type: 'pushUpTo', hash: 'abc' } as Incoming);
    expect(git.pushUpTo).not.toHaveBeenCalled();
  });

  it('pushes up to a commit after the modal confirmation', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'pushUpTo', hash: 'abc' } as Incoming);
    expect(git.pushUpTo).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Push';
    await ctrl.handle({ type: 'pushUpTo', hash: 'abc' } as Incoming);
    expect(git.pushUpTo).toHaveBeenCalledWith('abc');
  });

  it('aggregates the commit details into a single payload', async () => {
    const { ctrl, posts } = makeController();
    await ctrl.handle({ type: 'commitDetails', hash: 'abc' } as Incoming);
    expect(posts[0]).toEqual({
      type: 'commitDetailsData',
      hash: 'abc',
      files: [{ status: 'M', path: 'a.ts' }],
      body: 'old message',
      committer: { name: 'Dev', date: '2026-07-01' },
      branches: ['main'],
      tags: ['v1'],
    });
  });

  it('refreshes the tree and the log after a log operation', async () => {
    const { ctrl, git, repo, posts } = makeController();
    await ctrl.handle({ type: 'cherryPick', hash: 'abc' } as Incoming);
    expect(git.checkout).not.toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
    expect(posts.map((p) => p.type)).toContain('logData');
  });
});
