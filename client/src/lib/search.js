import Fuse from 'fuse.js';

// Weights rank what a shop *sells* above what it's called, and both above where
// it is, so "shifting" finds shops selling Shifting items before the shops in
// the Shifting zone.
const FUSE_OPTIONS = {
  keys: [
    { name: 'stock', weight: 3 },
    { name: 'description', weight: 3 },
    { name: 'comment_text', weight: 2 },
    { name: 'shop_name', weight: 1.5 },
    { name: 'guild_name', weight: 1.5 },
    { name: 'owner', weight: 1.5 },
    { name: 'palette', weight: 1 },
    { name: 'id', weight: 0.5 },
    { name: 'zone', weight: 0.3 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  // By default Fuse favors matches in short fields, which made a 1-word zone
  // name outrank the same word in a long description.
  ignoreFieldNorm: true,
  includeMatches: true,
};

const FIELD_LABELS = {
  owner: 'Owner',
  shop_name: 'Shop name',
  guild_name: 'Guild',
  zone: 'Zone',
  id: 'Plot',
  description: 'Description',
  stock: 'Stock',
  palette: 'Palette',
  comment_text: 'Comments',
};

// Prefer showing a match from stock/description/comments over owner/zone,
// since those are more informative as "why did this match."
const FIELD_PRIORITY = ['stock', 'description', 'comment_text', 'palette', 'shop_name', 'guild_name', 'owner', 'id', 'zone'];

function buildSnippet(matches) {
  if (!matches || matches.length === 0) return null;

  const sorted = [...matches].sort(
    (a, b) => FIELD_PRIORITY.indexOf(a.key) - FIELD_PRIORITY.indexOf(b.key)
  );
  const match = sorted[0];
  if (!match.indices || match.indices.length === 0) return null;

  const [start, end] = match.indices[0];
  const value = match.value;
  const CONTEXT = 40;
  const snippetStart = Math.max(0, start - CONTEXT);
  const snippetEnd = Math.min(value.length, end + 1 + CONTEXT);

  return {
    field: FIELD_LABELS[match.key] || match.key,
    before: (snippetStart > 0 ? '…' : '') + value.slice(snippetStart, start),
    highlight: value.slice(start, end + 1),
    after: value.slice(end + 1, snippetEnd) + (snippetEnd < value.length ? '…' : ''),
  };
}

// Flattens a plot and its current shop into one searchable record.
function toSearchRecord(plot) {
  // Plot id last: the shop has its own numeric id that must not win.
  return { ...(plot.shop || {}), id: plot.id, zone: plot.zone };
}

// Returns { matchedIds: Set, orderedIds: string[], snippets: Record<plotId, snippet> } | null
export function getSearchResults(plots, query) {
  if (!query.trim()) return null;
  const fuse = new Fuse(plots.map(toSearchRecord), FUSE_OPTIONS);
  const results = fuse.search(query);

  const orderedIds = results.map((r) => r.item.id);
  const snippets = {};
  for (const r of results) snippets[r.item.id] = buildSnippet(r.matches);

  return { matchedIds: new Set(orderedIds), orderedIds, snippets };
}
