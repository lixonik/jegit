import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalChangesController } from '../src/ui/localChangesController';
import { DEFAULT_CHANGELIST_ID } from '../src/model/changelistStore';
import type { Repository } from '../src/model/repository';
import type { Incoming } from '../src/model/webviewMessages';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;
const cmd = vscode.commands as unknown as Record<string, AnyFn>;

function makeRepo(overrides: Record<string, unknown> = {}): Repository {
  return {
    store: {
      activeId: 'cl1',
      changelists: [
        { id: 'cl1', name: 'Default' },
        { id: 'cl2', name: 'Feature X' },
      ],
      getChangelist: (id: string) => ({ id, name: 'Feature X' }),
    },
    git: {
      add: vi.fn(async () => undefined),
      unstage: vi.fn(async () => undefined),
      commitIndex: vi.fn(async () => undefined),
      recentCommitMessages: vi.fn(async () => []),
      commitBody: vi.fn(async () => ''),
      raw: vi.fn(async () => ''),
    },
    commit: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    setActive: vi.fn(async () => undefined),
    newChangelist: vi.fn(async () => ({ id: 'cl3', name: 'New list' })),
    rename: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    absUri: (rel: string) => ({ fsPath: 'Z:/nonexistent/' + rel }),
    ...overrides,
  } as unknown as Repository;
}

function makeController(repo = makeRepo()) {
  const posts: Array<Record<string, unknown>> = [];
  const ctrl = new LocalChangesController({ extensionUri: {} } as never, repo, (m) =>
    posts.push(m as Record<string, unknown>),
  );
  return { ctrl, repo, posts };
}

const commitMsg = (over: Record<string, unknown> = {}): Incoming =>
  ({
    type: 'commit',
    paths: ['a.ts'],
    message: 'Fix the filter',
    amend: false,
    push: false,
    signoff: false,
    author: '',
    ...over,
  }) as Incoming;

