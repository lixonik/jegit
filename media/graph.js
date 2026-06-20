// Commit-graph lane layout, shared by the webview (loaded as a plain script,
// exposed as window.JeGitGraph) and the unit tests (imported as a module).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JeGitGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Assign each commit to a lane and track which lanes carry which commit in/out,
  // returning the per-row layout plus the widest lane count seen.
  function computeGraph(commits) {
    const rows = [];
    let lanes = [];
    let widest = 1;
    for (const c of commits) {
      const lanesIn = lanes.slice();
      let nodeLane = lanes.indexOf(c.hash);
      if (nodeLane === -1) {
        nodeLane = lanes.indexOf(null);
        if (nodeLane === -1) {
          nodeLane = lanes.length;
          lanes.push(null);
        }
      }
      while (lanesIn.length <= nodeLane) lanesIn.push(null);
      for (let i = 0; i < lanes.length; i++) {
        if (i !== nodeLane && lanes[i] === c.hash) lanes[i] = null;
      }
      if (c.parents.length === 0) {
        lanes[nodeLane] = null;
      } else {
        lanes[nodeLane] = c.parents[0];
        for (let k = 1; k < c.parents.length; k++) {
          let pl = lanes.indexOf(c.parents[k]);
          if (pl === -1) {
            pl = lanes.indexOf(null);
            if (pl === -1) {
              pl = lanes.length;
              lanes.push(null);
            }
            lanes[pl] = c.parents[k];
          }
        }
      }
      while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
      const lanesOut = lanes.slice();
      widest = Math.max(widest, lanesIn.length, lanesOut.length, nodeLane + 1);
      rows.push({ lane: nodeLane, lanesIn, lanesOut, parents: c.parents, hash: c.hash });
    }
    return { rows: rows, maxLanes: widest };
  }
  return { computeGraph: computeGraph };
});
