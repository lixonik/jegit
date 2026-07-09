// Minimal stand-in for the `vscode` module used by unit tests.
// Tests overwrite the window methods to script user answers.
export const window: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  showInputBox: async () => undefined,
  showQuickPick: async () => undefined,
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
};

export const commands: Record<string, (...args: unknown[]) => Promise<unknown>> = {
  executeCommand: async () => undefined,
};

export const env = {
  clipboard: { writeText: async (_text: string): Promise<void> => undefined },
  openExternal: async (_uri: unknown): Promise<boolean> => true,
};

export const workspace = {
  getConfiguration: (_section?: string) => ({ get: <T>(_key: string, fallback: T): T => fallback }),
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
