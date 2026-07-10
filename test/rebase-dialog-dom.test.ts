// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as vscode from 'vscode';
import { showRebaseDialog } from '../src/ui/rebaseDialog';
import type { Repository } from '../src/model/repository';

const posted: Array<Record<string, unknown>> = [];

function makeRepo(): Repository {
  return {
    git: {
      rangeCommits: vi.fn(async () => [
        { hash: 'a'.repeat(40), subject: 'First commit' },
        { hash: 'b'.repeat(40), subject: 'Second commit' },
      ]),
      rebaseTodo: vi.fn(async () => undefined),
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('rebase dialog dom', () => {
  beforeAll(async () => {
    (globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({
      postMessage: (m: Record<string, unknown>) => posted.push(m),
      getState: () => undefined,
      setState: () => undefined,
    });
    const panel = {
      webview: {
        html: '',
        onDidReceiveMessage: () => ({ dispose: () => undefined }),
      },
      dispose: () => undefined,
    };
    (vscode.window as unknown as Record<string, unknown>).createWebviewPanel = () => panel;
    await showRebaseDialog({ extensionUri: {} } as never, makeRepo(), 'c'.repeat(40));

    const html = panel.webview.html;
    document.body.innerHTML = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
    const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html);
    (0, eval)(script![1]);
  });

  it('renders the commits oldest first with pick preselected', () => {
    const rows = [...document.querySelectorAll('#list .row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('First commit');
    const selects = [...document.querySelectorAll('#list select')] as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['pick', 'pick']);
  });

  it('reorders a commit with the arrow buttons', () => {
    const downButtons = [...document.querySelectorAll('#list .mv')] as HTMLButtonElement[];
    const firstRowDown = downButtons[1];
    firstRowDown.click();
    const rows = [...document.querySelectorAll('#list .row')];
    expect(rows[0].textContent).toContain('Second commit');
  });

  it('posts the reordered plan on Start Rebase', () => {
    (document.getElementById('start') as HTMLElement).click();
    const start = posted.filter((p) => p.type === 'start').at(-1) as {
      plan: { hash: string; action: string }[];
    };
    expect(start.plan.map((p) => p.hash)).toEqual(['b'.repeat(40), 'a'.repeat(40)]);
    expect(start.plan.every((p) => p.action === 'pick')).toBe(true);
  });
});
