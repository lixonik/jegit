import { describe, it, expect } from 'vitest';
import refchip from '../media/refchip.js';

const { classifyRef } = refchip;

describe('classifyRef', () => {
  it('classifies HEAD with a target icon', () => {
    expect(classifyRef('HEAD')).toEqual({ kind: 'head', text: 'HEAD', icon: 'target' });
  });

  it('strips the "tag: " prefix and marks tags', () => {
    expect(classifyRef('tag: v1.2.0')).toEqual({ kind: 'tag', text: 'v1.2.0', icon: 'tag' });
  });

  it('treats slashed refs as remote branches', () => {
    expect(classifyRef('origin/main')).toEqual({ kind: 'remote', text: 'origin/main', icon: 'cloud' });
  });

  it('treats a bare name as a local branch', () => {
    expect(classifyRef('main')).toEqual({ kind: 'local', text: 'main', icon: 'git-branch' });
  });

  it('prefers the tag rule over the slash rule for slashed tag names', () => {
    expect(classifyRef('tag: release/2026')).toEqual({ kind: 'tag', text: 'release/2026', icon: 'tag' });
  });
});
