# JeGit – JetBrains-style Git for VS Code

A VS Code extension that recreates the JetBrains (WebStorm / IntelliJ) Git
workflow and UI, for people migrating off the JetBrains IDEs. It is standalone:
it does not depend on GitLens or the built-in SCM view for its UI.

The whole experience lives in a dedicated **JeGit** panel in the bottom
tool-window area (like the JetBrains Version Control tool window), with a
Darcula-styled, tabbed UI: **Local Changes / Log / Shelf / Console**.

## Features

### Local Changes
- **Changelists** as a directory tree (toggle to a flat list), tri-state
  checkboxes, an active list, and move by menu or drag and drop.
- Files colored by status with folder/file icons; **merge conflicts** detected.
- **Commit** the checked files, **Commit and Push**, **Amend** (prefilled),
  **Sign-off**, **commit as another author**, and per-hunk **Commit Selected Hunks**.
- **Commit message inspections** (subject length, blank line before the body)
  with a JetBrains-style "Commit Anyway" confirmation, and a warning before
  **amending an already pushed commit**.
- **Rollback**, **Shelve** (or **Shelve Silently** under the active changelist
  name), **Create Patch**, **Add to .gitignore**, **Show History**,
  **Copy Path**; click a file for a HEAD diff.
- `Ctrl+Enter` commits, `Ctrl+Shift+Enter` commits and pushes.

### Log
- Commit graph with clickable ref chips (switch the log to a branch or tag),
  Subject / Author / Date columns, and a details panel on the right showing
  the changed files as a tree (click to diff, **Show Diff with Local**, or
  **Open on Remote at This Revision**); the containing branches/tags and the
  author in the details are clickable too (scope or filter the log).
- Arrow-key navigation over commits; Ctrl-click marks a pair to **Compare
  Selected Versions** or **Cherry-Pick Selected (oldest first)**.
- Filters: free text, **Branch**, **User**, **Date**, and **Path**; the text,
  user and date filters survive a reload.
- Commit context menu: Checkout, New Branch, Cherry-Pick, Revert, Reset, Edit
  Commit Message (any commit), Undo Commit, Squash, Fixup, Drop, **Interactively
  Rebase from Here** (drag-reorder + pick/fixup/drop), New Tag, Copy Revision,
  **Copy Full Message**, **Browse Repository at This Revision**.

### Conflicts
- A **three-pane merge resolver** (Yours | editable Result | Theirs) with
  per-conflict and whole-file accept, opened from a conflicted file.
- After applying, the resolver **offers the next conflicted file** until the
  queue is empty.
- **Resolve Conflicts** command: pick a file, then **Merge...**, **Accept
  Yours**, or **Accept Theirs**; the list reopens until every conflict is done.

### Shelf and Console
- Shelve / Unshelve patches that survive branch switches.
- Per-file actions on a shelved change: **Show Diff** (double click) and
  **Unshelve This File** (the shelf is kept); **Show Patch** for the whole shelf.
- Console tab logging git commands, with a clear button.

### Branches and remotes
- A status-bar widget (`branch ↓behind ↑ahead`, plus an in-progress operation
  warning) and the panel header open the **Branches popup**: Checkout, New,
  Merge, Rebase, Rename, Delete, Compare, **Show Diff with Working Tree**,
  **Set Upstream**, **Push a branch** to a chosen remote, **Delete on Remote**.
- **Fetch**, **Fetch All and Prune**, **Update** (fetch + pull), **Push** (with
  an outgoing-commit preview), **Force Push** (`--force-with-lease`, with a
  stronger warning on branches from `jegit.protectedBranches`), **Push Tags**,
  and **Manage Remotes** (add / rename / change URL / remove).

### Editor
- **Annotate with Git Blame** (colored by commit age), **Show File History**
  (diff against the parent, **Compare with Local**, restore to a revision),
  **Show History for Selection** (`git log -L` for the selected lines),
  **Apply Patch** (from a file or the clipboard), **Stash / Unstash** (with a
  changed-files preview), and **Copy Path**.

## Development

```bash
npm install
npm run compile        # bundle to dist/
npm run watch          # incremental rebuilds
npm run typecheck      # tsc --noEmit
npm test               # vitest unit tests
npm run check          # typecheck + tests in one command (fails fast)
```

Press **F5** to launch an Extension Development Host with JeGit loaded, then open
any git repository. The **JeGit** panel opens in the bottom tool-window area
(also `Alt+9`, or the JEGIT tab next to Terminal).

## Testing

Nearly 500 vitest unit tests cover the git output parsers, every message
route of the tab controllers (Local Changes / Log / Shelf) and the root
webview router, the UI flows (branches, stash, worktrees, remotes,
push/update, file history), the injectable domain services (`Git.stash` /
`Git.worktree` / `Git.remote` / `Git.tag`), CLI argument assembly, and the
commit message inspections. The `vscode` module is replaced
by a scriptable mock (`test/vscode-mock.ts`), and the webview itself
(`media/vcs.js`, the rebase dialog) is exercised in jsdom -- checkboxes,
context menus, filters, hotkeys, and tab persistence are all driven by
simulated user events. The whole suite runs in seconds without an
extension host.

## Settings

- `jegit.log.maxCount` – maximum commits loaded in the Log tab.
- `jegit.panel.autoReveal` – reveal the JeGit panel automatically on startup.
- `jegit.stagingArea` – use Staged / Unstaged groups instead of changelists.

## License

JeGit is licensed under the **MIT License** (see [LICENSE](LICENSE)).
