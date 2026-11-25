// Admin → Needs review: the queue (GET /api/revisions/pending; new images
// come inside edits) and the tag list, loaded together. Read with React's use(), so it never rejects (that
// would need an error boundary): a failure comes back as { error }.
export function loadReview() {
  const json = (url) => fetch(url).then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))));
  return Promise.all([json('/api/revisions/pending'), json('/api/tags')])
    .then(([list, catalog]) => ({ list, catalog }))
    .catch(() => ({ error: 'Could not load the review queue. Please try again.' }));
}
