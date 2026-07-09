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

  it('shelves a file from its context menu', () => {
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
    const fileNode = [...document.querySelectorAll('#tree *')].find((el) =>
      el.textContent === 'a.ts' || el.textContent?.trim() === 'a.ts',
    ) as HTMLElement;
    expect(fileNode).toBeDefined();
    fileNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const shelve = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Shelve...',
    ) as HTMLElement;
    expect(shelve).toBeDefined();
    shelve.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'shelve', items: [{ path: 'src/a.ts', untracked: false }] });
  });

  it('opens the HEAD diff when a file row is double-clicked', () => {
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
    const fileNode = [...document.querySelectorAll('#tree *')].find(
      (el) => el.textContent?.trim() === 'a.ts',
    ) as HTMLElement;
    fileNode.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'openDiff', path: 'src/a.ts', untracked: false });
  });

  it('commits via Ctrl+Enter and commits-and-pushes via Ctrl+Shift+Enter', () => {
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
    msg.value = 'Hotkey commit';
    msg.dispatchEvent(new Event('input', { bubbles: true }));
    const commit = document.getElementById('commit') as HTMLButtonElement;
    if (commit.disabled) {
      (document.querySelector('#tree input[type=checkbox]') as HTMLInputElement).click();
    }
    msg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    const plain = posted.filter((p) => p.type === 'commit').at(-1) as { push: boolean };
    expect(plain.push).toBe(false);

    msg.value = 'Hotkey commit and push';
    msg.dispatchEvent(new Event('input', { bubbles: true }));
    msg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true }));
    const withPush = posted.filter((p) => p.type === 'commit').at(-1) as { push: boolean; message: string };
    expect(withPush.push).toBe(true);
    expect(withPush.message).toBe('Hotkey commit and push');
  });

  it('routes a conflicted file to the merge resolver on double-click', () => {
    const conflicted = {
      ...changeItem,
      path: 'src/conflict.ts',
      status: 'UU',
      statusLabel: 'Merge conflict',
      letter: 'U',
      conflicted: true,
    };
    sendToWebview({
      type: 'state',
      payload: {
        branch: 'main',
        total: 1,
        changelists: [{ id: 'default', name: 'Changes', active: true, files: [conflicted] }],
      },
      operation: null,
      staging: null,
    });
    const fileNode = [...document.querySelectorAll('#tree *')].find(
      (el) => el.textContent?.trim() === 'conflict.ts',
    ) as HTMLElement;
    fileNode.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'mergeResolve', path: 'src/conflict.ts' });
    expect(posted.filter((p) => p.type === 'openDiff' && p.path === 'src/conflict.ts')).toHaveLength(0);
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

  it('switches panels when a tab is clicked', () => {
    const shelfTab = document.querySelector('.tab[data-tab="shelf"]') as HTMLElement;
    shelfTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shelfTab.classList.contains('active')).toBe(true);
    const shelfPanel = document.querySelector('.tabpanel[data-tab="shelf"]') as HTMLElement;
    expect(shelfPanel.classList.contains('active')).toBe(true);
    const localPanel = document.querySelector('.tabpanel[data-tab="local"]') as HTMLElement;
    expect(localPanel.classList.contains('active')).toBe(false);
  });

  it('renders the shelf entries from shelfData', () => {
    sendToWebview({
      type: 'shelfData',
      entries: [
        { id: 's1', name: 'WIP dialogs', createdAt: '2026-07-09T12:00:00+03:00', files: ['src/a.ts'] },
        { id: 's2', name: 'Spike', createdAt: '2026-07-08T12:00:00+03:00', files: ['src/b.ts'] },
      ],
    });
    const text = document.getElementById('shelf-list')!.textContent;
    expect(text).toContain('WIP dialogs');
    expect(text).toContain('Spike');
  });

  it('highlights log search matches and clears them with the query', () => {
    const search = document.getElementById('log-search') as HTMLInputElement;
    search.value = 'filter';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const marks = document.querySelectorAll('#log-list .lg-hl');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent!.toLowerCase()).toBe('filter');

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.querySelectorAll('#log-list .lg-hl').length).toBe(0);
  });

  it('opens the commit context menu and posts the picked action', () => {
    const row = document.querySelector('.log-row') as HTMLElement;
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const ctx = document.getElementById('ctxmenu')!;
    const items = [...ctx.querySelectorAll('*')].filter((el) => el.textContent === 'Cherry-Pick');
    expect(items.length).toBeGreaterThan(0);
    (items[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'cherryPick', hash: 'b'.repeat(40) });
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
