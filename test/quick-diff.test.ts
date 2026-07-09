import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerContentProviders, HEAD_SCHEME, REV_SCHEME } from '../src/ui/quickDiff';
import type { Git } from '../src/git/git';

type Provider = { provideTextDocumentContent: (uri: { query: string; path: string }) => unknown };

describe('registerContentProviders', () => {
  it('serves HEAD and revision blobs from the right git calls', async () => {
    const providers = new Map<string, Provider>();
    (vscode.workspace as unknown as Record<string, unknown>).registerTextDocumentContentProvider = (
      scheme: string,
      provider: Provider,
    ) => {
      providers.set(scheme, provider);
      return { dispose: () => undefined };
    };
    const git = {
      showHead: vi.fn(async () => 'head content'),
      showRev: vi.fn(async () => 'rev content'),
    } as unknown as Git;

    registerContentProviders(git);

    await providers.get(HEAD_SCHEME)!.provideTextDocumentContent({ query: 'src/a.ts', path: '' });
    expect(git.showHead).toHaveBeenCalledWith('src/a.ts');

    await providers.get(REV_SCHEME)!.provideTextDocumentContent({ query: 'abc123', path: '/src/a.ts' });
    expect(git.showRev).toHaveBeenCalledWith('abc123', 'src/a.ts');
  });
});
