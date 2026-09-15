import Fuse from 'fuse.js';

const FUSE_OPTIONS = {
  keys: ['owner', 'shop_name', 'zone', 'description', 'comment_text'],
  threshold: 0.35,
  ignoreLocation: true,
  includeMatches: true,
};

const FIELD_LABELS = {
  owner: 'Owner',
  shop_name: 'Shop name',
  zone: 'Zone',
  description: 'Description',
  comment_text: 'Comments',
};

// Prefer showing a match from description/comments over owner/zone,
// since those are more informative as "why did this match."
const FIELD_PRIORITY = ['description', 'comment_text', 'shop_name', 'owner', 'zone'];

function buildSnippet(matches) {
  if (!matches || matches.length === 0) return null;

  const sorted = [...matches].sort(
    (a, b) => FIELD_PRIORITY.indexOf(a.key) - FIELD_PRIORITY.indexOf(b.key)
  );
  const match = sorted[0];
  if (!match.indices || match.indices.length === 0) return null;

  const [start, end] = match.indices[0];
  const value = match.value;
  const CONTEXT = 25;
  const snippetStart = Math.max(0, start - CONTEXT);
  const snippetEnd = Math.min(value.length, end + 1 + CONTEXT);

  return {
    field: FIELD_LABELS[match.key] || match.key,
    before: (snippetStart > 0 ? '…' : '') + value.slice(snippetStart, start),
    highlight: value.slice(start, end + 1),
    after: value.slice(end + 1, snippetEnd) + (snippetEnd < value.length ? '…' : ''),
  };
}

// Returns { matchedKeys: Set, orderedKeys: string[], snippets: Record<key, snippet> } | null
export function getSearchResults(plots, query) {
  if (!query.trim()) return null;
  const fuse = new Fuse(plots, FUSE_OPTIONS);
  const results = fuse.search(query);

  const orderedKeys = results.map((r) => `${r.item.x}_${r.item.z}`);
  const matchedKeys = new Set(orderedKeys);
  const snippets = {};

  for (const r of results) {
    const key = `${r.item.x}_${r.item.z}`;
    snippets[key] = buildSnippet(r.matches);
  }

  return { matchedKeys, orderedKeys, snippets };
}