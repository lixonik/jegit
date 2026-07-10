import * as fs from 'fs';
import * as path from 'path';
import { execGit } from './runner';
import { GitStash } from './stash';
import { GitWorktrees } from './worktrees';
import { GitRemotes } from './remotes';
import { GitTags } from './tags';
import { parseNameStatusZ } from '../util/parse';
import { parseRecentBranches } from '../util/recentBranches';
import {
  LOG_FS,
  LOG_RS,
  parseAheadBehind,
  parseBlame,
  parseBranchList,
  parseFileLog,
  parseLog,
  parseMergedBranches,
  parseRangeCommits,
  parseRecentMessages,
  parseRefList,
  parseRemotes,
  parseStashList,
  parseStatus,
  parseTagList,
  parseWorktrees,
} from './parsers';
export * from './parsers';

import type { GitOperation, FileChange, LogCommit, CommitFile, BlameLine, Worktree } from '../model/git';
export type { GitOperation, FileChange, LogCommit, CommitFile, BlameLine, Worktree } from '../model/git';

/** Thin wrapper over the git CLI, scoped to a single repository root. */
export class Git {
  constructor(public readonly repoRoot: string) {}

  /** Optional sink that receives each executed git command (for the Console tab). */
  commandLogger?: (line: string) => void;

  readonly stash = new GitStash((args) => this.raw(args));
  readonly worktree = new GitWorktrees((args) => this.raw(args));
  readonly remote = new GitRemotes((args) => this.raw(args));
  readonly tag = new GitTags((args) => this.raw(args));

  async raw(args: string[]): Promise<string> {
    try {
      const stdout = await execGit(args, { cwd: this.repoRoot });
      this.commandLogger?.(`git ${args.join(' ')}`);
      return stdout;
    } catch (e) {
      this.commandLogger?.(`git ${args.join(' ')}  [failed]`);
      throw e;
    }
  }

  /** Initialize a new repository in the given directory. */
  static async init(dir: string): Promise<void> {
    await execGit(['init'], { cwd: dir });
  }

  /** Clone a repository into parentDir; returns the path of the new clone. */
  static async clone(url: string, parentDir: string, name: string): Promise<string> {
    await execGit(['clone', '--', url, name], { cwd: parentDir });
    return path.join(parentDir, name);
  }

  static async findRepoRoot(cwd: string): Promise<string | undefined> {
    try {
      const stdout = await execGit(['rev-parse', '--show-toplevel'], { cwd });
      const root = stdout.trim();
      return root || undefined;
    } catch {
      return undefined;
    }
  }

