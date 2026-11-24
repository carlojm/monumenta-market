import { useCallback } from 'react';

// Closes a menu or popup on a click outside `ref` (its wrapper, which also
// holds the button that opens it), or on Escape. Returns a ref callback for
// the popup itself, so the listeners exist only while it's on the page.
export function useDismiss(ref, onClose) {
  return useCallback((popup) => {
    if (!popup) return undefined;
    const onClick = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onClose]);
}
