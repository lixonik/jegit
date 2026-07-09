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

function makeRepo(root: string): Repository {
  return {
    git: {
      showStage: vi.fn(async (stage: number) => (stage === 2 ? 'ours content' : 'theirs content')),
      add: vi.fn(async () => undefined),
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
