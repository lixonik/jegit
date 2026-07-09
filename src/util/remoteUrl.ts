import { isDefined, isEmpty, isNil } from './guards';

/** Convert a git remote URL (https or ssh/scp) to a browseable web base URL. */
export function toWebUrl(remote: string): string {
  if (isEmpty(remote)) return '';
  const s = remote.trim().replace(/\.git$/, '');
  // scp shorthand: user@host:owner/repo
  const scp = /^[^@/]+@([^:/]+):(.+)$/.exec(s);
  if (isDefined(scp)) return `https://${scp[1]}/${scp[2]}`;
  // ssh://user@host[:port]/owner/repo  or  https://host/owner/repo
  const m = /^(?:ssh|https?):\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(s);
  if (isDefined(m)) return `https://${m[1].replace(/:\d+$/, '')}/${m[2]}`;
  return '';
}

/** Guess a directory name for a clone from its remote URL. */
export function guessCloneDirName(url: string): string {
  const last = url.trim().replace(/\/+$/, '').split('/').pop();
  if (isNil(last)) return 'repo';
  const name = last.replace(/\.git$/, '');
  return isEmpty(name) ? 'repo' : name;
}

export function commitWebUrl(web: string, hash: string): string {
  return isEmpty(web) ? '' : `${web}/commit/${hash}`;
}

export function fileWebUrl(web: string, branch: string, path: string): string {
  return isEmpty(web) ? '' : `${web}/blob/${encodeURIComponent(branch)}/${path}`;
}
