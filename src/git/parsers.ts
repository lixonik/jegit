import type { FileChange, LogCommit, BlameLine, Worktree } from '../model/git';

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

export function parseStatus(out: string): FileChange[] {
  const result: FileChange[] = [];
  if (!out) return result;
  const tokens = out.split('\0');
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry || entry.length < 3) continue;
    const x = entry[0];
    const status = entry.slice(0, 2);
    const pathField = entry.slice(3);
    let origPath: string | undefined;
    // For rename/copy, porcelain -z emits "<new>\0<old>"; consume the next token.
    if (x === 'R' || x === 'C') {
      origPath = tokens[++i];
    }
    const untracked = status === '??';
    const staged = x !== ' ' && x !== '?';
    result.push({
      path: normalize(pathField),
      origPath: origPath ? normalize(origPath) : undefined,
      status,
      staged,
      untracked,
    });
  }
  return result;
}

export function parseRefs(s: string): string[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x.startsWith('HEAD -> ') ? x.slice('HEAD -> '.length) : x));
}

/** Parse the per-file history stream (`%H %P %an %cI %s`); parent is the first parent. */
export function parseFileLog(
  out: string,
): { hash: string; parent: string; author: string; date: string; subject: string }[] {
  const res: { hash: string; parent: string; author: string; date: string; subject: string }[] = [];
  for (const rec of out.split(LOG_RS)) {
    const line = rec.replace(/^\s+/, '');
    if (!line) continue;
    const [hash, parents, author, date, subject] = line.split(LOG_FS);
    res.push({ hash, parent: parents ? parents.split(' ')[0] : '', author, date, subject: subject ?? '' });
  }
  return res;
}

/** Parse `git blame --line-porcelain` output into one entry per line.
 *  Lines that reuse a commit's abbreviated header inherit its last-seen fields. */
export function parseBlame(out: string): BlameLine[] {
  const result: BlameLine[] = [];
  let hash = '';
  let author = '';
  let email = '';
  let summary = '';
  let time = 0;
  for (const line of out.split('\n')) {
    if (/^[0-9a-f]{40} /.test(line)) {
      hash = line.slice(0, 40);
    } else if (line.startsWith('author ')) {
      author = line.slice(7);
    } else if (line.startsWith('author-mail ')) {
      email = line.slice(12).replace(/^<|>$/g, '');
    } else if (line.startsWith('author-time ')) {
      time = parseInt(line.slice(12), 10) || 0;
    } else if (line.startsWith('summary ')) {
      summary = line.slice(8);
    } else if (line.startsWith('\t')) {
      const date = time ? new Date(time * 1000).toISOString().slice(0, 10) : '';
      result.push({ hash, author, email, date, summary });
    }
  }
  return result;
}

/** Parse `git worktree list --porcelain` records (worktree/HEAD/branch/detached). */
export function parseWorktrees(out: string): Worktree[] {
  const list: Worktree[] = [];
  let cur: Worktree | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) list.push(cur);
      cur = { path: line.slice(9).trim(), branch: '', head: '' };
    } else if (cur && line.startsWith('HEAD ')) {
      cur.head = line.slice(5).trim();
    } else if (cur && line.startsWith('branch ')) {
      cur.branch = line.slice(7).trim().replace('refs/heads/', '');
    } else if (cur && line.trim() === 'detached') {
      cur.branch = '(detached)';
    }
  }
  if (cur) list.push(cur);
  return list;
}

/** Parse `git branch --merged` into branch names, excluding the current branch
 *  (the `*` line) and any detached-HEAD `(...)` entry. */
export function parseMergedBranches(out: string): string[] {
  return out
    .split('\n')
    .filter((l) => !l.startsWith('*'))
    .map((l) => l.trim())
    .filter((b) => b && !b.startsWith('('));
}

/** Parse `git branch --contains <hash>` (or plain `git branch`) into branch names,
 *  stripping the `*` current and `+` other-worktree markers and dropping the
 *  detached-HEAD `(...)` entry. Unlike parseMergedBranches, the current branch is kept. */
export function parseBranchList(out: string): string[] {
  return out
    .split('\n')
    .map((l) => l.replace(/^[*+]?\s*/, '').trim())
    .filter((b) => b && !b.startsWith('('));
}

/** Parse `git log --format=%B%x1e` (RS-separated full messages) into trimmed,
 *  de-duplicated messages, preserving newest-first order. */
export function parseRecentMessages(out: string): string[] {
  const seen = new Set<string>();
  const res: string[] = [];
  for (const rec of out.split('\x1e')) {
    const msg = rec.trim();
    if (msg && !seen.has(msg)) {
      seen.add(msg);
      res.push(msg);
    }
  }
  return res;
}

/** Parse a `git tag` listing (one tag per line) into trimmed, non-empty names. */
export function parseTagList(out: string): string[] {
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse `git rev-list --left-right --count @{u}...HEAD` (left = behind upstream,
 *  right = ahead of upstream) into counts. */
export function parseAheadBehind(out: string): { ahead: number; behind: number } {
  const parts = out
    .trim()
    .split(/\s+/)
    .map((n) => parseInt(n, 10));
  return { behind: parts[0] || 0, ahead: parts[1] || 0 };
}

/** Split `for-each-ref --format=%(refname:short)` output into ref names,
 *  dropping blanks and (optionally) the symbolic `<remote>/HEAD` entries. */
export function parseRefList(out: string, dropHead = false): string[] {
  const refs = out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return dropHead ? refs.filter((x) => !x.endsWith('/HEAD')) : refs;
}

/** Parse `git remote -v` into unique name/url pairs (using the fetch URL). */
export function parseRemotes(out: string): { name: string; url: string }[] {
  const map = new Map<string, string>();
  for (const line of out.split('\n')) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(line.trim());
    if (m) map.set(m[1], m[2]);
  }
  return [...map].map(([name, url]) => ({ name, url }));
}

/** Parse `git log --format=%H%x1f%s` into hash/subject pairs (rebase reorder list). */
export function parseRangeCommits(out: string): { hash: string; subject: string }[] {
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [hash, subject] = l.split('\x1f');
      return { hash, subject: subject ?? '' };
    });
}

/** Parse `git stash list --format=%gd%x1f%gs` into ref/subject pairs. */
export function parseStashList(out: string): { ref: string; subject: string }[] {
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [ref, subject] = l.split('\x1f');
      return { ref, subject: subject ?? '' };
    });
}

/** Field/record separators used by the `log` pretty-format. */
export const LOG_FS = '\x1f';
export const LOG_RS = '\x1e';

/** Parse the record stream produced by `git log --pretty=format` with the
 *  fields hash, parents, author, email, ISO date, refs (%D), subject. */
export function parseLog(out: string): LogCommit[] {
  const commits: LogCommit[] = [];
  for (const rec of out.split(LOG_RS)) {
    const line = rec.replace(/^\s+/, '');
    if (!line) continue;
    const [hash, parents, author, email, date, refs, subject] = line.split(LOG_FS);
    commits.push({
      hash,
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      author,
      email,
      date,
      subject: subject ?? '',
      refs: parseRefs(refs ?? ''),
    });
  }
  return commits;
}
