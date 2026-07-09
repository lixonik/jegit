import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { createBranchStatusBar } from '../src/ui/statusBar';
import { EventEmitter } from './vscode-mock';
import type { Repository } from '../src/model/repository';

type Item = { text: string; command?: string; tooltip?: string; show: () => void; dispose: () => void };

function setup(state: { branch: string; sync: { ahead: number; behind: number } | null }) {
  const item: Item = { text: '', show: vi.fn(), dispose: vi.fn() };
  (vscode.window as unknown as Record<string, unknown>).createStatusBarItem = () => item;
  const emitter = new EventEmitter<void>();
  const repo = {
    get branch() {
      return state.branch;
    },
    get sync() {
      return state.sync;
    },
    onDidChange: emitter.event,
  } as unknown as Repository;
  return { item, emitter, repo };
}

describe('createBranchStatusBar', () => {
  it('shows a placeholder before the first refresh', () => {
    const { item, repo } = setup({ branch: '', sync: null });
    createBranchStatusBar(repo);
    expect(item.text).toBe('$(git-branch) JeGit');
    expect(item.command).toBe('jegit.branches');
  });

  it('shows the branch with ahead/behind counters on change', () => {
    const state = { branch: '', sync: null as { ahead: number; behind: number } | null };
    const { item, emitter, repo } = setup(state);
    createBranchStatusBar(repo);
    state.branch = 'main';
    state.sync = { ahead: 1, behind: 2 };
    emitter.fire();
    expect(item.text).toBe('$(git-branch) main  $(arrow-down)2 $(arrow-up)1');
  });

  it('drops the counters when the branch is in sync', () => {
    const state = { branch: 'main', sync: { ahead: 0, behind: 0 } };
    const { item, repo } = setup(state);
    createBranchStatusBar(repo);
    expect(item.text).toBe('$(git-branch) main');
  });
});
