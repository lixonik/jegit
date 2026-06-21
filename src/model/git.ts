// Domain types describing git data, kept in the model layer. The Git CLI wrapper
// (src/git/git.ts) and the UI consume these; it re-exports them for compatibility.

/** An in-progress git operation that can be continued, aborted or skipped. */
export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

export interface FileChange {
  /** Path relative to the repo root, forward-slash separated. */
  path: string;
  /** Original path for renames/copies. */
  origPath?: string;
  /** Two-letter porcelain status code, e.g. ' M', '??', 'A ', 'R '. */
  status: string;
  staged: boolean;
  untracked: boolean;
}

export interface LogCommit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  subject: string;
  refs: string[];
}

export interface CommitFile {
  status: string;
  path: string;
  origPath?: string;
}

export interface BlameLine {
  hash: string;
  author: string;
  email: string;
  date: string;
  summary: string;
}

export interface Worktree {
  path: string;
  branch: string;
  head: string;
}
