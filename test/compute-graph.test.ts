import { describe, it, expect } from 'vitest';
import graph from '../media/graph.js';

const { computeGraph } = graph;
const c = (hash: string, parents: string[]) => ({ hash, parents });

describe('computeGraph', () => {
  it('lays a linear history in a single lane', () => {
    const { rows, maxLanes } = computeGraph([c('a', ['b']), c('b', ['c']), c('c', [])]);
    expect(maxLanes).toBe(1);
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0]);
    expect(rows[rows.length - 1].lanesOut).toEqual([]);
  });

  it('opens a second lane for a branch and closes it on merge', () => {
    // m merges a and b; a and b share parent root.
    const { rows, maxLanes } = computeGraph([
      c('m', ['a', 'b']),
      c('a', ['root']),
      c('b', ['root']),
      c('root', []),
    ]);
    expect(maxLanes).toBeGreaterThanOrEqual(2);
    expect(rows[0].hash).toBe('m');
    expect(rows[0].parents).toEqual(['a', 'b']);
    // the merge row carries two outgoing lanes (one per parent)
    expect(rows[0].lanesOut.filter(Boolean).sort()).toEqual(['a', 'b']);
    // by the root row everything has collapsed back
    expect(rows[3].lanesOut).toEqual([]);
  });

  it('places each commit on its own row in commit order', () => {
    const { rows } = computeGraph([c('a', ['b']), c('b', [])]);
    expect(rows.map((r) => r.hash)).toEqual(['a', 'b']);
  });

  it('handles an empty history', () => {
    expect(computeGraph([])).toEqual({ rows: [], maxLanes: 1 });
  });
});
