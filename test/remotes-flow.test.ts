import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { manageRemotes } from '../src/ui/remotes';
import type { Repository } from '../src/model/repository';

type AnyFn = (...args: unknown[]) => Promise<unknown>;
const win = vscode.window as unknown as Record<string, AnyFn>;

function scriptQuickPick(...answers: unknown[]) {
  const queue = [...answers];
  win.showQuickPick = async () => queue.shift();
}

function scriptInputBox(...answers: (string | undefined)[]) {
  const queue = [...answers];
  win.showInputBox = async () => queue.shift();
}

function makeRepo(): Repository {
  return {
    git: {
      remote: {
        list: vi.fn(async () => [{ name: 'origin', url: 'https://h/r.git' }]),
        add: vi.fn(async () => undefined),
        setUrl: vi.fn(async () => undefined),
        rename: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
    refresh: vi.fn(async () => undefined),
  } as unknown as Repository;
}

describe('manageRemotes', () => {
  beforeEach(() => {
    win.showQuickPick = async () => undefined;
    win.showInputBox = async () => undefined;
    win.showWarningMessage = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
  });

  it('adds a remote with trimmed name and url', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'add', action: 'add' });
    scriptInputBox('  upstream  ', '  https://h/up.git  ');
    await manageRemotes(repo);
    expect(repo.git.remote.add).toHaveBeenCalledWith('upstream', 'https://h/up.git');
  });

  it('adds nothing when the url prompt is cancelled', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'add', action: 'add' });
    scriptInputBox('upstream', undefined);
    await manageRemotes(repo);
    expect(repo.git.remote.add).not.toHaveBeenCalled();
  });

  it('changes the url of a picked remote', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'origin', description: 'https://h/r.git', name: 'origin' }, { label: 'url', a: 'url' });
    scriptInputBox('https://h/new.git');
    await manageRemotes(repo);
    expect(repo.git.remote.setUrl).toHaveBeenCalledWith('origin', 'https://h/new.git');
  });

  it('renames a picked remote', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'origin', description: 'u', name: 'origin' }, { label: 'rename', a: 'rename' });
    scriptInputBox('mirror');
    await manageRemotes(repo);
    expect(repo.git.remote.rename).toHaveBeenCalledWith('origin', 'mirror');
  });

  it('removes a remote only after confirmation', async () => {
    const repo = makeRepo();
    scriptQuickPick({ label: 'origin', description: 'u', name: 'origin' }, { label: 'remove', a: 'remove' });
    await manageRemotes(repo);
    expect(repo.git.remote.remove).not.toHaveBeenCalled();

    scriptQuickPick({ label: 'origin', description: 'u', name: 'origin' }, { label: 'remove', a: 'remove' });
    win.showWarningMessage = async () => 'Remove';
    await manageRemotes(repo);
    expect(repo.git.remote.remove).toHaveBeenCalledWith('origin');
    expect(repo.refresh).toHaveBeenCalled();
  });
});
