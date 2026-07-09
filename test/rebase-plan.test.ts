import { describe, it, expect } from 'vitest';
import { validateRebasePlan, renderRebaseTodo } from '../src/util/rebasePlan';

describe('validateRebasePlan', () => {
  it('accepts a plan starting with a pick', () => {
    expect(
      validateRebasePlan([
        { hash: 'a', action: 'pick' },
        { hash: 'b', action: 'fixup' },
      ]),
    ).toBeUndefined();
  });

  it('rejects a plan that drops everything', () => {
    expect(validateRebasePlan([{ hash: 'a', action: 'drop' }])).toContain('at least one');
  });

  it('rejects a plan whose first kept commit is not a pick', () => {
    expect(
      validateRebasePlan([
        { hash: 'a', action: 'drop' },
        { hash: 'b', action: 'fixup' },
      ]),
    ).toContain('must be "pick"');
  });
});

describe('renderRebaseTodo', () => {
  it('renders one action per line with a trailing newline', () => {
    expect(
      renderRebaseTodo([
        { hash: 'a', action: 'pick' },
        { hash: 'b', action: 'drop' },
      ]),
    ).toBe('pick a\ndrop b\n');
  });
});
