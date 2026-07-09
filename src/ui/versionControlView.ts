import * as vscode from 'vscode';
import { Repository } from '../model/repository';
import { renderVersionControlHtml } from './versionControlHtml';
import { ShelfController } from './shelfController';
import { LogController } from './logController';
import { LocalChangesController } from './localChangesController';
import { splitStaged } from '../util/stagingGroups';
import { Incoming } from '../model/webviewMessages';

/** The JetBrains-style Version Control tool window, rendered as a webview. */
export class VersionControlView implements vscode.WebviewViewProvider {
  static readonly viewId = 'jegit.versionControl';
  private view?: vscode.WebviewView;
  private readonly consoleLog: string[] = [];
  private readonly shelfCtrl: ShelfController;
  private readonly logCtrl: LogController;
  private readonly localCtrl: LocalChangesController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly repo: Repository,
  ) {
    this.repo.onDidChange(() => this.postState());
    this.repo.git.commandLogger = (line) => this.pushConsole(line);
    const post = (m: object) => this.view?.webview.postMessage(m);
    this.shelfCtrl = new ShelfController(this.repo, post);
    this.logCtrl = new LogController(this.context, this.repo, post);
    this.localCtrl = new LocalChangesController(this.context, this.repo, post);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    view.webview.html = renderVersionControlHtml(view.webview, this.context.extensionUri);
    view.webview.onDidReceiveMessage((m: Incoming) => void this.onMessage(m));
    view.onDidChangeVisibility(() => {
      if (view.visible) void this.repo.refresh();
    });
    void this.repo.refresh();
  }

  private async postState(): Promise<void> {
    const payload = this.repo.view();
    const operation = await this.repo.git.operationState().catch(() => null);
    const stagingOn = vscode.workspace.getConfiguration('jegit').get('stagingArea', false);
    const staging = stagingOn ? splitStaged(await this.repo.git.status().catch(() => [])) : null;
    this.view?.webview.postMessage({ type: 'state', payload, operation, staging });
  }

  private pushConsole(line: string): void {
    const entry = `$ ${line}`;
    this.consoleLog.push(entry);
    if (this.consoleLog.length > 500) this.consoleLog.shift();
    this.view?.webview.postMessage({ type: 'consoleLine', line: entry });
  }

  /** Focus the Log tab and select a commit by hash (used by the blame "Show Commit in Log" link). */
  async revealCommitInLog(hash: string): Promise<void> {
    await vscode.commands.executeCommand(`${VersionControlView.viewId}.focus`);
    await this.logCtrl.reveal(hash);
  }

  private async onMessage(m: Incoming): Promise<void> {
    if (await this.shelfCtrl.handle(m)) return;
    if (await this.logCtrl.handle(m)) return;
    if (await this.localCtrl.handle(m)) return;
    switch (m.type) {
      case 'ready':
        this.postState();
        break;
      case 'refresh':
        await this.repo.refresh();
        break;
      case 'branches':
        await vscode.commands.executeCommand('jegit.branches');
        break;
      case 'requestConsole':
        this.view?.webview.postMessage({ type: 'consoleData', lines: this.consoleLog });
        break;
      case 'opAction': {
        const cmd =
          m.action === 'continue'
            ? 'jegit.continueOperation'
            : m.action === 'abort'
              ? 'jegit.abortOperation'
              : 'jegit.skipCommit';
        await vscode.commands.executeCommand(cmd);
        await this.postState();
        break;
      }
    }
  }
}
