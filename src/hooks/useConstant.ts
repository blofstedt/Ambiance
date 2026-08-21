/**
 * @file Lazily-constructed, render-stable instance. Use instead of useRef(new X()).
 */
import { useRef } from 'react';

/**
 * Holds one instance for the life of the component, constructing it lazily.
 *
 * `useRef(new Thing())` is the tempting shorthand and it is wrong: useRef takes
 * a value, not a factory, so the expression is evaluated on every render and
 * every result but the first is built and thrown away. This app re-renders once
 * a second, for weeks, so the pattern quietly allocates for the whole session.
 *
 * The extra wrapper object is what lets a legitimately `undefined` or `null`
 * instance be cached rather than reconstructed forever.
 */
export function useConstant<T>(create: () => T): T {
  const ref = useRef<{ value: T } | null>(null);
  ref.current ??= { value: create() };
  return ref.current.value;
}
