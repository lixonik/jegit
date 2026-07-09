import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { activate } from '../src/extension';
import { execGit } from '../src/git/runner';
import manifest from '../package.json';

vi.mock('../src/git/runner', () => ({
  execGit: vi.fn(async () => ''),
}));

const mockedExecGit = vi.mocked(execGit);
const win = vscode.window as unknown as Record<string, unknown>;
const cmd = vscode.commands as unknown as Record<string, unknown>;
const ws = vscode.workspace as unknown as Record<string, unknown>;

function makeContext(root: string) {
  const memento = { get: <T>(_k: string, d?: T) => d, update: async () => undefined, keys: () => [] };
  return {
    subscriptions: [],
    workspaceState: memento,
    globalState: memento,
    storageUri: { fsPath: path.join(root, 'storage') },
    globalStorageUri: { fsPath: path.join(root, 'global') },
    extensionUri: { fsPath: root },
  };
}

describe('activate', () => {
  it('registers every command contributed in package.json', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jegit-activate-'));
    mockedExecGit.mockImplementation(async (args: string[]) => {
      if (args.join(' ') === 'rev-parse --show-toplevel') return root + '\n';
      return '';
    });
    const registered = new Set<string>();
    cmd.registerCommand = (id: string) => {
      registered.add(id);
      return { dispose: () => undefined };
    };
    cmd.executeCommand = async () => undefined;
    win.registerWebviewViewProvider = () => ({ dispose: () => undefined });
    ws.workspaceFolders = [{ uri: { fsPath: root } }];
    ws.registerTextDocumentContentProvider = () => ({ dispose: () => undefined });

    await activate(makeContext(root) as never);

    const contributed = (manifest.contributes.commands as { command: string }[]).map((c) => c.command);
    const missing = contributed.filter((id) => !registered.has(id));
    expect(missing).toEqual([]);
  });

  it('stays dormant outside a git repository but keeps init and clone available', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jegit-dormant-'));
    mockedExecGit.mockImplementation(async () => {
      throw new Error('not a repository');
    });
    const registered = new Set<string>();
    cmd.registerCommand = (id: string) => {
      registered.add(id);
      return { dispose: () => undefined };
    };
    ws.workspaceFolders = [{ uri: { fsPath: root } }];

    await activate(makeContext(root) as never);

    expect(registered.has('jegit.init')).toBe(true);
    expect(registered.has('jegit.clone')).toBe(true);
    expect(registered.has('jegit.refresh')).toBe(false);
  });
});
