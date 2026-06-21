import { describe, it, expect } from 'vitest';
import { groupChangesIntoLists } from '../src/model/repository';
import { ChangelistStore } from '../src/model/changelistStore';
import type { FileChange } from '../src/git/git';

function fakeMemento() {
  const store = new Map<string, unknown>();
  return {
    get: (k: string) => store.get(k),
    update: async (k: string, v: unknown) => {
      store.set(k, v);
    },
    keys: () => [...store.keys()],
  } as never;
}

const change = (path: string, status = ' M'): FileChange => ({ path, status, staged: false, untracked: false });

describe('groupChangesIntoLists', () => {
  it('puts unassigned changes in the active list, sorted by path', () => {
    const store = new ChangelistStore(fakeMemento());
    const lists = groupChangesIntoLists([change('src/b.ts'), change('src/a.ts')], store, '/repo');
    expect(lists).toHaveLength(1);
    expect(lists[0].active).toBe(true);
    expect(lists[0].files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('routes assigned changes to their changelist and leaves others active', async () => {
    const store = new ChangelistStore(fakeMemento());
    const feature = await store.create('Feature');
    await store.assign(['src/feat.ts'], feature.id);
    const lists = groupChangesIntoLists([change('src/feat.ts'), change('README.md')], store, '/repo');
    const byName = Object.fromEntries(lists.map((l) => [l.name, l.files.map((f) => f.path)]));
    expect(byName['Feature']).toEqual(['src/feat.ts']);
    expect(byName['Changes']).toEqual(['README.md']);
  });

  it('emits an empty file list for a changelist with no changes', async () => {
    const store = new ChangelistStore(fakeMemento());
    await store.create('Empty');
    const lists = groupChangesIntoLists([change('a.ts')], store, '/repo');
    expect(lists.find((l) => l.name === 'Empty')!.files).toEqual([]);
  });

  it('marks conflicted and renamed changes via toItem in the grouped output', () => {
    const store = new ChangelistStore(fakeMemento());
    const lists = groupChangesIntoLists([change('c.ts', 'UU')], store, '/repo');
    expect(lists[0].files[0]).toMatchObject({ path: 'c.ts', conflicted: true, letter: 'U' });
  });
});
