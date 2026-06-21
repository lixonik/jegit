import { describe, it, expect } from 'vitest';
import { isNil, isDefined, isEmpty, notEmpty } from '../src/util/guards';

describe('isNil / isDefined', () => {
  it('treats only null and undefined as nil', () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    expect(isNil(0)).toBe(false);
    expect(isNil('')).toBe(false);
    expect(isNil(false)).toBe(false);
    expect(isNil([])).toBe(false);
  });

  it('isDefined is the negation of isNil', () => {
    for (const v of [null, undefined, 0, '', false, [], {}]) {
      expect(isDefined(v)).toBe(!isNil(v));
    }
  });
});

describe('isEmpty / notEmpty', () => {
  it('reports emptiness of strings', () => {
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('x')).toBe(false);
  });

  it('reports emptiness of arrays', () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([0])).toBe(false);
  });

  it('reports emptiness of Maps and Sets', () => {
    expect(isEmpty(new Map())).toBe(true);
    expect(isEmpty(new Set([1]))).toBe(false);
    expect(isEmpty(new Map([['a', 1]]))).toBe(false);
  });

  it('counts nil as empty', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
  });

  it('notEmpty is the negation of isEmpty', () => {
    expect(notEmpty('x')).toBe(true);
    expect(notEmpty('')).toBe(false);
    expect(notEmpty([1])).toBe(true);
    expect(notEmpty(null)).toBe(false);
  });
});
