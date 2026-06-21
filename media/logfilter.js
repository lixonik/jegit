// Log-filter predicate shared by the webview (window.JeGitLog) and unit tests.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JeGitLog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // True when a commit passes the active Log filters.
  //   opts.user  -- exact author match (empty = any)
  //   opts.days  -- only commits newer than now - days (0 = any); opts.now overrides Date.now
  //   opts.text  -- case-insensitive substring of "subject author hash" (empty = any)
  function commitMatches(c, opts) {
    opts = opts || {};
    if (opts.user && c.author !== opts.user) return false;
    const days = opts.days || 0;
    if (days) {
      const now = opts.now != null ? opts.now : Date.now();
      if (new Date(c.date).getTime() < now - days * 86400000) return false;
    }
    const text = (opts.text || '').trim().toLowerCase();
    if (text) {
      const hay = (c.subject + ' ' + c.author + ' ' + c.hash).toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  }
  // Distinct commit authors, locale-sorted -- the options for the User filter.
  function uniqueAuthors(commits) {
    return [...new Set(commits.map(function (c) { return c.author; }))].sort(function (a, b) {
      return a.localeCompare(b);
    });
  }
  return { commitMatches: commitMatches, uniqueAuthors: uniqueAuthors };
});
