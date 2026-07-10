// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderVersionControlHtml } from '../src/ui/versionControlHtml';

const mediaDir = join(__dirname, '..', 'media');
const scripts = ['graph.js', 'tree.js', 'logfilter.js', 'datefmt.js', 'refchip.js', 'vcs.js'];
const savedStates: Array<Record<string, unknown>> = [];

function bodyHtml(): string {
  const webview = { cspSource: 'mock', asWebviewUri: (u: unknown) => u } as never;
  const html = renderVersionControlHtml(webview, { fsPath: '' } as never);
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  return body.replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('vcs.js ui state persistence', () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
      postMessage: () => undefined,
      getState: () => ({
        tab: 'log',
        logFilters: { text: 'fix', user: 'Dev', date: '7' },
        clCollapsed: ['default'],
        branchesW: 300,
      }),
      setState: (s: Record<string, unknown>) => savedStates.push(s),
    });
    document.body.innerHTML = bodyHtml();
    for (const name of scripts) {
      (0, eval)(readFileSync(join(mediaDir, name), 'utf8'));
    }
  });

  it('restores the persisted active tab on boot', () => {
    const logTab = document.querySelector('.tab[data-tab="log"]') as HTMLElement;
    expect(logTab.classList.contains('active')).toBe(true);
    const localPanel = document.querySelector('.tabpanel[data-tab="local"]') as HTMLElement;
    expect(localPanel.classList.contains('active')).toBe(false);
  });

  it('persists the tab choice when the user switches', () => {
    const shelfTab = document.querySelector('.tab[data-tab="shelf"]') as HTMLElement;
    shelfTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const last = savedStates.at(-1);
    expect(last).toBeDefined();
    expect(last!.tab).toBe('shelf');
  });

  it('restores the persisted log filters on boot', () => {
    expect((document.getElementById('log-search') as HTMLInputElement).value).toBe('fix');
    expect((document.getElementById('log-date') as HTMLSelectElement).value).toBe('7');
  });

  it('restores the persisted author filter once the log data arrives', () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'logData',
          commits: [
            { hash: 'a'.repeat(40), parents: [], author: 'Dev', date: '2026-07-10T10:00:00+03:00', refs: [], subject: 'fix things' },
          ],
          outgoing: [],
        },
      }),
    );
    expect((document.getElementById('log-user') as HTMLSelectElement).value).toBe('Dev');
  });

  it('restores the collapsed changelists and persists a toggle', () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          type: 'state',
          payload: {
            branch: 'main',
            total: 1,
            changelists: [
              {
                id: 'default',
                name: 'Changes',
                active: true,
                files: [
                  {
                    path: 'src/a.ts',
                    status: 'M',
                    statusLabel: 'Modified',
                    letter: 'M',
                    untracked: false,
                    deleted: false,
                    conflicted: false,
                    fsPath: 'D:/repo/src/a.ts',
                  },
                ],
              },
            ],
          },
          operation: null,
          staging: null,
        },
      }),
    );
    const tree = document.getElementById('tree')!;
    expect([...tree.querySelectorAll('.fname')].some((el) => el.textContent === 'a.ts')).toBe(false);

    const chev = tree.querySelector('.cl-node .chev') as HTMLElement;
    chev.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect([...tree.querySelectorAll('.fname')].some((el) => el.textContent === 'a.ts')).toBe(true);
    const last = savedStates.at(-1) as { clCollapsed?: string[] };
    expect(last.clCollapsed).toEqual([]);
  });

  it('restores the branches pane width and persists a splitter drag', () => {
    const pane = document.getElementById('log-branches') as HTMLElement;
    expect(pane.style.width).toBe('300px');

    const splitter = document.getElementById('split-branches') as HTMLElement;
    splitter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 0 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 240 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(pane.style.width).toBe('240px');
    const last = savedStates.at(-1) as { branchesW?: number };
    expect(last.branchesW).toBe(240);
  });

  it('persists the log filters as the user edits them', () => {
    const search = document.getElementById('log-search') as HTMLInputElement;
    search.value = 'feature';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const last = savedStates.at(-1) as { logFilters?: { text: string } };
    expect(last.logFilters).toBeDefined();
    expect(last.logFilters!.text).toBe('feature');
  });
});