  async status(): Promise<FileChange[]> {
    const out = await this.raw(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    return parseStatus(out);
  }

  async currentBranch(): Promise<string> {
    try {
      return (await this.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    } catch {
      return '';
    }
  }

  /** Stage adds/modifications/deletions for the given paths. */
  async add(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.raw(['add', '-A', '--', ...paths]);
  }

  /** Staging-area operations (for the optional index/staging mode). */
  async unstage(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await this.raw(['reset', '-q', 'HEAD', '--', ...paths]);
  }
  async stageAll(): Promise<void> {
    await this.raw(['add', '-A']);
  }
  async unstageAll(): Promise<void> {
    await this.raw(['reset', '-q', 'HEAD']);
  }

  /**
   * Commit exactly the given paths. Passing the pathspec to `commit` performs a
   * partial commit limited to those files, so changes staged elsewhere are left
   * untouched -- matching JetBrains "commit only this changelist" semantics.
   */
  async commit(
    message: string,
    paths: string[],
    opts: { amend?: boolean; signoff?: boolean; author?: string } = {},
  ): Promise<void> {
    const args = ['commit', '-m', message];
    if (opts.amend) args.push('--amend');
    if (opts.signoff) args.push('--signoff');
    if (opts.author) args.push('--author', opts.author);
    if (paths.length) args.push('--', ...paths);
    await this.raw(args);
  }

  async push(): Promise<string> {
    return this.raw(['push']);
  }
  async pushForce(): Promise<void> {
    await this.raw(['push', '--force-with-lease']);
  }
  async pushTags(): Promise<void> {
    await this.raw(['push', '--tags']);
  }


  /** Contents of a path at HEAD, or '' if it does not exist there (new file). */
  async showHead(relPath: string): Promise<string> {
    try {
      return await this.raw(['show', `HEAD:${relPath}`]);
    } catch {
      return '';
    }
  }

  async hasUpstream(): Promise<boolean> {
    try {
      await this.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
      return true;
    } catch {
      return false;
    }
  }

  /** Commits for the Log graph; scope is `--all` or a branch ref. */
  async log(limit = 400, scope = '--all', pathFilter = ''): Promise<LogCommit[]> {
    const fmt = ['%H', '%P', '%an', '%ae', '%cI', '%D', '%s'].join(LOG_FS) + LOG_RS;
    const args = ['log', scope, `--max-count=${limit}`, '--date-order', `--pretty=format:${fmt}`];
    if (pathFilter) args.push('--', pathFilter);
    try {
      return parseLog(await this.raw(args));
    } catch {
      return [];
    }
  }

  /** Files changed by a commit, compared with its first parent. */
  async commitFiles(hash: string): Promise<CommitFile[]> {
    let out = '';
    try {
      out = await this.raw(['diff-tree', '--no-commit-id', '-r', '-z', '--name-status', hash]);
    } catch {
      return [];
    }
    return parseNameStatusZ(out);
  }

  async commitBody(hash: string): Promise<string> {
    try {
      return (await this.raw(['show', '-s', '--format=%B', hash])).replace(/\s+$/, '');
    } catch {
      return '';
    }
  }

  /** A single commit exported as a patch (git format-patch), for "Create Patch from commit". */
  async commitPatch(hash: string): Promise<string> {
    return this.raw(['format-patch', '-1', '--stdout', hash]);
  }

  /** Committer name and ISO date (shown in details when it differs from the author). */
  async commitCommitter(hash: string): Promise<{ name: string; date: string }> {
    try {
      const out = await this.raw(['show', '-s', '--format=%cn%x1f%cI', hash]);
      const [name, date] = out.trim().split('\x1f');
      return { name: name ?? '', date: date ?? '' };
    } catch {
      return { name: '', date: '' };
    }
  }

  /** Contents of a path at an arbitrary revision (empty if absent). */
  async showRev(rev: string, relPath: string): Promise<string> {
    if (!rev) return '';
    try {
      return await this.raw(['show', `${rev}:${relPath}`]);
    } catch {
      return '';
    }
  }

  /** Overwrite a file in the working tree with its content at a revision. */
  async restoreFile(rev: string, relPath: string): Promise<void> {
    await this.raw(['checkout', rev, '--', relPath]);
  }

  /** A conflicted file's stage content (1=base, 2=ours, 3=theirs); '' if absent. */
  async showStage(stage: 1 | 2 | 3, relPath: string): Promise<string> {
    try {
      return await this.raw(['show', `:${stage}:${relPath}`]);
    } catch {
      return '';
    }
  }

  async branches(): Promise<{ current: string; locals: string[]; remotes: string[] }> {
    const current = await this.currentBranch();
    const l = await this.raw(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).catch(() => '');
    const r = await this.raw(['for-each-ref', '--format=%(refname:short)', 'refs/remotes']).catch(() => '');
    return { current, locals: parseRefList(l), remotes: parseRefList(r, true) };
  }

  async checkout(ref: string): Promise<void> {
    await this.raw(['checkout', ref]);
  }
  async checkoutSide(rel: string, side: 'ours' | 'theirs'): Promise<void> {
    await this.raw(['checkout', `--${side}`, '--', rel]);
  }
  async checkoutNew(name: string, from?: string): Promise<void> {
    const args = ['checkout', '-b', name];
    if (from) args.push(from);
    await this.raw(args);
  }
  async mergeBranch(ref: string, mode: 'default' | 'no-ff' | 'squash' = 'default'): Promise<void> {
    const args = ['merge'];
    if (mode === 'no-ff') args.push('--no-ff');
    else if (mode === 'squash') args.push('--squash');
    args.push(ref);
    await this.raw(args);
  }
  async rebaseOnto(ref: string): Promise<void> {
    await this.raw(['rebase', ref]);
  }

  /** Detect an in-progress merge/rebase/cherry-pick/revert by inspecting the git dir. */
  async operationState(): Promise<GitOperation | null> {
    let gitDir = '';
    try {
      gitDir = (await this.raw(['rev-parse', '--absolute-git-dir'])).trim();
    } catch {
      return null;
    }
    const has = (p: string) => {
      try {
        return fs.existsSync(path.join(gitDir, p));
      } catch {
        return false;
      }
    };
    if (has('rebase-merge') || has('rebase-apply')) return 'rebase';
    if (has('MERGE_HEAD')) return 'merge';
    if (has('CHERRY_PICK_HEAD')) return 'cherry-pick';
    if (has('REVERT_HEAD')) return 'revert';
    return null;
  }

  async abortOperation(kind: GitOperation): Promise<void> {
    await this.raw([kind, '--abort']);
  }

  /** Continue an in-progress operation; uses a no-op editor so it never blocks. */
  async continueOperation(kind: GitOperation): Promise<void> {
    if (kind === 'merge') {
      await this.raw(['commit', '--no-edit']);
      return;
    }
    await execGit([kind, '--continue'], {
      cwd: this.repoRoot,
      env: { ...process.env, GIT_EDITOR: 'true' },
    });
    this.commandLogger?.(`git ${kind} --continue`);
  }

  async skipRebase(): Promise<void> {
    await this.raw(['rebase', '--skip']);
  }

  /** Push the current branch up to (and including) the given commit. */
  async pushUpTo(hash: string): Promise<void> {
    const branch = (await this.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    let remote = 'origin';
    try {
      const up = (await this.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).trim();
      remote = up.split('/')[0] || 'origin';
    } catch {
      /* no upstream yet -- default to origin */
    }
    await this.raw(['push', remote, `${hash}:refs/heads/${branch}`]);
  }

  /** Recently checked-out branch names from the reflog, most recent first. */
  async recentBranches(limit = 5): Promise<string[]> {
    try {
      const out = await this.raw(['reflog', '--format=%gs', '-n', '200']);
      return parseRecentBranches(out, limit);
    } catch {
      return [];
    }
  }

  /** Local branches already merged into the current branch (excludes the current branch). */
  async mergedBranches(): Promise<string[]> {
    try {
      return parseMergedBranches(await this.raw(['branch', '--merged']));
    } catch {
      return [];
    }
  }

  /** Local branches that contain the given commit (`git branch --contains`). */
  async branchesContaining(hash: string): Promise<string[]> {
    try {
      return parseBranchList(await this.raw(['branch', '--contains', hash]));
    } catch {
      return [];
    }
  }

  /** All file paths present at a given revision (for "Browse Repository at Revision"). */
  async lsTree(rev: string, limit = 5000): Promise<string[]> {
    try {
      const out = await this.raw(['ls-tree', '-r', '--name-only', rev]);
      return out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /** Recent commit messages (full body), newest first, de-duplicated. */
  async recentCommitMessages(limit = 20): Promise<string[]> {
    try {
      return parseRecentMessages(await this.raw(['log', '-n', String(limit), '--format=%B%x1e']));
    } catch {
      return [];
    }
  }

  async deleteBranch(name: string, force = false): Promise<void> {
    await this.raw(['branch', force ? '-D' : '-d', name]);
  }
  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.raw(['branch', '-m', oldName, newName]);
  }
  async setUpstream(remoteRef: string): Promise<void> {
    await this.raw(['branch', `--set-upstream-to=${remoteRef}`]);
  }

  async cherryPick(hash: string): Promise<void> {
    await this.raw(['cherry-pick', hash]);
  }
  async revert(hash: string): Promise<void> {
    await this.raw(['revert', '--no-edit', hash]);
  }
  async reset(hash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<void> {
    await this.raw(['reset', `--${mode}`, hash]);
  }

  /** Record untracked files in the index (intent-to-add) so they show up in a diff. */
  async addIntentToAdd(files: string[]): Promise<void> {
    if (!files.length) return;
    await this.raw(['add', '-N', '--', ...files]);
  }

  /** Unified diff of the given paths against HEAD (working tree vs HEAD). */
  async diffHead(files: string[]): Promise<string> {
    return this.raw(['diff', 'HEAD', '--', ...files]);
  }

  async applyPatch(patchPath: string): Promise<void> {
    await this.raw(['apply', '--whitespace=nowarn', patchPath]);
  }

  /**
   * Apply a patch to the working tree, falling back to a 3-way merge when a
   * straight apply fails (e.g. the tree has diverged from when it was created).
   * A clean apply lands as unstaged working-tree changes; a 3-way merge leaves
   * conflict markers and unmerged entries for the resolver. Returns 'clean' or
   * 'conflicts'; throws only when the patch cannot be applied at all (so the
   * caller can keep a shelf rather than lose it).
   */
  async applyPatch3way(patchPath: string): Promise<'clean' | 'conflicts'> {
    try {
      await this.raw(['apply', '--whitespace=nowarn', patchPath]);
      return 'clean';
    } catch {
      /* straight apply failed -- fall back to a 3-way merge */
    }
    try {
      await this.raw(['apply', '--3way', '--whitespace=nowarn', patchPath]);
      return 'clean';
    } catch (e) {
      // --3way exits non-zero both when it applied with conflicts and when it
      // failed outright; distinguish by checking for unmerged index entries.
      const unmerged = await this.raw(['ls-files', '-u'])
        .then((o) => o.trim().length > 0)
        .catch(() => false);
      if (unmerged) return 'conflicts';
      throw e;
    }
  }

  async isShallow(): Promise<boolean> {
    try {
      return (await this.raw(['rev-parse', '--is-shallow-repository'])).trim() === 'true';
    } catch {
      return false;
    }
  }
  async unshallow(): Promise<void> {
    await this.raw(['fetch', '--unshallow']);
  }

  async fetch(): Promise<void> {
    await this.raw(['fetch', '--prune']);
  }
  async pull(rebase: boolean): Promise<void> {
    await this.raw(['pull', rebase ? '--rebase' : '--no-rebase']);
  }
  async pushSetUpstream(remote = 'origin'): Promise<void> {
    const b = await this.currentBranch();
    await this.raw(['push', '--set-upstream', remote, b]);
  }
  async aheadBehind(): Promise<{ ahead: number; behind: number } | null> {
    try {
      return parseAheadBehind(await this.raw(['rev-list', '--left-right', '--count', '@{u}...HEAD']));
    } catch {
      return null;
    }
  }
  async outgoingSubjects(): Promise<string[]> {
    try {
      const out = await this.raw(['log', '--format=%h %s', '@{u}..HEAD']);
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Full hashes of commits on HEAD but not yet on its upstream (outgoing). */
  async outgoingHashes(): Promise<string[]> {
    try {
      const out = await this.raw(['log', '--format=%H', '@{u}..HEAD']);
      return out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async headHash(): Promise<string> {
    try {
      return (await this.raw(['rev-parse', 'HEAD'])).trim();
    } catch {
      return '';
    }
  }
  async amendMessage(message: string): Promise<void> {
    await this.raw(['commit', '--amend', '-m', message]);
  }
  async undoLastCommit(): Promise<void> {
    await this.raw(['reset', '--soft', 'HEAD~1']);
  }

  async blame(relPath: string): Promise<BlameLine[]> {
    try {
      return parseBlame(await this.raw(['blame', '--line-porcelain', '--', relPath]));
    } catch {
      return [];
    }
  }

  async fileLog(
    relPath: string,
    limit = 100,
  ): Promise<{ hash: string; parent: string; author: string; date: string; subject: string }[]> {
    const fmt = ['%H', '%P', '%an', '%cI', '%s'].join(LOG_FS) + LOG_RS;
    try {
      return parseFileLog(await this.raw(['log', `--max-count=${limit}`, `--pretty=format:${fmt}`, '--', relPath]));
    } catch {
      return [];
    }
  }

  async logForLines(relPath: string, start: number, end: number): Promise<string> {
    return this.raw(['log', '-L', `${start},${end}:${relPath}`]);
  }


  async diffRefs(a: string, b: string): Promise<{ status: string; path: string }[]> {
    let out = '';
    try {
      out = await this.raw(['diff', '--name-status', '-z', a, b]);
    } catch {
      return [];
    }
    return parseNameStatusZ(out);
  }

  /** Files that differ between the given ref and the working tree. */
  async diffWorkingTree(ref: string): Promise<{ status: string; path: string }[]> {
    let out = '';
    try {
      out = await this.raw(['diff', '--name-status', '-z', ref]);
    } catch {
      return [];
    }
    return parseNameStatusZ(out);
  }

  async applyCached(patchPath: string): Promise<void> {
    await this.raw(['apply', '--cached', '--whitespace=nowarn', patchPath]);
  }
  async commitIndex(message: string): Promise<void> {
    await this.raw(['commit', '-m', message]);
  }

  async isAncestor(a: string, b: string): Promise<boolean> {
    try {
      await this.raw(['merge-base', '--is-ancestor', a, b]);
      return true;
    } catch {
      return false;
    }
  }

  async rangeMessages(range: string): Promise<string> {
    try {
      return (await this.raw(['log', '--reverse', '--format=%B', range])).trim();
    } catch {
      return '';
    }
  }

  async resetHard(ref: string): Promise<void> {
    await this.raw(['reset', '--hard', ref]);
  }

  /** Short upstream name of a specific local branch (e.g. origin/main), or ''. */
  async branchUpstream(branch: string): Promise<string> {
    try {
      return (await this.raw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`])).trim();
    } catch {
      return '';
    }
  }

  /** Fast-forward a non-checked-out local branch to its upstream (fetch refspec). */
  async updateBranch(branch: string): Promise<void> {
    const up = await this.branchUpstream(branch);
    if (!up) throw new Error(`${branch} has no upstream branch`);
    const slash = up.indexOf('/');
    const remote = slash >= 0 ? up.slice(0, slash) : 'origin';
    const remoteRef = slash >= 0 ? up.slice(slash + 1) : up;
    await this.raw(['fetch', remote, `${remoteRef}:${branch}`]);
  }

  /** Short upstream name of the current branch (e.g. origin/main), or '' if none. */
  async upstreamRef(): Promise<string> {
    try {
      return (await this.raw(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).trim();
    } catch {
      return '';
    }
  }

  /**
   * Run a single-commit interactive rebase action (drop / fixup / reword) using a
   * scripted sequence editor. If the rebase stops (e.g. a conflict), it is aborted
   * so the repository is never left mid-rebase.
   */
  async rebaseAction(
    base: string,
    target: string,
    action: 'drop' | 'fixup' | 'reword',
    scriptPath: string,
    message?: string,
  ): Promise<void> {
    const script = scriptPath.replace(/\\/g, '/');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_SEQUENCE_EDITOR: `node "${script}" seq`,
      GIT_EDITOR: `node "${script}" msg`,
      JEGIT_REBASE_TARGET: target,
      JEGIT_REBASE_ACTION: action,
    };
    if (message != null) env.JEGIT_REBASE_MSG = message;
    try {
      await execGit(['rebase', '-i', base], { cwd: this.repoRoot, env });
      this.commandLogger?.(`git rebase -i ${base} (${action} ${target.slice(0, 7)})`);
    } catch (e) {
      this.commandLogger?.(`git rebase -i ${base} (${action}) [failed -> abort]`);
      await this.raw(['rebase', '--abort']).catch(() => undefined);
      throw e;
    }
  }

  /** Commits in a range, oldest first, for the interactive-rebase dialog. */
  async rangeCommits(range: string): Promise<{ hash: string; subject: string }[]> {
    try {
      return parseRangeCommits(await this.raw(['log', '--reverse', '--format=%H%x1f%s', range]));
    } catch {
      return [];
    }
  }

  /** Run an interactive rebase from a full prepared todo file (reorder dialog). */
  async rebaseTodo(base: string, scriptPath: string, todoFile: string): Promise<void> {
    const script = scriptPath.replace(/\\/g, '/');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_SEQUENCE_EDITOR: `node "${script}" seq`,
      GIT_EDITOR: `node "${script}" msg`,
      JEGIT_REBASE_TODO_FILE: todoFile,
    };
    try {
      await execGit(['rebase', '-i', base], { cwd: this.repoRoot, env });
      this.commandLogger?.(`git rebase -i ${base} (reorder)`);
    } catch (e) {
      this.commandLogger?.(`git rebase -i ${base} (reorder) [failed -> abort]`);
      await this.raw(['rebase', '--abort']).catch(() => undefined);
      throw e;
    }
  }
}
