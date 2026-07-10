# Changelog

## 0.2.0

### Features
- Commit message inspections (subject length, blank line before the body) with a "Commit Anyway" confirmation.
- Annotate (git blame) colored by commit age.
- Branches popup: Show Diff with Working Tree, Checkout and Rebase onto Current, and tag actions (Checkout / New Branch from Tag / Delete Tag).
- Compare with Current shows the ahead/behind commit lists before the changed files.
- Push: choose the target remote for the first push when several remotes exist.
- Stash: a changed-files preview before applying or dropping.
- Log: search-match highlighting, branches and tags containing the selected commit in the details panel, and recalling a recent commit message.
- Log: cherry-pick a ctrl-clicked pair oldest first, clickable ref chips that switch the log scope, arrow-key navigation over commits, and Show Diff with Local on a details file.
- Context menus close on Escape.
- Merge resolver: after applying, the next conflicted file is offered until the queue is empty.
- Resolve Conflicts: Accept Yours / Accept Theirs per file alongside the merge resolver; the list reopens until every conflict is done.
- Show History for Selection: `git log -L` over the selected lines, shown as a diff document.
- Shelf: per-file Show Diff (double click) and Unshelve This File (shelf kept); Show Patch for the whole shelf; Shelve Silently under the active changelist name.
- Staging mode: Stage All / Unstage All buttons on the group headers.
- Log: Browse Repository at This Revision in the commit context menu.
- File History: Compare with Local alongside Show Diff and Restore.
- Local Changes: Show History and Copy Path in the file context menu.
- Branches: push a local branch to a chosen remote; delete a remote branch after confirmation (both also in the Log branch panel menu).
- Console: a clear button.
- Fetch All and Prune Remote Branches command.
- Log: the search, author and date filters survive a webview reload.
- Status bar: the branch widget announces an in-progress merge/rebase/cherry-pick/revert.
- Log: Open on Remote at This Revision on a details file; Copy Full Message in the commit menu.
- Commit: a warning before amending a commit that is already on the upstream.
- Push: the `jegit.protectedBranches` setting (default `main`/`master`) makes the force-push warning name the protected branch.
- Web links: an explicit ssh port is dropped from remote web URLs.

### Internal
- `activate()` split into focused command modules under `src/commands`.
- The Version Control webview split into per-tab controllers (Local Changes / Log / Shelf) plus a separate HTML module.
- Git output parsers moved to `src/git/parsers`; all process spawning routed through a single `execGit` runner.
- Stash, worktree, remote, and tag operations grouped into injectable domain services (`Git.stash` / `Git.worktree` / `Git.remote` / `Git.tag`).
- Explicit value guards (`isNil` / `isEmpty` / `notEmpty`) adopted across the codebase.
- The test suite grew from 176 to nearly 500 unit tests: every message route of the tab controllers and the root webview router, every UI flow and dialog, injectable domain services, CLI argument assembly, activation/manifest consistency, message linting, and jsdom-driven webview tests (tree checkboxes, context menus, log filters, commit hotkeys, the rebase dialog) -- all without an extension host.

## 0.1.0

A feature-complete JetBrains-style Git tool window.

### Local Changes
- Changelists as a directory tree or flat list, tri-state checkboxes, an active list, and drag-and-drop between lists.
- Commit, Commit and Push, Amend (message prefilled), Sign-off, commit as another author, and per-hunk Commit Selected Hunks.
- Rollback, Shelve, Create Patch, Add to .gitignore; merge-conflict detection.
- `Ctrl+Enter` commits, `Ctrl+Shift+Enter` commits and pushes.

### Log
- Branch graph with ref chips, Subject / Author / Date columns, and a details panel showing the changed files as a tree.
- Filters: free text, Branch, User, Date, and Path.
- Commit actions: Checkout, New Branch, Cherry-Pick, Revert, Reset, Edit Commit Message (any commit), Undo Commit, Squash, Fixup into Previous, Drop Commit, Interactively Rebase from Here (drag-reorder + pick/fixup/drop), New Tag, Copy Revision.

### Conflicts
- Three-pane merge resolver (Yours | editable Result | Theirs) with per-conflict and whole-file accept.

### Shelf, Console, stash and patches
- Shelve / Unshelve; a Console git-command log; Stash / Unstash; Create / Apply Patch (from a file or the clipboard).

### Branches and remotes
- Branches popup (Checkout, New, Merge, Rebase, Rename, Delete, Compare with Current, Set Upstream) and an ahead/behind status-bar widget.
- Fetch, Update (fetch then pull), Push (with an outgoing-commit preview), Force Push, Push Tags, and Manage Remotes.

### Editor
- Git blame annotation; file history with restore to a revision; Copy Path.

### Quality
- Unit tests (vitest) for porcelain status / name-status / ref parsing, diff hunk splitting, and the changelist model.

### Settings
- `jegit.log.maxCount`, `jegit.panel.autoReveal`.
