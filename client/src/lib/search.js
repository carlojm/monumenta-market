import Fuse from 'fuse.js';

// Weights rank what a shop *sells* above what it's called, and both above where
// it is, so "shifting" finds shops selling Shifting items before the shops in
// the Shifting zone.
const FUSE_OPTIONS = {
  keys: [
    { name: 'tag_terms', weight: 3 },
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
  tag_terms: 'Tag',
};

// Prefer showing a match from stock/description/comments over owner/zone,
// since those are more informative as "why did this match."
const FIELD_PRIORITY = ['tag_terms', 'stock', 'description', 'comment_text', 'palette', 'shop_name', 'guild_name', 'owner', 'id', 'zone'];

function buildSnippet(matches, record) {
  if (!matches || matches.length === 0) return null;

  const sorted = [...matches].sort(
    (a, b) => FIELD_PRIORITY.indexOf(a.key) - FIELD_PRIORITY.indexOf(b.key)
  );
  const match = sorted[0];
  if (!match.indices || match.indices.length === 0) return null;

  // A tag matched: show the tag's name, plus the alias if that's what matched.
  if (match.key === 'tag_terms') {
    const tagName = record.tag_term_names[match.refIndex];
    return {
      field: FIELD_LABELS.tag_terms,
      before: '',
      highlight: tagName,
      after: match.value === tagName ? '' : ` (${match.value})`,
    };
  }

  const [start, end] = match.indices[0];
  return textSnippet(match.key, match.value, start, end + 1);
}

// A few words either side of value[start, end), for the table's Match column.
export function textSnippet(key, value, start, end) {
  const CONTEXT = 40;
  const snippetStart = Math.max(0, start - CONTEXT);
  const snippetEnd = Math.min(value.length, end + CONTEXT);
  return {
    field: FIELD_LABELS[key] || key,
    before: (snippetStart > 0 ? '…' : '') + value.slice(snippetStart, start),
    highlight: value.slice(start, end),
    after: value.slice(end, snippetEnd) + (snippetEnd < value.length ? '…' : ''),
  };
}

// Flattens a plot and its current shop into one searchable record. Tag names
// and aliases are one list (tag_terms); tag_term_names says which tag each
// entry belongs to, so an alias match ("white") can show its tag's name.
function toSearchRecord(plot) {
  const tags = plot.shop?.tags ?? [];
  const terms = tags.flatMap((t) => [t.name, ...t.aliases].map((term) => [term, t.name]));
  // Plot id last: the shop has its own numeric id that must not win.
  return {
    ...(plot.shop || {}),
    tag_terms: terms.map(([term]) => term),
    tag_term_names: terms.map(([, name]) => name),
    id: plot.id,
    zone: plot.zone,
  };
}

// Returns { matchedIds: Set, orderedIds: string[], snippets: Record<plotId, snippet> } | null
// The search index for a list of plots. Building it is the slow part, so
// it's made once per list (App keeps it in a useMemo), not per keystroke.
export const createSearchIndex = (plots) => new Fuse(plots.map(toSearchRecord), FUSE_OPTIONS);

export function getSearchResults(index, query) {
  if (!query.trim()) return null;
  const results = index.search(query);

  const orderedIds = results.map((r) => r.item.id);
  const snippets = {};
  for (const r of results) snippets[r.item.id] = buildSnippet(r.matches, r.item);

  return { matchedIds: new Set(orderedIds), orderedIds, snippets };
}
