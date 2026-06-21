export interface Hunk {
  header: string;
  lines: string[];
}

/** Split a unified diff into its file header and individual hunks. */
export function splitHunks(diff: string): { header: string; hunks: Hunk[] } {
  const lines = diff.split('\n');
  let i = 0;
  const header: string[] = [];
  while (i < lines.length && !lines[i].startsWith('@@')) {
    header.push(lines[i]);
    i++;
  }
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  for (; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) {
      if (cur !== null) hunks.push(cur);
      cur = { header: lines[i], lines: [lines[i]] };
    } else if (cur !== null) {
      cur.lines.push(lines[i]);
    }
  }
  if (cur !== null) hunks.push(cur);
  return { header: header.join('\n'), hunks };
}

/** Rebuild a unified diff from the file header and a selected subset of hunks,
 *  suitable for `git apply` (per-hunk partial commit). */
export function buildHunkPatch(header: string, hunks: Hunk[]): string {
  return header + '\n' + hunks.map((h) => h.lines.join('\n')).join('\n') + '\n';
}
