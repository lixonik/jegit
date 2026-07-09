import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { VersionControlView } from '../src/ui/versionControlView';
import { EventEmitter } from './vscode-mock';
import type { Repository } from '../src/model/repository';

type Handler = (m: unknown) => void;
const cmd = vscode.commands as unknown as Record<string, unknown>;

function makeRepo(): Repository {
  const emitter = new EventEmitter<void>();
  return {
    onDidChange: emitter.event,
    git: {
      commandLogger: undefined,
      operationState: vi.fn(async () => null),
      status: vi.fn(async () => []),
    },
    view: () => ({ branch: 'main', total: 0, changelists: [] }),
    refresh: vi.fn(async () => undefined),
    shelves: () => [{ id: 's1', name: 'WIP' }],
  } as unknown as Repository;
}

function resolve(view: VersionControlView) {
  let handler: Handler | undefined;
  const webview = {
    options: undefined as unknown,
    html: '',
    cspSource: 'mock-csp',
    asWebviewUri: (u: unknown) => u,
    postMessage: vi.fn(),
    onDidReceiveMessage: (h: Handler) => {
      handler = h;
      return { dispose: () => undefined };
    },
  };
  const panelView = {
    webview,
    visible: true,
    onDidChangeVisibility: () => ({ dispose: () => undefined }),
  };
  view.resolveWebviewView(panelView as never);
  return { webview, send: (m: unknown) => handler!(m) };
}

describe('VersionControlView', () => {
  beforeEach(() => {
    cmd.executeCommand = async () => undefined;
  });

  it('renders the panel html and refreshes on resolve', () => {
    const repo = makeRepo();
    const view = new VersionControlView({ extensionUri: {} } as never, repo);
    const { webview } = resolve(view);
    expect(webview.html).toContain('Local Changes');
    expect(repo.refresh).toHaveBeenCalled();
  });

  it('delegates shelf messages to the shelf controller', async () => {
    const repo = makeRepo();
    const view = new VersionControlView({ extensionUri: {} } as never, repo);
    const { webview, send } = resolve(view);
    await send({ type: 'requestShelf' });
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'shelfData', entries: [{ id: 's1', name: 'WIP' }] });
  });

  it('maps operation banner actions onto the jegit commands', async () => {
    const repo = makeRepo();
    const exec = vi.fn(async () => undefined);
    cmd.executeCommand = exec;
    const view = new VersionControlView({ extensionUri: {} } as never, repo);
    const { send } = resolve(view);
    await send({ type: 'opAction', action: 'continue' });
    await send({ type: 'opAction', action: 'abort' });
    await send({ type: 'opAction', action: 'skip' });
    expect(exec.mock.calls.map((c) => c[0])).toEqual([
      'jegit.continueOperation',
      'jegit.abortOperation',
      'jegit.skipCommit',
    ]);
  });

  it('collects git commands into the console and replays them on request', async () => {
    const repo = makeRepo();
    const view = new VersionControlView({ extensionUri: {} } as never, repo);
    const { webview, send } = resolve(view);
    (repo.git.commandLogger as unknown as (line: string) => void)('status --porcelain');
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'consoleLine', line: '$ status --porcelain' });
    await send({ type: 'requestConsole' });
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'consoleData', lines: ['$ status --porcelain'] });
  });
});
