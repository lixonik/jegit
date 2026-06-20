// Directory-tree helpers shared by the webview (window.JeGitTree) and unit tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JeGitTree = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Build a nested { dirs: Map, files: [], path } tree from a flat list of files
  // whose `.path` is forward-slash separated.
  function buildTree(files) {
    const root = { dirs: new Map(), files: [], path: '' };
    for (const f of files) {
      const parts = f.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node.dirs.has(seg)) {
          node.dirs.set(seg, { dirs: new Map(), files: [], path: (node.path ? node.path + '/' : '') + seg });
        }
        node = node.dirs.get(seg);
      }
      node.files.push(f);
    }
    return root;
  }

  // Collect every file path under a tree node (depth-first).
  function collectFiles(node, out) {
    for (const f of node.files) out.push(f.path);
    for (const d of node.dirs.values()) collectFiles(d, out);
    return out;
  }

  return { buildTree: buildTree, collectFiles: collectFiles };
});
