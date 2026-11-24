import { useCallback, useSyncExternalStore } from 'react';

// Desktop breakpoint. Keep in sync with the `min-width: 900px` media queries in the CSS.
export const DESKTOP_QUERY = '(min-width: 900px)';

// True while the media query matches, updating when the window is resized.
// useSyncExternalStore is React's way to follow something outside React.
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
