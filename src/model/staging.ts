// Staging-area (git index) grouping types, consumed by splitStaged and the webview.

export interface StagedEntry {
  path: string;
  letter: string;
}

export interface StagedSplit {
  staged: StagedEntry[];
  unstaged: StagedEntry[];
  untracked: { path: string }[];
}
