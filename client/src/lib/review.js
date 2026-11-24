// Admin → Needs review: the queue (GET /api/revisions/pending), the images
// waiting (GET /api/images/pending) and the tag list, loaded together. Read with React's use(), so it never rejects (that
// would need an error boundary): a failure comes back as { error }.
export function loadReview() {
  const json = (url) => fetch(url).then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))));
  return Promise.all([json('/api/revisions/pending'), json('/api/tags'), json('/api/images/pending')])
    .then(([list, catalog, images]) => ({ list, catalog, images }))
    .catch(() => ({ error: 'Could not load the review queue. Please try again.' }));
}
