import { useSyncExternalStore } from 'react';

// Starred shops (4.7), kept in this browser (localStorage), by plot id. Read
// with useFavorites (useSyncExternalStore, so a star in another tab shows up
// here too). Storage can be missing or blocked (a private window, cleared
// site data): then stars still work until the page is closed.

const KEY = 'starred-plots';
const listeners = new Set();

function load() {
  try {
    const ids = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

// One Set per change, so React can tell when it changed.
let starred = load();
const changed = () => listeners.forEach((listener) => listener());

function subscribe(listener) {
  listeners.add(listener);
  // Another tab changed them.
  const onStorage = (e) => {
    if (e.key !== KEY) return;
    starred = load();
    changed();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export const useFavorites = () => useSyncExternalStore(subscribe, () => starred);

export function toggleFavorite(plotId) {
  const next = new Set(starred);
  if (next.has(plotId)) next.delete(plotId);
  else next.add(plotId);
  starred = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Not saved: it lasts until the page is closed.
  }
  changed();
}
