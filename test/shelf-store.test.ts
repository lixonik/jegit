import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ShelfStore } from '../src/model/shelfStore';

function fakeMemento(seed?: unknown) {
  const store = new Map<string, unknown>();
  if (seed) store.set('jegit.shelf.v1', seed);
  return {
    get: (k: string) => store.get(k),
    update: async (k: string, v: unknown) => {
      store.set(k, v);
    },
    keys: () => [...store.keys()],
  } as never;
}

describe('ShelfStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jegit-shelf-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes the patch file and records metadata on add', async () => {
    const s = new ShelfStore(fakeMemento(), dir);
    const e = await s.add('WIP', ['a.ts', 'b.ts'], 'PATCH BODY');
    expect(fs.readFileSync(s.patchPath(e.id), 'utf8')).toBe('PATCH BODY');
    expect(s.get(e.id)).toMatchObject({ name: 'WIP', files: ['a.ts', 'b.ts'] });
  });

  it('lists entries newest first', () => {
    const seed = {
      entries: [
        { id: 'a', name: 'old', date: '2026-01-01T00:00:00.000Z', files: [] },
        { id: 'b', name: 'new', date: '2026-06-01T00:00:00.000Z', files: [] },
      ],
    };
    const s = new ShelfStore(fakeMemento(seed), dir);
    expect(s.list().map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('renames an entry', async () => {
    const s = new ShelfStore(fakeMemento(), dir);
    const e = await s.add('one', [], 'p');
    await s.rename(e.id, 'two');
    expect(s.get(e.id)?.name).toBe('two');
  });

  it('deletes the patch file and the metadata on remove', async () => {
    const s = new ShelfStore(fakeMemento(), dir);
    const e = await s.add('x', [], 'p');
    const p = s.patchPath(e.id);
    expect(fs.existsSync(p)).toBe(true);
    await s.remove(e.id);
    expect(fs.existsSync(p)).toBe(false);
    expect(s.get(e.id)).toBeUndefined();
  });

  it('persists entries across instances via the memento', async () => {
    const mem = fakeMemento();
    const e = await new ShelfStore(mem, dir).add('persisted', [], 'p');
    const reloaded = new ShelfStore(mem, dir);
    expect(reloaded.get(e.id)?.name).toBe('persisted');
  });

  it('returns undefined for an unknown id', () => {
    const s = new ShelfStore(fakeMemento(), dir);
    expect(s.get('nope')).toBeUndefined();
  });
});