describe('LocalChangesController', () => {
  beforeEach(() => {
    win.showInputBox = async () => undefined;
    win.showQuickPick = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    cmd.executeCommand = async () => undefined;
  });

  it('ignores messages of other tabs', async () => {
    const { ctrl, posts } = makeController();
    expect(await ctrl.handle({ type: 'requestLog' } as Incoming)).toBe(false);
    expect(posts).toEqual([]);
  });

  it('refuses to delete the default changelist', async () => {
    const { ctrl, repo } = makeController();
    await ctrl.handle({ type: 'deleteChangelist', id: DEFAULT_CHANGELIST_ID } as Incoming);
    expect(repo.remove).not.toHaveBeenCalled();
    await ctrl.handle({ type: 'deleteChangelist', id: 'cl2' } as Incoming);
    expect(repo.remove).toHaveBeenCalledWith('cl2');
  });

  it('requires files and a message to commit', async () => {
    const { ctrl, repo } = makeController();
    await ctrl.handle(commitMsg({ paths: [] }));
    await ctrl.handle(commitMsg({ message: '   ' }));
    expect(repo.commit).not.toHaveBeenCalled();
  });

  it('commits and notifies the webview', async () => {
    const { ctrl, repo, posts } = makeController();
    await ctrl.handle(commitMsg());
    expect(repo.commit).toHaveBeenCalledWith(['a.ts'], 'Fix the filter', {
      amend: false,
      push: false,
      signoff: false,
      author: undefined,
    });
    expect(posts).toContainEqual({ type: 'committed' });
  });

  it('blocks a flagged message until the user confirms', async () => {
    const { ctrl, repo } = makeController();
    const longSubject = 'x'.repeat(80);
    await ctrl.handle(commitMsg({ message: longSubject }));
    expect(repo.commit).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Commit Anyway';
    await ctrl.handle(commitMsg({ message: longSubject }));
    expect(repo.commit).toHaveBeenCalled();
  });

  it('creates, renames and activates changelists from the prompts', async () => {
    const { ctrl, repo } = makeController();
    win.showInputBox = async () => '  Feature Y  ';
    await ctrl.handle({ type: 'newChangelist' } as Incoming);
    expect(repo.newChangelist).toHaveBeenCalledWith('Feature Y');

    await ctrl.handle({ type: 'renameChangelist', id: 'cl2' } as Incoming);
    expect(repo.rename).toHaveBeenCalledWith('cl2', 'Feature Y');

    await ctrl.handle({ type: 'setActive', id: 'cl2' } as Incoming);
    expect(repo.setActive).toHaveBeenCalledWith('cl2');
  });

  it('assigns dropped files straight to a changelist', async () => {
    const { ctrl, repo } = makeController();
    await ctrl.handle({ type: 'assignTo', paths: ['a.ts'], id: 'cl2' } as Incoming);
    expect(repo.move).toHaveBeenCalledWith(['a.ts'], 'cl2');
  });

  it('marks conflicted files resolved by staging them', async () => {
    const { ctrl, repo } = makeController();
    await ctrl.handle({ type: 'markResolved', paths: ['a.ts'] } as Incoming);
    expect(repo.git.add).toHaveBeenCalledWith(['a.ts']);
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('unstages only a non-empty selection', async () => {
    const { ctrl, repo } = makeController();
    await ctrl.handle({ type: 'unstage', paths: [] } as Incoming);
    expect(repo.git.unstage).not.toHaveBeenCalled();
    await ctrl.handle({ type: 'unstage', paths: ['a.ts'] } as Incoming);
    expect(repo.git.unstage).toHaveBeenCalledWith(['a.ts']);
  });

  it('copies the relative or absolute path to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    (vscode.env.clipboard as { writeText: unknown }).writeText = writeText;
    const { ctrl } = makeController();
    await ctrl.handle({ type: 'copyPath', path: 'src/a.ts', absolute: false } as Incoming);
    expect(writeText).toHaveBeenCalledWith('src/a.ts');
    await ctrl.handle({ type: 'copyPath', path: 'src/a.ts', absolute: true } as Incoming);
    expect(writeText).toHaveBeenLastCalledWith('Z:/nonexistent/src/a.ts');
  });

  it('replies to getLastCommitMessage with the HEAD body', async () => {
    const repo = makeRepo();
    (repo.git as unknown as Record<string, unknown>).commitBody = vi.fn(async () => 'last message');
    const { ctrl, posts } = makeController(repo);
    await ctrl.handle({ type: 'getLastCommitMessage' } as Incoming);
    expect(posts).toContainEqual({ type: 'lastCommitMessage', message: 'last message' });
  });

  it('opens a file in the editor via vscode.open', async () => {
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    const { ctrl } = makeController();
    await ctrl.handle({ type: 'openFile', path: 'src/a.ts' } as Incoming);
    expect(exec).toHaveBeenCalledWith('vscode.open', { fsPath: 'Z:/nonexistent/src/a.ts' });
  });

  it('warns before amending a pushed commit', async () => {
    const repo = makeRepo();
    (repo.git as unknown as Record<string, unknown>).raw = vi.fn(async () => 'origin/main\n');
    (repo.git as unknown as Record<string, unknown>).headHash = vi.fn(async () => 'h1');
    (repo.git as unknown as Record<string, unknown>).outgoingHashes = vi.fn(async () => []);
    const { ctrl } = makeController(repo);
    await ctrl.handle(commitMsg({ amend: true }));
    expect(repo.commit).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Amend Anyway';
    await ctrl.handle(commitMsg({ amend: true }));
    expect(repo.commit).toHaveBeenCalled();
  });

  it('amends an unpushed commit without a warning', async () => {
    const repo = makeRepo();
    (repo.git as unknown as Record<string, unknown>).raw = vi.fn(async () => 'origin/main\n');
    (repo.git as unknown as Record<string, unknown>).headHash = vi.fn(async () => 'h1');
    (repo.git as unknown as Record<string, unknown>).outgoingHashes = vi.fn(async () => ['h1']);
    const warn = vi.fn(async () => undefined);
    win.showWarningMessage = warn;
    const { ctrl } = makeController(repo);
    await ctrl.handle(commitMsg({ amend: true }));
    expect(repo.commit).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('commits the staging area and pushes when asked', async () => {
    const { ctrl, repo, posts } = makeController();
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    await ctrl.handle({ type: 'commitStaged', message: 'Fix the filter', push: true } as Incoming);
    expect(repo.git.commitIndex).toHaveBeenCalledWith('Fix the filter');
    expect(posts).toContainEqual({ type: 'committed' });
    expect(exec).toHaveBeenCalledWith('jegit.push');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('moves files to the picked changelist', async () => {
    const { ctrl, repo } = makeController();
    win.showQuickPick = async () => ({ label: 'Feature X', id: 'cl2' });
    await ctrl.handle({ type: 'move', paths: ['a.ts'] } as Incoming);
    expect(repo.move).toHaveBeenCalledWith(['a.ts'], 'cl2');
  });

  it('creates a changelist on the fly when moving to a new one', async () => {
    const { ctrl, repo } = makeController();
    win.showQuickPick = async () => ({ label: 'New changelist...', id: '__new__' });
    win.showInputBox = async () => 'Hotfix';
    await ctrl.handle({ type: 'move', paths: ['a.ts'] } as Incoming);
    expect(repo.newChangelist).toHaveBeenCalledWith('Hotfix', false);
    expect(repo.move).toHaveBeenCalledWith(['a.ts'], 'cl3');
  });

  it('rolls back tracked files only after confirmation', async () => {
    const { ctrl, repo } = makeController();
    await ctrl.handle({ type: 'rollback', items: [{ path: 'a.ts', untracked: false }] } as Incoming);
    expect(repo.git.raw).not.toHaveBeenCalled();

    win.showWarningMessage = async () => 'Rollback';
    await ctrl.handle({ type: 'rollback', items: [{ path: 'a.ts', untracked: false }] } as Incoming);
    expect(repo.git.raw).toHaveBeenCalledWith(['checkout', 'HEAD', '--', 'a.ts']);
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('lists the affected files in the rollback confirmation', async () => {
    const warn = vi.fn(async () => undefined);
    win.showWarningMessage = warn;
    const { ctrl } = makeController();
    const items = Array.from({ length: 12 }, (_, i) => ({ path: `src/f${i}.ts`, untracked: false }));
    await ctrl.handle({ type: 'rollback', items } as Incoming);
    const [, options] = warn.mock.calls[0] as [string, { detail: string }];
    expect(options.detail).toContain('src/f0.ts');
    expect(options.detail).toContain('src/f9.ts');
    expect(options.detail).toContain('... and 2 more');
    expect(options.detail).not.toContain('src/f10.ts');
  });

  it('skips staging when nothing is selected but still refreshes', async () => {
    const { ctrl, repo } = makeController();
    await ctrl.handle({ type: 'stage', paths: [] } as Incoming);
    expect(repo.git.add).not.toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
  });
});

describe('LocalChangesController addToGitignore and recall', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jegit-gitignore-'));
    win.showQuickPick = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  function makeFsRepo(overrides: Record<string, unknown> = {}) {
    return makeRepo({ absUri: (rel: string) => ({ fsPath: path.join(root, rel) }), ...overrides });
  }

  it('creates .gitignore and appends the entry', async () => {
    const { ctrl } = makeController(makeFsRepo());
    await ctrl.handle({ type: 'addToGitignore', path: 'dist/' } as Incoming);
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('dist/\n');
  });

  it('does not duplicate an existing entry', async () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n');
    const { ctrl } = makeController(makeFsRepo());
    await ctrl.handle({ type: 'addToGitignore', path: 'dist/' } as Incoming);
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('dist/\n');
  });

  it('inserts a separator when the file has no trailing newline', async () => {
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/');
    const { ctrl } = makeController(makeFsRepo());
    await ctrl.handle({ type: 'addToGitignore', path: 'dist/' } as Incoming);
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('node_modules/\ndist/\n');
  });

  it('deletes untracked files from disk on a confirmed rollback', async () => {
    fs.writeFileSync(path.join(root, 'scratch.ts'), 'temporary');
    const repo = makeFsRepo();
    win.showWarningMessage = async () => 'Rollback';
    const { ctrl } = makeController(repo);
    await ctrl.handle({ type: 'rollback', items: [{ path: 'scratch.ts', untracked: true }] } as Incoming);
    expect(fs.existsSync(path.join(root, 'scratch.ts'))).toBe(false);
    expect(repo.git.raw).not.toHaveBeenCalled();
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('keeps untracked files when the rollback is declined', async () => {
    fs.writeFileSync(path.join(root, 'scratch.ts'), 'temporary');
    const { ctrl } = makeController(makeFsRepo());
    await ctrl.handle({ type: 'rollback', items: [{ path: 'scratch.ts', untracked: true }] } as Incoming);
    expect(fs.existsSync(path.join(root, 'scratch.ts'))).toBe(true);
  });

  it('posts the picked recent commit message back to the webview', async () => {
    const repo = makeFsRepo({
      git: {
        add: vi.fn(async () => undefined),
        unstage: vi.fn(async () => undefined),
        commitIndex: vi.fn(async () => undefined),
        recentCommitMessages: vi.fn(async () => ['Fix a\n\nbody', 'Fix b']),
        commitBody: vi.fn(async () => ''),
        raw: vi.fn(async () => ''),
      },
    });
    win.showQuickPick = async () => ({ label: 'Fix a', value: 'Fix a\n\nbody' });
    const { ctrl, posts } = makeController(repo);
    await ctrl.handle({ type: 'recallMessage' } as Incoming);
    expect(posts).toContainEqual({ type: 'setCommitMessage', text: 'Fix a\n\nbody' });
  });
});

const sampleDiff = [
  'diff --git a/a.ts b/a.ts',
  'index 1111111..2222222 100644',
  '--- a/a.ts',
  '+++ b/a.ts',
  '@@ -1,3 +1,3 @@',
  '-old',
  '+new',
  ' ctx',
  '@@ -10,3 +10,3 @@',
  '-old2',
  '+new2',
  ' ctx2',
  '',
].join('\n');

describe('LocalChangesController commitHunks', () => {
  function makeHunksRepo(diff = sampleDiff) {
    return makeRepo({
      git: {
        add: vi.fn(async () => undefined),
        unstage: vi.fn(async () => undefined),
        commitIndex: vi.fn(async () => undefined),
        recentCommitMessages: vi.fn(async () => []),
        commitBody: vi.fn(async () => ''),
        raw: vi.fn(async () => ''),
        diffHead: vi.fn(async () => diff),
        applyCached: vi.fn(async () => undefined),
      },
    });
  }

  beforeEach(() => {
    win.showQuickPick = async () => undefined;
    win.showInputBox = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('reports when the file has no changes', async () => {
    const repo = makeHunksRepo('');
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const { ctrl } = makeController(repo);
    await ctrl.handle({ type: 'commitHunks', path: 'a.ts' } as Incoming);
    expect(info).toHaveBeenCalled();
    expect(repo.git.commitIndex).not.toHaveBeenCalled();
  });

  it('stages the picked hunks and commits the index', async () => {
    const repo = makeHunksRepo();
    win.showQuickPick = async () => [{ label: '@@ -1,3 +1,3 @@', index: 0 }];
    win.showInputBox = async () => 'Partial commit';
    const { ctrl } = makeController(repo);
    await ctrl.handle({ type: 'commitHunks', path: 'a.ts' } as Incoming);
    expect(repo.git.applyCached).toHaveBeenCalled();
    expect(repo.git.commitIndex).toHaveBeenCalledWith('Partial commit');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('commits nothing when the hunk pick is cancelled', async () => {
    const repo = makeHunksRepo();
    const { ctrl } = makeController(repo);
    await ctrl.handle({ type: 'commitHunks', path: 'a.ts' } as Incoming);
    expect(repo.git.applyCached).not.toHaveBeenCalled();
    expect(repo.git.commitIndex).not.toHaveBeenCalled();
  });
});
