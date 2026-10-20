import { useEffect, useState } from 'react';

// Desktop breakpoint. Keep in sync with the `min-width: 900px` media queries in the CSS.
export const DESKTOP_QUERY = '(min-width: 900px)';

// True while the media query matches, updating when the window is resized.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
