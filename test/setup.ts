import { beforeEach } from 'vitest';
import { window, commands, env } from './vscode-mock';

beforeEach(() => {
  window.showInputBox = async () => undefined;
  window.showQuickPick = async () => undefined;
  window.showWarningMessage = async () => undefined;
  window.showInformationMessage = async () => undefined;
  window.showErrorMessage = async () => undefined;
  window.createStatusBarItem = () => ({ text: '', show: () => undefined, dispose: () => undefined });
  window.createTextEditorDecorationType = () => ({ dispose: () => undefined });
  window.showTextDocument = async () => undefined;
  (window as Record<string, unknown>).activeTextEditor = undefined;
  commands.executeCommand = async () => undefined;
  env.clipboard.writeText = async () => undefined;
  env.openExternal = async () => true;
});
