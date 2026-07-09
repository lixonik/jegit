import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { showFileHistory } from '../src/ui/history';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;
const cmd = vscode.commands as unknown as Record<string, AnyFn>;

const commit = { hash: 'abcdef1234567890', parent: '1234567890abcdef', author: 'dev', date: '2026-07-01', subject: 'Fix a' };

function makeRepo(log: unknown[] = [commit]): Repository {
  return {
    git: {
      fileLog: vi.fn(async () => log),
      restoreFile: vi.fn(async () => undefined),
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

function scriptQuickPick(...answers: unknown[]) {
  const queue = [...answers];
  win.showQuickPick = async () => queue.shift();
}

describe('showFileHistory', () => {
  beforeEach(() => {
    win.showQuickPick = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    cmd.executeCommand = async () => undefined;
  });

  it('reports when the file has no history', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    await showFileHistory(makeRepo([]), 'src/a.ts');
    expect(info).toHaveBeenCalled();
  });

  it('opens a diff of the picked revision against its parent', async () => {
    const repo = makeRepo();
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    scriptQuickPick(
      { label: 'Fix a', hash: commit.hash, parent: commit.parent },
      { label: 'Show Diff', a: 'diff' },
    );
    await showFileHistory(repo, 'src/a.ts');
    expect(exec).toHaveBeenCalled();
    expect(repo.git.restoreFile).not.toHaveBeenCalled();
  });

  it('restores a revision only after confirmation', async () => {
    const repo = makeRepo();
    scriptQuickPick(
      { label: 'Fix a', hash: commit.hash, parent: commit.parent },
      { label: 'Restore', a: 'restore' },
    );
    await showFileHistory(repo, 'src/a.ts');
    expect(repo.git.restoreFile).not.toHaveBeenCalled();

    scriptQuickPick(
      { label: 'Fix a', hash: commit.hash, parent: commit.parent },
      { label: 'Restore', a: 'restore' },
    );
    win.showWarningMessage = async () => 'Restore';
    await showFileHistory(repo, 'src/a.ts');
    expect(repo.git.restoreFile).toHaveBeenCalledWith(commit.hash, 'src/a.ts');
    expect(repo.refresh).toHaveBeenCalled();
  });
});
