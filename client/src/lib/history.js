// A plot's history, one page at a time (GET /api/plots/:id/history). Read
// with React's use(), so it never rejects: a failure comes back as { error }.
export function loadHistory(plotId, offset = 0) {
  return fetch(`/api/plots/${plotId}/history?offset=${offset}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
    .catch(() => ({ error: 'Could not load the history. Please try again.' }));
}
