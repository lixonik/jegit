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
  const send = async (m: unknown) => {
    handler!(m);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { webview, send };
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

  it('caps the console buffer at 500 lines, dropping the oldest', async () => {
    const repo = makeRepo();
    const view = new VersionControlView({ extensionUri: {} } as never, repo);
    const { webview, send } = resolve(view);
    const log = repo.git.commandLogger as unknown as (line: string) => void;
    for (let i = 1; i <= 505; i++) log(`command ${i}`);
    await send({ type: 'requestConsole' });
    const call = webview.postMessage.mock.calls.find(
      (c) => (c[0] as { type: string }).type === 'consoleData',
    )![0] as { lines: string[] };
    expect(call.lines).toHaveLength(500);
    expect(call.lines[0]).toBe('$ command 6');
    expect(call.lines.at(-1)).toBe('$ command 505');
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

  it('clears the console buffer on demand', async () => {
    const repo = makeRepo();
    const view = new VersionControlView({ extensionUri: {} } as never, repo);
    const { webview, send } = resolve(view);
    (repo.git.commandLogger as unknown as (line: string) => void)('status');
    await send({ type: 'clearConsole' });
    expect(webview.postMessage).toHaveBeenCalledWith({ type: 'consoleData', lines: [] });
    await send({ type: 'requestConsole' });
    const replay = webview.postMessage.mock.calls
      .map((c) => c[0] as { type: string; lines?: string[] })
      .filter((m) => m.type === 'consoleData')
      .at(-1)!;
    expect(replay.lines).toEqual([]);
  });
});
