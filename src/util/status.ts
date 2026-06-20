/** True when a porcelain two-letter status represents a merge conflict:
 *  any unmerged side ('U'), both-added ('AA') or both-deleted ('DD'). */
export function isConflicted(status: string): boolean {
  return status.includes('U') || status === 'AA' || status === 'DD';
}
