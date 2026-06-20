import { describe, it, expect } from 'vitest';
import { isConflicted } from '../src/util/status';

describe('isConflicted', () => {
  it('treats any unmerged side and both-added/both-deleted as a conflict', () => {
    for (const status of ['UU', 'AU', 'UD', 'DU', 'UA', 'AA', 'DD']) {
      expect(isConflicted(status)).toBe(true);
    }
  });

  it('does not treat ordinary statuses as conflicts', () => {
    for (const status of [' M', 'M ', 'MM', 'A ', ' D', 'D ', 'R ', 'C ', '??', '']) {
      expect(isConflicted(status)).toBe(false);
    }
  });
});
