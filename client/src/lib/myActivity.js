// Account page: your own edits and comments.
//
// Your edits: one page of your own edits (GET /api/revisions/mine),
// or of the withdrawn ones. Read with React's use(), so it never rejects: a
// failure comes back as { error }.
export function loadMyEdits({ offset = 0, withdrawn = false } = {}) {
  const params = new URLSearchParams({ offset, withdrawn: withdrawn ? 1 : 0 });
  return fetch(`/api/revisions/mine?${params}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
    .catch(() => ({ error: 'Could not load your edits. Please try again.' }));
}

// Your comments (GET /api/auth/me/comments), the same way.
export function loadMyComments() {
  return fetch('/api/auth/me/comments')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
    .catch(() => ({ error: 'Could not load your comments. Please try again.' }));
}
