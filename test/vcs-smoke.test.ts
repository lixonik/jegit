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

  it('prefills and clears the message with the amend checkbox', () => {
    const msg = document.getElementById('message') as HTMLTextAreaElement;
    const amend = document.getElementById('amend') as HTMLInputElement;
    msg.value = '';
    msg.dispatchEvent(new Event('input', { bubbles: true }));

    amend.checked = true;
    amend.dispatchEvent(new Event('change', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'getLastCommitMessage' });

    sendToWebview({ type: 'lastCommitMessage', message: 'Previous subject' });
    expect(msg.value).toBe('Previous subject');

    amend.checked = false;
    amend.dispatchEvent(new Event('change', { bubbles: true }));
    expect(msg.value).toBe('');
  });

  it('keeps directory checkboxes tri-state over their descendants', () => {
    sendToWebview({
      type: 'state',
      payload: {
        branch: 'main',
        total: 2,
        changelists: [
          {
            id: 'default',
            name: 'Changes',
            active: true,
            files: [changeItem, { ...changeItem, path: 'src/b.ts', fsPath: 'D:/repo/src/b.ts' }],
          },
        ],
      },
      operation: null,
      staging: null,
    });
    const boxes = () => [...document.querySelectorAll('#tree input[type=checkbox]')] as HTMLInputElement[];
    expect(boxes().length).toBeGreaterThanOrEqual(3);

    const fileBoxes = boxes().slice(-2);
    if (!fileBoxes[0].checked) fileBoxes[0].click();
    if (boxes().slice(-2)[1].checked) boxes().slice(-2)[1].click();
    const dirBox = boxes()[boxes().length - 3];
    expect(dirBox.indeterminate).toBe(true);

    dirBox.checked = true;
    dirBox.dispatchEvent(new Event('change', { bubbles: true }));
    const after = boxes().slice(-2);
    expect(after[0].checked).toBe(true);
    expect(after[1].checked).toBe(true);
  });

  it('toggles between the directory tree and the flat list', () => {
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
    const tree = document.getElementById('tree')!;
    const hasDirNode = () => tree.querySelector('.fname.dir') !== null;
    expect(hasDirNode()).toBe(true);

    const toggle = document.getElementById('tb-group') as HTMLElement;
    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(hasDirNode()).toBe(false);
    expect(tree.querySelector('.fdir')!.textContent).toBe('src');

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(hasDirNode()).toBe(true);
  });

  it('shelves and rolls back the checked files from the toolbar', () => {
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
    const fileBox = [...document.querySelectorAll('#tree input[type=checkbox]')].at(-1) as HTMLInputElement;
    if (!fileBox.checked) fileBox.click();

    document.getElementById('tb-shelve')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'shelve', items: [{ path: 'src/a.ts', untracked: false }] });

    document.getElementById('tb-rollback')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'rollback', items: [{ path: 'src/a.ts', untracked: false }] });
  });

  it('offers Skip only during a rebase and posts banner actions', () => {
    const send = (operation: string) =>
      sendToWebview({
        type: 'state',
        payload: { branch: 'main', total: 0, changelists: [] },
        operation,
        staging: null,
      });
    const banner = () => document.getElementById('op-banner')!;
    const buttons = () => [...banner().querySelectorAll('button')].map((b) => b.textContent);

    send('merge');
    expect(buttons()).toEqual(['Continue', 'Abort']);

    send('rebase');
    expect(buttons()).toEqual(['Continue', 'Skip', 'Abort']);
    const skip = [...banner().querySelectorAll('button')].find((b) => b.textContent === 'Skip')!;
    skip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'opAction', action: 'skip' });
  });

  it('renders staging groups and stages a file from its menu', () => {
    sendToWebview({
      type: 'state',
      payload: { branch: 'main', total: 2, changelists: [] },
      operation: null,
      staging: {
        staged: [{ path: 'src/s.ts', letter: 'M' }],
        unstaged: [{ path: 'src/u.ts', letter: 'M' }],
        untracked: [],
      },
    });
    const tree = document.getElementById('tree')!;
    const groups = [...tree.querySelectorAll('.cl-name')].map((el) => el.textContent);
    expect(groups).toEqual(['Staged', 'Changes', 'Unversioned Files']);

    const unstagedRow = [...tree.querySelectorAll('.tree-row')].find((r) =>
      r.textContent?.includes('u.ts'),
    ) as HTMLElement;
    unstagedRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const stageItem = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Stage',
    ) as HTMLElement;
    stageItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'stage', paths: ['src/u.ts'] });
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

  it('unshelves a shelf from its context menu', () => {
    sendToWebview({
      type: 'shelfData',
      entries: [{ id: 's1', name: 'WIP dialogs', createdAt: '2026-07-09T12:00:00+03:00', files: ['src/a.ts'] }],
    });
    const shelfRow = [...document.querySelectorAll('#shelf-list *')].find((el) =>
      el.textContent?.includes('WIP dialogs'),
    ) as HTMLElement;
    shelfRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const keep = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Unshelve and Keep',
    ) as HTMLElement;
    expect(keep).toBeDefined();
    keep.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'unshelve', id: 's1', keep: true });
  });

  it('renders the branch panel and drives scope and checkout from it', () => {
    sendToWebview({
      type: 'branchData',
      current: 'main',
      locals: ['main', 'feature/x'],
      remotes: ['origin/main'],
      outgoing: [],
      scope: '--all',
      logPath: '',
    });
    const panel = document.getElementById('log-branches')!;
    expect(panel.textContent).toContain('feature');
    expect(panel.textContent).toContain('x');

    const branchRow = [...panel.querySelectorAll('*')].find((el) => el.textContent === 'x')
      ?? [...panel.querySelectorAll('*')].find((el) => el.textContent === 'feature/x');
    expect(branchRow).toBeDefined();
    (branchRow as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted.filter((p) => p.type === 'setLogScope').length).toBeGreaterThan(0);

    (branchRow as HTMLElement).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const checkout = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Checkout',
    ) as HTMLElement;
    expect(checkout).toBeDefined();
    checkout.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const cmd = posted.filter((p) => p.type === 'branchCmd').at(-1) as { action: string; ref: string };
    expect(cmd.action).toBe('checkout');
    expect(cmd.ref).toBe('feature/x');
  });

  it('compares two ctrl-clicked commits via the context menu', () => {
    const rows = [...document.querySelectorAll('.log-row')] as HTMLElement[];
    expect(rows.length).toBe(2);
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(rows[0].classList.contains('compare-sel')).toBe(true);
    expect(rows[1].classList.contains('compare-sel')).toBe(true);

    rows[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const compare = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Compare Selected Versions',
    ) as HTMLElement;
    expect(compare).toBeDefined();
    compare.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const call = posted.filter((p) => p.type === 'compareCommits').at(-1) as { a: string; b: string };
    expect([call.a, call.b].sort()).toEqual(['a'.repeat(40), 'b'.repeat(40)]);
  });

  it('groups untracked files and offers Add to .gitignore', () => {
    const untrackedItem = {
      ...changeItem,
      path: 'scratch.log',
      status: '??',
      statusLabel: 'Unversioned',
      letter: '?',
      untracked: true,
      fsPath: 'D:/repo/scratch.log',
    };
    sendToWebview({
      type: 'state',
      payload: {
        branch: 'main',
        total: 1,
        changelists: [{ id: 'default', name: 'Changes', active: true, files: [untrackedItem] }],
      },
      operation: null,
      staging: null,
    });
    const tree = document.getElementById('tree')!;
    expect(tree.textContent).toContain('Unversioned Files');

    const fileNode = [...tree.querySelectorAll('*')].find(
      (el) => el.textContent?.trim() === 'scratch.log',
    ) as HTMLElement;
    fileNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const ignore = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Add to .gitignore',
    ) as HTMLElement;
    expect(ignore).toBeDefined();
    ignore.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'addToGitignore', path: 'scratch.log' });
  });

  it('moves a file and sets the active list from the changelist menus', () => {
    sendToWebview({
      type: 'state',
      payload: {
        branch: 'main',
        total: 1,
        changelists: [
          { id: 'default', name: 'Changes', active: true, files: [changeItem] },
          { id: 'cl2', name: 'Feature X', active: false, files: [] },
        ],
      },
      operation: null,
      staging: null,
    });
    const tree = document.getElementById('tree')!;
    const fileNode = [...tree.querySelectorAll('*')].find(
      (el) => el.textContent?.trim() === 'a.ts',
    ) as HTMLElement;
    fileNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const move = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Move to Another Changelist...',
    ) as HTMLElement;
    move.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'move', paths: ['src/a.ts'] });

    const listHeader = [...tree.querySelectorAll('*')].find(
      (el) => el.textContent?.trim() === 'Feature X',
    ) as HTMLElement;
    listHeader.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const setActive = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Set Active Changelist',
    ) as HTMLElement;
    setActive.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(posted).toContainEqual({ type: 'setActive', id: 'cl2' });
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

  it('filters the log rows by the picked author', () => {
    sendToWebview({
      type: 'logData',
      commits: [
        { hash: 'c'.repeat(40), parents: [], author: 'Dev One', email: 'a@e', date: '2026-07-09T12:00:00+03:00', subject: 'By one', refs: [] },
        { hash: 'd'.repeat(40), parents: [], author: 'Dev Two', email: 'b@e', date: '2026-07-08T12:00:00+03:00', subject: 'By two', refs: [] },
      ],
    });
    const user = document.getElementById('log-user') as HTMLSelectElement;
    const options = [...user.options].map((o) => o.textContent);
    expect(options).toContain('Dev One');
    expect(options).toContain('Dev Two');

    user.value = [...user.options].find((o) => o.textContent === 'Dev Two')!.value;
    user.dispatchEvent(new Event('change', { bubbles: true }));
    const rows = [...document.querySelectorAll('.log-row')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('By two');

    user.value = '';
    user.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelectorAll('.log-row')).toHaveLength(2);
  });

  it('filters the log rows by the picked date range', () => {
    sendToWebview({
      type: 'logData',
      commits: [
        { hash: 'e'.repeat(40), parents: [], author: 'Dev', email: 'a@e', date: new Date().toISOString(), subject: 'Fresh work', refs: [] },
        { hash: 'f'.repeat(40), parents: [], author: 'Dev', email: 'a@e', date: '2020-01-01T12:00:00+03:00', subject: 'Ancient work', refs: [] },
      ],
    });
    expect(document.querySelectorAll('.log-row')).toHaveLength(2);

    const dateSelect = document.getElementById('log-date') as HTMLSelectElement;
    dateSelect.value = '7';
    dateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const rows = [...document.querySelectorAll('.log-row')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Fresh work');

    dateSelect.value = '';
    dateSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(document.querySelectorAll('.log-row')).toHaveLength(2);
  });

  it('cherry-picks a ctrl-clicked pair oldest first', () => {
    sendToWebview({
      type: 'logData',
      commits: [
        { hash: 'h'.repeat(40), parents: [], author: 'Dev', email: 'a@e', date: '2026-07-09T12:00:00+03:00', subject: 'Newer pick', refs: [] },
        { hash: 'g'.repeat(40), parents: [], author: 'Dev', email: 'a@e', date: '2026-07-08T12:00:00+03:00', subject: 'Older pick', refs: [] },
      ],
    });
    const rows = [...document.querySelectorAll('.log-row')] as HTMLElement[];
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));

    rows[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    const pick = [...document.getElementById('ctxmenu')!.querySelectorAll('*')].find(
      (el) => el.textContent === 'Cherry-Pick Selected (oldest first)',
    ) as HTMLElement;
    expect(pick).toBeDefined();
    const before = posted.filter((p) => p.type === 'cherryPick').length;
    pick.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const picks = posted.filter((p) => p.type === 'cherryPick').slice(before) as { hash: string }[];
    expect(picks.map((p) => p.hash)).toEqual(['g'.repeat(40), 'h'.repeat(40)]);
  });

  it('opens the revision diff when a details file is clicked', () => {
    const fileRow = [...document.querySelectorAll('#log-details *')].find(
      (el) => el.textContent?.trim() === 'a.ts',
    ) as HTMLElement;
    expect(fileRow).toBeDefined();
    fileRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const call = posted.filter((p) => p.type === 'openRevDiff').at(-1) as { hash: string; parent: string; path: string };
    expect(call.hash).toBe('b'.repeat(40));
    expect(call.parent).toBe('a'.repeat(40));
    expect(call.path).toBe('src/a.ts');
  });
});
