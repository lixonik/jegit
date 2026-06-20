/** Parse `git reflog --format=%gs` output into recently checked-out branch
 *  names, most recent first. Detached (40-hex) checkouts are skipped and
 *  duplicates are collapsed. Returns up to limit+1 names so the caller can
 *  drop the current branch and still show `limit` entries. */
export function parseRecentBranches(reflog: string, limit = 5): string[] {
  const seen = new Set<string>();
  for (const line of reflog.split('\n')) {
    const m = /^checkout: moving from .+ to (.+)$/.exec(line.trim());
    if (!m) continue;
    const to = m[1];
    if (/^[0-9a-f]{40}$/.test(to)) continue;
    seen.add(to);
    if (seen.size >= limit + 1) break;
  }
  return [...seen].slice(0, limit + 1);
}
