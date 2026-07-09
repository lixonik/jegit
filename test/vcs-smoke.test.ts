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
});
