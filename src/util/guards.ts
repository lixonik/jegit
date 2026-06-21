// Small, explicit value guards. Prefer these over implicit truthiness checks in
// conditionals (e.g. `if (isDefined(x))` instead of `if (x)`), so the intent --
// "not nil" vs "not empty" vs "non-zero" -- is never ambiguous.

/** A value that has a meaningful notion of emptiness. */
type Sized = string | readonly unknown[] | Map<unknown, unknown> | Set<unknown>;

/** True when the value is null or undefined. */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** True when the value is neither null nor undefined. */
export function isDefined<T>(value: T): value is NonNullable<T> {
  return !isNil(value);
}

/** True when a string, array, Map or Set has no elements. Nil counts as empty. */
export function isEmpty(value: Sized | null | undefined): boolean {
  if (isNil(value)) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }
  return (value as Map<unknown, unknown> | Set<unknown>).size === 0;
}

/** True when a string, array, Map or Set has at least one element. */
export function notEmpty(value: Sized | null | undefined): boolean {
  return !isEmpty(value);
}
