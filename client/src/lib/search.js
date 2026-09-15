import Fuse from 'fuse.js';

const FUSE_OPTIONS = {
  keys: ['owner', 'shop_name', 'zone', 'description', 'comment_text'],
  threshold: 0.35,
  ignoreLocation: true,
};

// Returns { matchedKeys: Set, orderedKeys: string[] } | null when there's no query.
// orderedKeys is sorted best-match-first, straight from Fuse's relevance score.
export function getSearchResults(plots, query) {
  if (!query.trim()) return null;
  const fuse = new Fuse(plots, FUSE_OPTIONS);
  const results = fuse.search(query);
  const orderedKeys = results.map((r) => `${r.item.x}_${r.item.z}`);
  return { matchedKeys: new Set(orderedKeys), orderedKeys };
}