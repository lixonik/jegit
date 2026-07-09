import { describe, it, expect } from 'vitest';
import { lintCommitMessage } from '../src/util/commitMessage';

describe('lintCommitMessage', () => {
  it('accepts a short subject', () => {
    expect(lintCommitMessage('Fix the log filter')).toEqual([]);
  });

  it('accepts a subject with a body separated by a blank line', () => {
    expect(lintCommitMessage('Fix the log filter\n\nThe filter dropped remote refs.')).toEqual([]);
  });

  it('flags a subject over 72 characters', () => {
    const subject = 'x'.repeat(73);
    const issues = lintCommitMessage(subject);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('73');
  });

  it('flags a body that starts right under the subject', () => {
    const issues = lintCommitMessage('Fix the log filter\nThe filter dropped remote refs.');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('blank line');
  });

  it('reports both issues at once', () => {
    const issues = lintCommitMessage('x'.repeat(80) + '\nbody');
    expect(issues).toHaveLength(2);
  });

  it('ignores trailing whitespace on the subject', () => {
    expect(lintCommitMessage('Fix the log filter   ')).toEqual([]);
  });
});
