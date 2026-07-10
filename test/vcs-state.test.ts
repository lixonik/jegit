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
      getState: () => ({ tab: 'log' }),
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
});
