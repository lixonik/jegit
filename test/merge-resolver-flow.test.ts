import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { showMergeResolver } from '../src/ui/mergeResolver';
import type { Repository } from '../src/model/repository';

type Handler = (m: { type: string; content?: string }) => Promise<void>;

function makePanel() {
  const panel = {
    webview: {
      html: '',
      cspSource: 'mock-csp',
      asWebviewUri: (u: unknown) => u,
      postMessage: vi.fn(),
      onDidReceiveMessage: (h: Handler) => {
        panel.handler = h;
        return { dispose: () => undefined };
      },
    },
    handler: undefined as Handler | undefined,
    dispose: vi.fn(),
  };
  (vscode.window as unknown as Record<string, unknown>).createWebviewPanel = () => panel;
  return panel;
}

function makeRepo(root: string, conflicts: { path: string; status: string }[] = []): Repository {
  return {
    git: {
      showStage: vi.fn(async (stage: number) => (stage === 2 ? 'ours content' : 'theirs content')),
      add: vi.fn(async () => undefined),
      status: vi.fn(async () => conflicts),
    },
    absUri: (rel: string) => ({ fsPath: path.join(root, rel) }),
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('showMergeResolver', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'jegit-merge-test-'));
    (vscode.window as unknown as Record<string, unknown>).showInformationMessage = async () => undefined;
    (vscode.window as unknown as Record<string, unknown>).showErrorMessage = async () => undefined;
  });

  it('feeds the panel both sides and the working copy on ready', async () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'working with markers', 'utf8');
    const panel = makePanel();
    const repo = makeRepo(root);
    await showMergeResolver({ extensionUri: {} } as never, repo, 'a.ts');
    await panel.handler!({ type: 'ready' });
    expect(panel.webview.postMessage).toHaveBeenCalledWith({
      type: 'init',
      ours: 'ours content',
      theirs: 'theirs content',
      working: 'working with markers',
    });
  });

  it('writes the result, stages the file and closes on apply', async () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'conflict', 'utf8');
    const panel = makePanel();
    const repo = makeRepo(root);
    await showMergeResolver({ extensionUri: {} } as never, repo, 'a.ts');
    await panel.handler!({ type: 'apply', content: 'resolved content' });
    expect(fs.readFileSync(path.join(root, 'a.ts'), 'utf8')).toBe('resolved content');
    expect(repo.git.add).toHaveBeenCalledWith(['a.ts']);
    expect(repo.refresh).toHaveBeenCalled();
    expect(panel.dispose).toHaveBeenCalled();
  });

  it('offers the next conflict after a successful apply', async () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'conflict', 'utf8');
    fs.writeFileSync(path.join(root, 'b.ts'), 'conflict too', 'utf8');
    let created = 0;
    const panels: ReturnType<typeof makePanel>[] = [];
    (vscode.window as unknown as Record<string, unknown>).createWebviewPanel = () => {
      created += 1;
      const panel = {
        webview: {
          html: '',
          cspSource: 'mock-csp',
          asWebviewUri: (u: unknown) => u,
          postMessage: vi.fn(),
          onDidReceiveMessage: (h: Handler) => {
            panel.handler = h;
            return { dispose: () => undefined };
          },
        },
        handler: undefined as Handler | undefined,
        dispose: vi.fn(),
      };
      panels.push(panel as never);
      return panel;
    };
    (vscode.window as unknown as Record<string, unknown>).showInformationMessage = async () => 'Next Conflict';
    const repo = makeRepo(root, [{ path: 'b.ts', status: 'UU' }]);
    await showMergeResolver({ extensionUri: {} } as never, repo, 'a.ts');
    await panels[0].handler!({ type: 'apply', content: 'resolved' });
    expect(created).toBe(2);
  });

  it('stays quiet when the applied file was the last conflict', async () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'conflict', 'utf8');
    const panel = makePanel();
    const info = vi.fn(async () => undefined);
    (vscode.window as unknown as Record<string, unknown>).showInformationMessage = info;
    const repo = makeRepo(root, [{ path: 'a.ts', status: 'UU' }]);
    await showMergeResolver({ extensionUri: {} } as never, repo, 'a.ts');
    await panel.handler!({ type: 'apply', content: 'resolved' });
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('closes without staging on cancel', async () => {
    fs.writeFileSync(path.join(root, 'a.ts'), 'conflict', 'utf8');
    const panel = makePanel();
    const repo = makeRepo(root);
    await showMergeResolver({ extensionUri: {} } as never, repo, 'a.ts');
    await panel.handler!({ type: 'cancel' });
    expect(repo.git.add).not.toHaveBeenCalled();
    expect(panel.dispose).toHaveBeenCalled();
  });
});
