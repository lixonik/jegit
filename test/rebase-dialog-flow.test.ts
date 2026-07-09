import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { showRebaseDialog } from '../src/ui/rebaseDialog';
import type { Repository } from '../src/model/repository';

type Handler = (m: { type: string; plan?: { hash: string; action: string }[] }) => Promise<void>;
const win = vscode.window as unknown as Record<string, unknown>;

function makePanel() {
  const panel = {
    webview: {
      html: '',
      onDidReceiveMessage: (h: Handler) => {
        panel.handler = h;
        return { dispose: () => undefined };
      },
    },
    handler: undefined as Handler | undefined,
    dispose: vi.fn(),
  };
  win.createWebviewPanel = () => panel;
  return panel;
}

function makeRepo(commits: { hash: string; subject: string }[]): Repository {
  return {
    git: {
      rangeCommits: vi.fn(async () => commits),
      rebaseTodo: vi.fn(async () => undefined),
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

const context = { extensionUri: {} } as never;
const twoCommits = [
  { hash: 'a'.repeat(40), subject: 'Fix a' },
  { hash: 'b'.repeat(40), subject: 'Fix b' },
];

describe('showRebaseDialog', () => {
  beforeEach(() => {
    win.showInformationMessage = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('reports when there is nothing to rebase', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const create = vi.fn();
    win.createWebviewPanel = create;
    await showRebaseDialog(context, makeRepo([]), 'abc');
    expect(info).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an invalid plan without starting the rebase', async () => {
    const warn = vi.fn(async () => undefined);
    win.showWarningMessage = warn;
    const panel = makePanel();
    const repo = makeRepo(twoCommits);
    await showRebaseDialog(context, repo, 'abc');
    await panel.handler!({ type: 'start', plan: [{ hash: 'a', action: 'drop' }] });
    expect(warn).toHaveBeenCalled();
    expect(repo.git.rebaseTodo).not.toHaveBeenCalled();
    expect(panel.dispose).not.toHaveBeenCalled();
  });

  it('writes the todo file, runs the rebase, cleans up and closes', async () => {
    const panel = makePanel();
    const repo = makeRepo(twoCommits);
    let todoFile = '';
    let todoContent = '';
    (repo.git.rebaseTodo as ReturnType<typeof vi.fn>).mockImplementation(async (_base, _script, tmp: string) => {
      todoFile = tmp;
      todoContent = fs.readFileSync(tmp, 'utf8');
    });
    await showRebaseDialog(context, repo, 'abc');
    await panel.handler!({
      type: 'start',
      plan: [
        { hash: 'a', action: 'pick' },
        { hash: 'b', action: 'fixup' },
      ],
    });
    expect(repo.git.rebaseTodo).toHaveBeenCalledWith('abc~1', expect.any(String), expect.any(String));
    expect(todoContent).toBe('pick a\nfixup b\n');
    expect(fs.existsSync(todoFile)).toBe(false);
    expect(repo.refresh).toHaveBeenCalled();
    expect(panel.dispose).toHaveBeenCalled();
  });

  it('closes without touching git on cancel', async () => {
    const panel = makePanel();
    const repo = makeRepo(twoCommits);
    await showRebaseDialog(context, repo, 'abc');
    await panel.handler!({ type: 'cancel' });
    expect(repo.git.rebaseTodo).not.toHaveBeenCalled();
    expect(panel.dispose).toHaveBeenCalled();
  });
});
