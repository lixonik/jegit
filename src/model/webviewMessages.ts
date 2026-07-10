// The message protocol the Version Control webview posts to the extension host.
// Kept in the model layer so the view (src/ui/versionControlView.ts) holds only logic.

export interface CommitMsg {
  type: 'commit';
  paths: string[];
  message: string;
  amend: boolean;
  push: boolean;
  signoff: boolean;
  author: string;
}

export type Incoming =
  | {
      type:
        | 'ready'
        | 'refresh'
        | 'newChangelist'
        | 'requestLog'
        | 'requestShelf'
        | 'requestConsole'
        | 'branches'
        | 'getLastCommitMessage'
        | 'logBranchFilter'
        | 'logPathFilter';
    }
  | { type: 'setActive' | 'renameChangelist' | 'deleteChangelist'; id: string }
  | { type: 'move'; paths: string[] }
  | { type: 'assignTo'; paths: string[]; id: string }
  | { type: 'openDiff'; path: string; untracked: boolean }
  | { type: 'rollback'; items: { path: string; untracked: boolean }[] }
  | { type: 'commitDetails'; hash: string }
  | { type: 'openRevDiff'; hash: string; parent: string; path: string }
  | { type: 'openRevLocalDiff'; hash: string; path: string }
  | {
      type:
        | 'copyHash'
        | 'checkoutRev'
        | 'newBranchAt'
        | 'cherryPick'
        | 'revertCommit'
        | 'resetTo'
        | 'editMessage'
        | 'undoCommit'
        | 'squashTo'
        | 'dropCommit'
        | 'fixupCommit'
        | 'interactiveRebase'
        | 'openCommitRemote';
      hash: string;
    }
  | { type: 'shelve'; items: { path: string; untracked: boolean }[] }
  | { type: 'unshelve'; id: string; keep?: boolean }
  | { type: 'deleteShelf'; id: string }
  | { type: 'renameShelf'; id: string }
  | { type: 'shelfFileDiff'; id: string; path: string }
  | { type: 'openFile'; path: string }
  | { type: 'mergeResolve'; path: string }
  | { type: 'markResolved'; paths: string[] }
  | { type: 'addToGitignore'; path: string }
  | { type: 'fileHistory'; path: string }
  | { type: 'tagAt'; hash: string }
  | { type: 'commitHunks'; path: string }
  | { type: 'createPatch'; items: { path: string; untracked: boolean }[] }
  | { type: 'copyPath'; path: string; absolute: boolean }
  | { type: 'setLogScope'; scope: string }
  | { type: 'compareCommits'; a: string; b: string }
  | { type: 'createPatchFromCommit'; hash: string }
  | { type: 'pushUpTo'; hash: string }
  | { type: 'opAction'; action: 'continue' | 'abort' | 'skip' }
  | { type: 'stage' | 'unstage'; paths: string[] }
  | { type: 'commitStaged'; message: string; push: boolean }
  | { type: 'branchCmd'; ref: string; action: string; isRemote: boolean }
  | { type: 'copySubject'; text: string }
  | { type: 'branchesContaining'; hash: string }
  | { type: 'tagsContaining'; hash: string }
  | { type: 'annotate'; path: string }
  | { type: 'recallMessage' }
  | CommitMsg;
