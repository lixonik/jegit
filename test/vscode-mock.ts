// Minimal stand-in for the `vscode` module used by unit tests.
// Tests overwrite the window methods to script user answers.
export const window: Record<string, (...args: unknown[]) => unknown> = {
  showInputBox: async () => undefined,
  showQuickPick: async () => undefined,
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  createStatusBarItem: () => ({ text: '', show: () => undefined, dispose: () => undefined }),
  createTextEditorDecorationType: () => ({ dispose: () => undefined }),
  showTextDocument: async () => undefined,
};

export const StatusBarAlignment = { Left: 1, Right: 2 };

export const ViewColumn = { Active: -1, One: 1, Two: 2 };

export const ProgressLocation = { Notification: 15, Window: 10, SourceControl: 1 };

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class MarkdownString {
  isTrusted = false;
  supportThemeIcons = false;
  constructor(public value = '') {}
}

export class Range {
  constructor(
    readonly startLine: number,
    readonly startCharacter: number,
    readonly endLine: number,
    readonly endCharacter: number,
  ) {}
}

export const commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  executeCommand: async () => undefined,
};

export const env = {
  clipboard: {
    writeText: async (_text: string): Promise<void> => undefined,
    readText: async (): Promise<string> => '',
  },
  openExternal: async (_uri: unknown): Promise<boolean> => true,
};

export const Disposable = {
  from: (..._items: unknown[]) => ({ dispose: () => undefined }),
};

export const workspace = {
  getConfiguration: (_section?: string) => ({ get: <T>(_key: string, fallback: T): T => fallback }),
  openTextDocument: async (options: unknown) => options,
  onDidChangeTextDocument: (_listener: (e: unknown) => void) => ({ dispose: () => undefined }),
  registerTextDocumentContentProvider: (_scheme: string, _provider: unknown) => ({ dispose: () => undefined }),
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => undefined }),
    onDidCreate: () => ({ dispose: () => undefined }),
    onDidDelete: () => ({ dispose: () => undefined }),
    dispose: () => undefined,
  }),
};

export const Uri = {
  from: (parts: object) => parts,
  parse: (value: string) => ({ value }),
  file: (fsPath: string) => ({ fsPath }),
  joinPath: (...parts: unknown[]) => ({ fsPath: parts.map(String).join('/') }),
};

export const QuickPickItemKind = { Separator: -1, Default: 0 };

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];
  readonly event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => undefined };
  };
  fire(e: T): void {
    for (const l of this.listeners) l(e);
  }
  dispose(): void {
    this.listeners = [];
  }
}
