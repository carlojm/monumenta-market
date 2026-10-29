// Filters on the plot list. Each filter is { id, mode, tagIds }; a plot has
// to pass every filter (AND). Inside one filter, "any" is OR, "all" is AND and
// "none" leaves out plots with any of the tags. A filter with no tags chosen
// doesn't filter anything yet.

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

// "Tags: has any of Rental, Stonk Market +2"
export function filterLabel(filter, catalog) {
  if (!isActive(filter)) return 'Tags: choose…';
  const names = filter.tagIds.map((id) => catalog?.tags.find((t) => t.id === id)?.name).filter(Boolean);
  const mode = TAG_MODES.find((m) => m.key === filter.mode).label.toLowerCase();
  const shown = names.slice(0, 2).join(', ');
  return `Tags: ${mode} ${shown}${names.length > 2 ? ` +${names.length - 2}` : ''}`;
}
