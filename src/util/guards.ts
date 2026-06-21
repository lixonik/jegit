// Small, explicit value guards. Prefer these over implicit truthiness checks in
// conditionals (e.g. `if (isDefined(x))` instead of `if (x)`), so the intent --
// "not nil" vs "not empty" vs "non-zero" -- is never ambiguous.

import { Nil, Nullable, SizedItem } from '../model/common';

/** True when the value is null or undefined. */
export function isNil<T>(value: Nullable<T>): value is Nil {
  return value === null || value === undefined;
}

/** True when the value is neither null nor undefined. */
export function isDefined<T>(value: T): value is NonNullable<T> {
  return !isNil(value);
}

/** True when a string, array, Map, Set or plain object has no elements/keys. Nil counts as empty. */
export function isEmpty(value: Nullable<SizedItem>): boolean {
  if (isNil(value)) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }
  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }
  return Object.keys(value).length === 0;
}

/** True when a string, array, Map, Set or plain object has at least one element/key. */
export function notEmpty(value: Nullable<SizedItem>): boolean {
  return !isEmpty(value);
}
