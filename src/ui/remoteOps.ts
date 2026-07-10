import * as vscode from 'vscode';
import { Repository } from '../model/repository';

/** Push, with a preview of outgoing commits and upstream setup when missing. */
export async function pushFlow(repo: Repository): Promise<void> {
  try {
    if (!(await repo.git.hasUpstream())) {
      const remotes = await repo.git.remote.list();
      let remote = 'origin';
      if (remotes.length > 1) {
        const pick = await vscode.window.showQuickPick(
          remotes.map((r) => ({ label: r.name, description: r.url })),
          { placeHolder: 'Push to remote' },
        );
        if (!pick) return;
        remote = pick.label;
      }
      const ok = await vscode.window.showWarningMessage(
        `Branch ${repo.branch} has no upstream. Push and set ${remote}/${repo.branch}?`,
        { modal: true },
        'Push',
      );
      if (ok !== 'Push') return;
      await repo.git.pushSetUpstream(remote);
      vscode.window.showInformationMessage(`JeGit: pushed and set upstream ${remote}/${repo.branch}.`);
    } else {
      const out = await repo.git.outgoingSubjects();
      if (!out.length) {
        vscode.window.showInformationMessage('JeGit: nothing to push.');
        return;
      }
      const detail = out.slice(0, 20).join('\n') + (out.length > 20 ? `\n...and ${out.length - 20} more` : '');
      const ok = await vscode.window.showInformationMessage(
        `Push ${out.length} commit(s) to the upstream?`,
        { modal: true, detail },
        'Push',
      );
      if (ok !== 'Push') return;
      await repo.git.push();
      vscode.window.showInformationMessage(`JeGit: pushed ${out.length} commit(s).`);
    }
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

let lastUpdateWasRebase = true;

/** Fetch, then pull (rebase or merge) when the branch is behind its upstream. */
export async function updateFlow(repo: Repository): Promise<void> {
  try {
    await repo.git.fetch();
    const ab = await repo.git.aheadBehind();
    if (!ab || ab.behind === 0) {
      vscode.window.showInformationMessage('JeGit: already up to date.');
      return;
    }
    type Item = vscode.QuickPickItem & { rebase: boolean };
    const options: Item[] = [
      { label: 'Rebase onto incoming', description: 'pull --rebase', rebase: true },
      { label: 'Merge incoming', description: 'pull --no-rebase', rebase: false },
    ];
    if (!lastUpdateWasRebase) options.reverse();
    const pick = await vscode.window.showQuickPick<Item>(options, {
      placeHolder: `Update: ${ab.behind} incoming commit(s)`,
    });
    if (!pick) return;
    lastUpdateWasRebase = pick.rebase;
    await repo.git.pull(pick.rebase);
    vscode.window.showInformationMessage(`JeGit: updated (${ab.behind} incoming commit(s)).`);
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}
