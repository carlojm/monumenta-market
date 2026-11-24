import { useSyncExternalStore } from 'react';

// Data from the server, kept outside React, that components read with
// useResource (React's useSyncExternalStore: its way to follow something
// outside React, no effect needed). It loads when the first component starts
// reading it, so that component shows right away with what's already known
// and fills in when the data arrives, and again on `refresh()`.
//
//   const plots = createResource(() => fetch('/api/plots').then(...), []);
//   const { data, error } = useResource(plots);
//   plots.refresh();            // after a change; returns a promise
//
// `load` may reject; the error's message is kept in `error`.
export function createResource(load, initial = null) {
  let snapshot = { data: initial, error: null };
  const listeners = new Set();
  const update = (next) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };
  const resource = {
    refresh: () => load().then((data) => update({ data, error: null }), (err) => update({ error: err.message || 'Could not load.' })),
    set: (data) => update({ data }),
    // The first reader starts a load (and each first reader after everyone
    // stopped reading, so a page opened again shows fresh data).
    subscribe: (listener) => {
      if (!listeners.size) resource.refresh();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => snapshot,
  };
  return resource;
}

export const useResource = (resource) => useSyncExternalStore(resource.subscribe, resource.get);

const json = (url) => fetch(url).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Could not load ${url}`))));

// Shared by the map, the list, the card's edit form and the admin pages.
export const plotsResource = createResource(() => json('/api/plots'), []);
export const tagsResource = createResource(() => json('/api/tags'));

// One per plot, for its card: kept after the card closes, so opening it again
// shows the last details at once while fresh ones load.
const details = new Map();
export function plotDetailResource(plotId) {
  if (!details.has(plotId)) details.set(plotId, createResource(() => json(`/api/plots/${plotId}`)));
  return details.get(plotId);
}
