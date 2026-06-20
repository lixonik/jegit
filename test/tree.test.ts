import { describe, it, expect } from 'vitest';
import tree from '../media/tree.js';

const { buildTree, collectFiles } = tree;
const f = (path: string) => ({ path });

describe('buildTree', () => {
  it('nests files under their directory segments', () => {
    const root = buildTree([f('src/app/main.ts'), f('src/app/util.ts'), f('README.md')]);
    expect(root.files.map((x: { path: string }) => x.path)).toEqual(['README.md']);
    const src = root.dirs.get('src');
    expect(src.path).toBe('src');
    const app = src.dirs.get('app');
    expect(app.path).toBe('src/app');
    expect(app.files.map((x: { path: string }) => x.path)).toEqual(['src/app/main.ts', 'src/app/util.ts']);
  });

  it('reuses an existing directory node for sibling files', () => {
    const root = buildTree([f('a/b/x.ts'), f('a/b/y.ts'), f('a/c/z.ts')]);
    const a = root.dirs.get('a');
    expect([...a.dirs.keys()].sort()).toEqual(['b', 'c']);
    expect(a.dirs.get('b').files).toHaveLength(2);
  });

  it('builds an empty root for no files', () => {
    const root = buildTree([]);
    expect(root.files).toHaveLength(0);
    expect(root.dirs.size).toBe(0);
  });
});

describe('collectFiles', () => {
  it('collects every file path depth-first', () => {
    const root = buildTree([f('src/a.ts'), f('src/sub/b.ts'), f('top.txt')]);
    expect(collectFiles(root, []).sort()).toEqual(['src/a.ts', 'src/sub/b.ts', 'top.txt']);
  });
});
