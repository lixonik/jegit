import * as vscode from 'vscode';
import type { Repository } from '../model/repository';
import { pushFlow, updateFlow } from '../ui/remoteOps';
import { isEmpty } from '../util/guards';

export function registerRemoteCommands(context: vscode.ExtensionContext, repo: Repository): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('jegit.push', () => pushFlow(repo)),
    vscode.commands.registerCommand('jegit.update', () => updateFlow(repo)),
    vscode.commands.registerCommand('jegit.fetch', () => fetchRemote(repo)),
    vscode.commands.registerCommand('jegit.fetchPrune', () => fetchAndPrune(repo)),
    vscode.commands.registerCommand('jegit.pushForce', () => forcePush(repo)),
    vscode.commands.registerCommand('jegit.pushTags', () => pushTags(repo)),
    vscode.commands.registerCommand('jegit.resetToRemote', () => resetToRemote(repo)),
    vscode.commands.registerCommand('jegit.unshallow', () => unshallowRepository(repo)),
  );
}

async function fetchRemote(repo: Repository): Promise<void> {
  try {
    await repo.git.fetch();
    vscode.window.showInformationMessage('JeGit: fetched.');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

async function fetchAndPrune(repo: Repository): Promise<void> {
  try {
    await repo.git.fetchPrune();
    vscode.window.showInformationMessage('JeGit: fetched all remotes and pruned stale branches.');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

async function forcePush(repo: Repository): Promise<void> {
  if (!(await repo.git.hasUpstream())) {
    vscode.window.showWarningMessage('JeGit: no upstream to push to.');
    return;
  }
  const protectedBranches = vscode.workspace
    .getConfiguration('jegit')
    .get<string[]>('protectedBranches', ['main', 'master']);
  const prompt = protectedBranches.includes(repo.branch)
    ? `Force push to ${repo.branch}? It is a protected branch -- this overwrites shared history.`
    : 'Force push (--force-with-lease)? This overwrites the remote branch.';
  const ok = await vscode.window.showWarningMessage(prompt, { modal: true }, 'Force Push');
  if (ok !== 'Force Push') return;
  try {
    await repo.git.pushForce();
    vscode.window.showInformationMessage('JeGit: force-pushed.');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

async function pushTags(repo: Repository): Promise<void> {
  try {
    await repo.git.pushTags();
    vscode.window.showInformationMessage('JeGit: pushed tags.');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

async function resetToRemote(repo: Repository): Promise<void> {
  const upstream = await repo.git.upstreamRef();
  if (isEmpty(upstream)) {
    vscode.window.showInformationMessage('JeGit: the current branch has no upstream.');
    return;
  }
  const { current } = await repo.git.branches();
  const ok = await vscode.window.showWarningMessage(
    `Reset local branch ${current} to ${upstream}? Local commits will be dropped.`,
    { modal: true },
    'Reset',
  );
  if (ok !== 'Reset') return;
  try {
    await repo.git.fetch().catch(() => undefined);
    await repo.git.resetHard(upstream);
    vscode.window.showInformationMessage(`JeGit: ${current} reset to ${upstream}.`);
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}

async function unshallowRepository(repo: Repository): Promise<void> {
  if (!(await repo.git.isShallow())) {
    vscode.window.showInformationMessage('JeGit: this repository is not shallow.');
    return;
  }
  try {
    await repo.git.unshallow();
    vscode.window.showInformationMessage('JeGit: repository unshallowed.');
  } catch (err) {
    vscode.window.showErrorMessage(`JeGit: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await repo.refresh();
  }
}
