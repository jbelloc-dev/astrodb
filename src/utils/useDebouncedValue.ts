import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates `delay` ms after the
 * last change. Used for the catalog search inputs: with a few thousand FITS
 * frames loaded, filtering on every keystroke via the parent's controlled
 * state made typing feel laggy, since each keystroke re-ran the full
 * filter+sort pass over `images`.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
