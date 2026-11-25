// Filters on the plot list. A plot has to pass every filter (AND). Kinds:
//   { type: 'tags', mode, tagIds }  "any" is OR, "all" is AND, "none" leaves out
//                                   plots with any of the tags
//   { type: 'status', values }      map status (the legend's colors), any of
//   { type: 'zone', values }        zone names, any of
//   { type: 'occupied' }            hides vacant plots (no shop)
//   { type: 'starred' }             only the shops starred in this browser
// A filter with nothing chosen yet doesn't filter anything.

import { MAP_CATEGORIES, mapCategory } from './plots';
import { textSnippet } from './search';
import { findTerm } from './tagSuggestions';

export const FILTER_TYPES = [
  { type: 'tags', label: 'Tags' },
  { type: 'status', label: 'Status' },
  { type: 'zone', label: 'Zone' },
];

export const TAG_MODES = [
  { key: 'any', label: 'Has any of' },
  { key: 'all', label: 'Has all of' },
  { key: 'none', label: 'Has none of' },
];

// The legend's grey also covers WIP, unclear and never-reported shops.
export const STATUS_OPTIONS = MAP_CATEGORIES.map((c) => ({
  ...c,
  label: c.key === 'quiet' ? 'Vacant, WIP or unclear' : c.label,
}));

let nextId = 1;
export function newFilter(type) {
  const id = nextId++;
  if (type === 'tags') return { id, type, mode: 'any', tagIds: [] };
  if (!hasChoices(type)) return { id, type };
  return { id, type, values: [] };
}

// "Hide vacant" and "Only starred" are on as soon as they're added.
export const hasChoices = (type) => type !== 'occupied' && type !== 'starred';

export function isActive(filter) {
  if (filter.type === 'tags') return filter.tagIds.length > 0;
  if (!hasChoices(filter.type)) return true;
  return filter.values.length > 0;
}

function passes(plot, filter, starred) {
  if (!isActive(filter)) return true;
  switch (filter.type) {
    case 'status': return filter.values.includes(mapCategory(plot));
    case 'zone': return filter.values.includes(plot.zone);
    case 'occupied': return !!plot.shop;
    case 'starred': return starred.has(plot.id);
    default: {
      const has = new Set((plot.shop?.tags ?? []).map((t) => t.id));
      if (filter.mode === 'all') return filter.tagIds.every((id) => has.has(id));
      const any = filter.tagIds.some((id) => has.has(id));
      return filter.mode === 'none' ? !any : any;
    }
  }
}

// `starred`: the starred plot ids (lib/favorites.js), for "Only starred".
export function filterPlots(plots, filters, starred = new Set()) {
  if (!filters.some(isActive)) return plots;
  return plots.filter((plot) => filters.every((f) => passes(plot, f, starred)));
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
// that an "any" or "all" tag filter asked for, and where they show up in its
// text (or null). null when no such filter is on ("none" filters have nothing
// to show).
export function filterMatches(plots, filters) {
  const wanted = new Set(filters
    .filter((f) => f.type === 'tags' && isActive(f) && f.mode !== 'none')
    .flatMap((f) => f.tagIds));
  if (wanted.size === 0) return null;
  return Object.fromEntries(plots.map((p) => {
    const tags = (p.shop?.tags ?? []).filter((t) => wanted.has(t.id));
    return [p.id, { names: tags.map((t) => t.name), context: tags.length ? tagContext(p.shop, tags) : null }];
  }));
}

const listNames = (names) => names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');

// "Tags: has any of Rental, Stonk Market +2", "Status: Active, Locked", "Zone: White"
export function filterLabel(filter, catalog) {
  const { label } = FILTER_TYPES.find((t) => t.type === filter.type) ?? {};
  if (filter.type === 'occupied') return 'Vacant plots hidden';
  if (filter.type === 'starred') return 'Only starred shops';
  if (!isActive(filter)) return `${label}: choose…`;
  if (filter.type === 'status') {
    return `Status: ${listNames(filter.values.map((v) => STATUS_OPTIONS.find((o) => o.key === v).label))}`;
  }
  if (filter.type === 'zone') return `Zone: ${listNames(filter.values)}`;
  const names = filter.tagIds.map((id) => catalog?.tags.find((t) => t.id === id)?.name).filter(Boolean);
  const mode = TAG_MODES.find((m) => m.key === filter.mode).label.toLowerCase();
  return `Tags: ${mode} ${listNames(names)}`;
}
