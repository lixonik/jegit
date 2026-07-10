import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
  return {
    git,
    branch: 'main',
    refresh: vi.fn(async () => undefined),
    absUri: (rel: string) => ({ fsPath: 'D:/repo/' + rel }),
  } as unknown as Repository;
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

  it('copies the full commit message to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    (vscode.env.clipboard as { writeText: unknown }).writeText = writeText;
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'copyMessage', hash: 'abc' } as Incoming);
    expect(git.commitBody).toHaveBeenCalledWith('abc');
    expect(writeText).toHaveBeenCalledWith('old message');
  });

  it('reports instead of copying an unreadable commit message', async () => {
    const writeText = vi.fn(async () => undefined);
    (vscode.env.clipboard as { writeText: unknown }).writeText = writeText;
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const { ctrl } = makeController(makeGit({ commitBody: vi.fn(async () => ' \n') }));
    await ctrl.handle({ type: 'copyMessage', hash: 'abc' } as Incoming);
    expect(writeText).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalled();
  });

  it('remembers the path filter for subsequent log queries', async () => {
    const { ctrl, git } = makeController();
    win.showInputBox = async () => 'src/app';
    await ctrl.handle({ type: 'logPathFilter' } as Incoming);
    await ctrl.handle({ type: 'requestLog' } as Incoming);
    expect(git.log).toHaveBeenLastCalledWith(400, '--all', 'src/app');
  });

  it('switches the log scope to a picked containing branch', async () => {
    const { ctrl, git } = makeController();
    win.showQuickPick = async () => 'main';
    await ctrl.handle({ type: 'branchesContaining', hash: 'abc' } as Incoming);
    await ctrl.handle({ type: 'requestLog' } as Incoming);
    expect(git.log).toHaveBeenLastCalledWith(400, 'main', '');
  });

  it('keeps the scope when the branch filter is cancelled', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'logBranchFilter' } as Incoming);
    await ctrl.handle({ type: 'requestLog' } as Incoming);
    expect(git.log).toHaveBeenLastCalledWith(400, '--all', '');
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

  it('exports a commit as a patch file via the save dialog', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jegit-patch-'));
    const target = path.join(dir, 'export.patch');
    win.showSaveDialog = async () => ({ fsPath: target });
    const { ctrl } = makeController(makeGit({ commitPatch: vi.fn(async () => 'patch body\n') }));
    await ctrl.handle({ type: 'createPatchFromCommit', hash: 'abc' } as Incoming);
    expect(fs.readFileSync(target, 'utf8')).toBe('patch body\n');
  });

  it('refuses to export an empty patch', async () => {
    const save = vi.fn(async () => undefined);
    win.showSaveDialog = save;
    const { ctrl } = makeController(makeGit({ commitPatch: vi.fn(async () => '  \n') }));
    await ctrl.handle({ type: 'createPatchFromCommit', hash: 'abc' } as Incoming);
    expect(save).not.toHaveBeenCalled();
  });

  it('browses the repository files at a commit', async () => {
    const exec = vi.fn(async () => undefined);
    (vscode.commands as unknown as Record<string, unknown>).executeCommand = exec;
    win.showQuickPick = async () => 'src/a.ts';
    const { ctrl, git } = makeController(makeGit({ lsTree: vi.fn(async () => ['src/a.ts', 'src/b.ts']) }));
    await ctrl.handle({ type: 'browseAt', hash: 'abc123' } as Incoming);
    expect(git.lsTree).toHaveBeenCalledWith('abc123');
    const [cmd, uri] = exec.mock.calls[0] as [string, { path: string; query: string }];
    expect(cmd).toBe('vscode.open');
    expect(uri.path).toBe('/src/a.ts');
    expect(uri.query).toBe('abc123');
  });

  it('reports an empty tree instead of opening the browser pick', async () => {
    const exec = vi.fn(async () => undefined);
    (vscode.commands as unknown as Record<string, unknown>).executeCommand = exec;
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const { ctrl } = makeController(makeGit({ lsTree: vi.fn(async () => []) }));
    await ctrl.handle({ type: 'browseAt', hash: 'abc123' } as Incoming);
    expect(info).toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('diffs a revision file against the local copy', async () => {
    const exec = vi.fn(async () => undefined);
    (vscode.commands as unknown as Record<string, unknown>).executeCommand = exec;
    const { ctrl } = makeController();
    await ctrl.handle({ type: 'openRevLocalDiff', hash: 'a'.repeat(40), path: 'src/a.ts' } as Incoming);
    expect(exec).toHaveBeenCalled();
    const [cmd, , right, title] = exec.mock.calls[0] as [string, unknown, { fsPath: string }, string];
    expect(cmd).toBe('vscode.diff');
    expect(right.fsPath).toBe('D:/repo/src/a.ts');
    expect(title).toContain('Local');
  });

  it('opens a revision file on the remote web host', async () => {
    const open = vi.fn(async () => true);
    (vscode.env as unknown as Record<string, unknown>).openExternal = open;
    const { ctrl } = makeController(
      makeGit({ remote: { list: vi.fn(async () => [{ name: 'origin', url: 'https://github.com/u/r.git' }]) } }),
    );
    await ctrl.handle({ type: 'openRevFileRemote', hash: 'a'.repeat(40), path: 'src/a.ts' } as Incoming);
    const uri = open.mock.calls[0][0] as { value?: string };
    expect(String(uri.value ?? uri)).toContain(`/blob/${'a'.repeat(40)}/src/a.ts`);
  });

  it('reports when the revision file has no remote web url', async () => {
    const open = vi.fn(async () => true);
    (vscode.env as unknown as Record<string, unknown>).openExternal = open;
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const { ctrl } = makeController(makeGit({ remote: { list: vi.fn(async () => []) } }));
    await ctrl.handle({ type: 'openRevFileRemote', hash: 'a'.repeat(40), path: 'src/a.ts' } as Incoming);
    expect(info).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('checks out a revision detached and reverts a commit', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'checkoutRev', hash: 'abc1234' } as Incoming);
    expect(git.checkout).toHaveBeenCalledWith('abc1234');

    const revert = vi.fn(async () => undefined);
    const other = makeController(makeGit({ revert }));
    await other.ctrl.handle({ type: 'revertCommit', hash: 'abc1234' } as Incoming);
    expect(revert).toHaveBeenCalledWith('abc1234');
  });

  it('fixes a commit up into its parent via a rebase action', async () => {
    const { ctrl, git } = makeController();
    await ctrl.handle({ type: 'fixupCommit', hash: 'abc1234' } as Incoming);
    expect(git.rebaseAction).toHaveBeenCalledWith('abc1234~2', 'abc1234', 'fixup', expect.any(String));
  });

  it('resets to a commit with the picked mode, guarding the hard reset', async () => {
    const { ctrl, git } = makeController();
    win.showQuickPick = async () => ({ label: 'Soft', mode: 'soft' });
    await ctrl.handle({ type: 'resetTo', hash: 'abc1234' } as Incoming);
    expect(git.reset).toHaveBeenCalledWith('abc1234', 'soft');

    win.showQuickPick = async () => ({ label: 'Hard', mode: 'hard' });
    await ctrl.handle({ type: 'resetTo', hash: 'abc1234' } as Incoming);
    expect(git.reset).toHaveBeenCalledTimes(1);

    win.showWarningMessage = async () => 'Reset';
    await ctrl.handle({ type: 'resetTo', hash: 'abc1234' } as Incoming);
    expect(git.reset).toHaveBeenLastCalledWith('abc1234', 'hard');
  });

  it('creates a tag at a commit from the prompts', async () => {
    const { ctrl, git } = makeController();
    const inputs = ['v2.0.0', 'release'];
    win.showInputBox = async () => inputs.shift();
    await ctrl.handle({ type: 'tagAt', hash: 'abc1234' } as Incoming);
    expect(git.tag.create).toHaveBeenCalledWith('v2.0.0', 'abc1234', 'release');
  });

  it('copies arbitrary text to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    (vscode.env.clipboard as { writeText: unknown }).writeText = writeText;
    const { ctrl } = makeController();
    await ctrl.handle({ type: 'copyText', text: 'feature/x' } as Incoming);
    expect(writeText).toHaveBeenCalledWith('feature/x');
  });

  it('copies the commit subject to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    (vscode.env.clipboard as { writeText: unknown }).writeText = writeText;
    const { ctrl } = makeController();
    await ctrl.handle({ type: 'copySubject', text: 'Fix the filter' } as Incoming);
    expect(writeText).toHaveBeenCalledWith('Fix the filter');
  });

  it('refreshes the tree and the log after a log operation', async () => {
    const { ctrl, git, repo, posts } = makeController();
    await ctrl.handle({ type: 'cherryPick', hash: 'abc' } as Incoming);
    expect(git.checkout).not.toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
    expect(posts.map((p) => p.type)).toContain('logData');
  });
});
