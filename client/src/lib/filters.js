// Filters on the plot list. Each filter is { id, mode, tagIds }; a plot has
// to pass every filter (AND). Inside one filter, "any" is OR, "all" is AND and
// "none" leaves out plots with any of the tags. A filter with no tags chosen
// doesn't filter anything yet.

import { textSnippet } from './search';
import { findTerm } from './tagSuggestions';

export const TAG_MODES = [
  { key: 'any', label: 'Has any of' },
  { key: 'all', label: 'Has all of' },
  { key: 'none', label: 'Has none of' },
];

let nextId = 1;
export const newTagFilter = () => ({ id: nextId++, mode: 'any', tagIds: [] });

export const isActive = (filter) => filter.tagIds.length > 0;

function passes(plot, filter) {
  if (!isActive(filter)) return true;
  const has = new Set((plot.shop?.tags ?? []).map((t) => t.id));
  if (filter.mode === 'all') return filter.tagIds.every((id) => has.has(id));
  const any = filter.tagIds.some((id) => has.has(id));
  return filter.mode === 'none' ? !any : any;
}

export function filterPlots(plots, filters) {
  if (!filters.some(isActive)) return plots;
  return plots.filter((plot) => filters.every((f) => passes(plot, f)));
}

// Fields checked for a matched tag's words, in order.
const CONTEXT_FIELDS = ['stock', 'description', 'comment_text'];

// The first place one of `tags` shows up in the shop's text, as a snippet.
function tagContext(shop, tags) {
  for (const key of CONTEXT_FIELDS) {
    const hits = tags.map((t) => findTerm(shop[key], t)).filter(Boolean);
    if (!hits.length) continue;
    const first = hits.reduce((a, b) => (b.start < a.start ? b : a));
    return textSnippet(key, shop[key], first.start, first.end);
  }
  return null;
}

// For the table's Match column: plot id -> { names, context }, the shop's tags
// that an "any" or "all" filter asked for, and where they show up in its text
// (or null). null when no such filter is on ("none" filters have nothing to show).
export function filterMatches(plots, filters) {
  const wanted = new Set(filters.filter((f) => isActive(f) && f.mode !== 'none').flatMap((f) => f.tagIds));
  if (wanted.size === 0) return null;
  return Object.fromEntries(plots.map((p) => {
    const tags = (p.shop?.tags ?? []).filter((t) => wanted.has(t.id));
    return [p.id, { names: tags.map((t) => t.name), context: tags.length ? tagContext(p.shop, tags) : null }];
  }));
}

// "Tags: has any of Rental, Stonk Market +2"
export function filterLabel(filter, catalog) {
  if (!isActive(filter)) return 'Tags: choose…';
  const names = filter.tagIds.map((id) => catalog?.tags.find((t) => t.id === id)?.name).filter(Boolean);
  const mode = TAG_MODES.find((m) => m.key === filter.mode).label.toLowerCase();
  const shown = names.slice(0, 2).join(', ');
  return `Tags: ${mode} ${shown}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
}
