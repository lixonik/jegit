import * as vscode from 'vscode';
import type { Repository } from '../model/repository';

/** The branch + ahead/behind status-bar widget; clicking opens the Branches popup. */
export function createBranchStatusBar(repo: Repository): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'jegit.branches';
  item.tooltip = 'JeGit: Git branches';
  const update = () => {
    const s = repo.sync;
    const ab = s && (s.ahead || s.behind) ? `  $(arrow-down)${s.behind} $(arrow-up)${s.ahead}` : '';
    item.text = repo.branch ? `$(git-branch) ${repo.branch}${ab}` : '$(git-branch) JeGit';
    item.show();
  };
  const subscription = repo.onDidChange(update);
  update();
  return vscode.Disposable.from(item, subscription);
}
