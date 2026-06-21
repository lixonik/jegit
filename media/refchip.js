// Ref-chip classification shared by the webview (window.JeGitRef) and unit tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JeGitRef = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Classify a git ref label into { kind, text, icon } for the Log chips:
  //   HEAD           -> head   (target icon)
  //   "tag: v1.0"    -> tag    (tag icon, "tag: " stripped)
  //   "origin/main"  -> remote (cloud icon)
  //   "main"         -> local  (git-branch icon)
  function classifyRef(ref) {
    if (ref === 'HEAD') return { kind: 'head', text: 'HEAD', icon: 'target' };
    if (ref.indexOf('tag: ') === 0) return { kind: 'tag', text: ref.slice(5), icon: 'tag' };
    if (ref.indexOf('/') >= 0) return { kind: 'remote', text: ref, icon: 'cloud' };
    return { kind: 'local', text: ref, icon: 'git-branch' };
  }
  return { classifyRef: classifyRef };
});
