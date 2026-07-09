import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerBootstrapCommands } from '../src/commands/bootstrap';
import { execGit } from '../src/git/runner';

vi.mock('../src/git/runner', () => ({
  execGit: vi.fn(async () => ''),
}));

const mockedExecGit = vi.mocked(execGit);
const win = vscode.window as unknown as Record<string, unknown>;
const cmd = vscode.commands as unknown as Record<string, unknown>;

type Handler = () => Promise<void>;

function register(folder?: { uri: { fsPath: string } }) {
  const handlers: Record<string, Handler> = {};
  cmd.registerCommand = (id: string, fn: Handler) => {
    handlers[id] = fn;
    return { dispose: () => undefined };
  };
  registerBootstrapCommands({ subscriptions: [] } as never, folder as never);
  return handlers;
}

describe('jegit.init', () => {
  beforeEach(() => {
    mockedExecGit.mockReset();
    mockedExecGit.mockResolvedValue('');
    win.showInputBox = async () => undefined;
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    win.showOpenDialog = async () => undefined;
  });

  it('asks for a folder when none is open', async () => {
    const info = vi.fn(async () => undefined);
    win.showInformationMessage = info;
    const handlers = register(undefined);
    await handlers['jegit.init']();
    expect(info).toHaveBeenCalled();
    expect(mockedExecGit).not.toHaveBeenCalled();
  });

  it('refuses to init inside an existing repository', async () => {
    mockedExecGit.mockResolvedValue('D:/repo\n');
    const handlers = register({ uri: { fsPath: 'D:/repo/sub' } });
    await handlers['jegit.init']();
    const initCall = mockedExecGit.mock.calls.find((c) => c[0][0] === 'init');
    expect(initCall).toBeUndefined();
  });

  it('initializes a repository in a fresh folder', async () => {
    mockedExecGit.mockImplementation(async (args: string[]) => {
      if (args[0] === 'rev-parse') throw new Error('not a repository');
      return '';
    });
    const handlers = register({ uri: { fsPath: 'D:/fresh' } });
    await handlers['jegit.init']();
    expect(mockedExecGit).toHaveBeenCalledWith(['init'], { cwd: 'D:/fresh' });
  });
});

describe('jegit.clone', () => {
  beforeEach(() => {
    mockedExecGit.mockReset();
    mockedExecGit.mockResolvedValue('');
    win.showInformationMessage = async () => undefined;
    win.showErrorMessage = async () => undefined;
    win.withProgress = async (_opts: unknown, task: () => Promise<unknown>) => task();
  });

  it('clones into the picked directory under the guessed name', async () => {
    win.showInputBox = async () => 'https://github.com/user/repo.git';
    win.showOpenDialog = async () => [{ fsPath: 'D:/projects' }];
    const handlers = register(undefined);
    await handlers['jegit.clone']();
    expect(mockedExecGit).toHaveBeenCalledWith(['clone', '--', 'https://github.com/user/repo.git', 'repo'], {
      cwd: 'D:/projects',
    });
  });

  it('does nothing when the url prompt is cancelled', async () => {
    win.showInputBox = async () => undefined;
    const handlers = register(undefined);
    await handlers['jegit.clone']();
    expect(mockedExecGit).not.toHaveBeenCalled();
  });

  it('does nothing when no target directory is picked', async () => {
    win.showInputBox = async () => 'https://github.com/user/repo.git';
    win.showOpenDialog = async () => undefined;
    const handlers = register(undefined);
    await handlers['jegit.clone']();
    expect(mockedExecGit).not.toHaveBeenCalled();
  });
});
