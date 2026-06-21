// Cross-cutting foundational types used across the codebase.

/** The two "absence" values. */
export type Nil = null | undefined;

/** A value of type T that may also be absent. */
export type Nullable<T> = T | Nil;

/** A value that has a meaningful notion of emptiness. */
export type SizedItem = string | readonly unknown[] | Map<unknown, unknown> | Set<unknown> | object;
