// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderVersionControlHtml } from '../src/ui/versionControlHtml';

const mediaDir = join(__dirname, '..', 'media');
const scripts = ['graph.js', 'tree.js', 'logfilter.js', 'datefmt.js', 'refchip.js', 'vcs.js'];
const posted: Array<Record<string, unknown>> = [];

function bodyHtml(): string {
  const webview = { cspSource: 'mock', asWebviewUri: (u: unknown) => u } as never;
  const html = renderVersionControlHtml(webview, { fsPath: '' } as never);
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  return body.replace(/<script[\s\S]*?<\/script>/g, '');
}

function sendToWebview(data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

const changeItem = {
  path: 'src/a.ts',
  status: ' M',
  statusLabel: 'Modified',
  letter: 'M',
  untracked: false,
  deleted: false,
  conflicted: false,
  fsPath: 'D:/repo/src/a.ts',
};

describe('vcs.js webview smoke', () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
      postMessage: (m: Record<string, unknown>) => posted.push(m),
      getState: () => undefined,
      setState: () => undefined,
    });
    document.body.innerHTML = bodyHtml();
    for (const name of scripts) {
      (0, eval)(readFileSync(join(mediaDir, name), 'utf8'));
    }
  });

  it('announces readiness to the extension host', () => {
    expect(posted).toContainEqual({ type: 'ready' });
  });

  it('renders the local changes tree from a state message', () => {
    sendToWebview({
      type: 'state',
      payload: {
        branch: 'main',
        total: 1,
        changelists: [{ id: 'default', name: 'Changes', active: true, files: [changeItem] }],
      },
      operation: null,
      staging: null,
    });
    expect(document.getElementById('tree')!.textContent).toContain('a.ts');
    expect(document.getElementById('branch')!.textContent).toContain('main');
  });

  it('shows the operation banner during a rebase', () => {
    sendToWebview({
      type: 'state',
      payload: { branch: 'main', total: 0, changelists: [] },
      operation: 'rebase',
      staging: null,
    });
    const banner = document.getElementById('op-banner')!;
    expect(banner.style.display).not.toBe('none');
    expect(banner.textContent!.toLowerCase()).toContain('rebase');
  });

  it('appends console lines', () => {
    sendToWebview({ type: 'consoleLine', line: '$ git status' });
    expect(document.getElementById('console-log')!.textContent).toContain('$ git status');
  });

  it('commits the checked files through the commit button', () => {
    sendToWebview({
      type: 'state',
      payload: {
        branch: 'main',
        total: 1,
        changelists: [{ id: 'default', name: 'Changes', active: true, files: [changeItem] }],
      },
      operation: null,
      staging: null,
    });
    const msg = document.getElementById('message') as HTMLTextAreaElement;
    msg.value = 'Fix things';
    msg.dispatchEvent(new Event('input', { bubbles: true }));
    const commit = document.getElementById('commit') as HTMLButtonElement;
    if (commit.disabled) {
      (document.querySelector('#tree input[type=checkbox]') as HTMLInputElement).click();
    }
    expect(commit.disabled).toBe(false);
    commit.click();
    const call = posted.filter((p) => p.type === 'commit').at(-1) as { paths: string[]; message: string };
    expect(call.paths).toEqual(['src/a.ts']);
    expect(call.message).toBe('Fix things');
  });

  it('renders the log graph rows from logData', () => {
    sendToWebview({
      type: 'logData',
      commits: [
        { hash: 'b'.repeat(40), parents: ['a'.repeat(40)], author: 'Dev', email: 'd@e', date: '2026-07-09T12:00:00+03:00', subject: 'Fix the filter', refs: ['main'] },
        { hash: 'a'.repeat(40), parents: [], author: 'Dev', email: 'd@e', date: '2026-07-08T12:00:00+03:00', subject: 'Initial commit', refs: [] },
      ],
    });
    const rows = document.querySelectorAll('.log-row');
    expect(rows.length).toBe(2);
    expect(document.getElementById('log-list')!.textContent).toContain('Fix the filter');
  });

  it('requests the commit details when a log row is clicked', () => {
    const row = document.querySelector('.log-row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'commitDetails', hash: 'b'.repeat(40) });
  });

  it('renders the details panel from commitDetailsData', () => {
    sendToWebview({
      type: 'commitDetailsData',
      hash: 'b'.repeat(40),
      files: [{ status: 'M', path: 'src/a.ts' }],
      body: 'Fix the filter\n\nDetails body.',
      committer: { name: 'Dev', date: '2026-07-09T12:00:00+03:00' },
      branches: ['main'],
      tags: [],
    });
    const details = document.getElementById('log-details')!.textContent;
    expect(details).toContain('a.ts');
    expect(details).toContain('Fix the filter');
  });
});
