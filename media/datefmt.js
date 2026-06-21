// Relative-date formatting for the Log, shared by the webview (window.JeGitDate)
// and unit tests. Mirrors the "relative dates" view JetBrains shows in its Log.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JeGitDate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function plural(n, unit) {
    return n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
  }
  // A compact "N minutes/hours/days ago" label; falls back to an ISO YYYY-MM-DD
  // date for anything 30+ days old, in the future, empty, or unparseable.
  // opts.now overrides Date.now (for tests).
  function relativeDate(iso, now) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const ref = now != null ? now : Date.now();
    const s = Math.floor((ref - t) / 1000);
    if (s < 0) return iso.slice(0, 10);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return plural(m, 'minute');
    const h = Math.floor(m / 60);
    if (h < 24) return plural(h, 'hour');
    const d = Math.floor(h / 24);
    if (d < 30) return plural(d, 'day');
    return iso.slice(0, 10);
  }
  return { relativeDate: relativeDate };
});
