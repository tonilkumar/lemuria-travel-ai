import { useEffect, useState } from 'react';

/**
 * Delays a rapidly-changing value so a search box issues one request per pause
 * in typing rather than one per keystroke (spec §38).
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
