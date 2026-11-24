// Sorting the plot list. With no sort picked, it's newest status update first,
// or best match while searching. While searching, matches always come before
// the (dimmed) non-matches; the sort orders each part. Starred shops (4.7)
// come first within the list, or within the matches.

import { displayName } from './plots';
import { parseUtc } from './reports';

export const SORTS = [
  { key: 'best', label: 'Best match', searchOnly: true },
  { key: 'updated', label: 'Last status update', directions: ['Newest first', 'Oldest first'] },
  { key: 'edited', label: 'Last page edit', directions: ['Newest first', 'Oldest first'] },
  { key: 'name', label: 'Name', directions: ['A to Z', 'Z to A'] },
  { key: 'plot', label: 'Zone and plot', directions: ['A to Z', 'Z to A'] },
];

export const defaultSort = (searching) => (searching ? { key: 'best' } : { key: 'updated', reversed: false });

// Each comparer puts the "first" direction first. Plots with nothing to sort by
// (vacant, never reported) go last either way.
const compareBy = {
  updated: (a, b) => parseUtc(b.latest_report.created_at) - parseUtc(a.latest_report.created_at),
  edited: (a, b) => parseUtc(b.shop.updated_at) - parseUtc(a.shop.updated_at),
  name: (a, b) => displayName(a.shop).localeCompare(displayName(b.shop), undefined, { sensitivity: 'base' }),
  plot: (a, b) => a.zone.localeCompare(b.zone) || a.id.localeCompare(b.id, undefined, { numeric: true }),
};
const hasValue = {
  updated: (p) => !!(p.shop && p.latest_report),
  edited: (p) => !!p.shop?.updated_at,
  name: (p) => !!p.shop,
  plot: () => true,
};

function sortGroup(list, sort) {
  const compare = compareBy[sort.key];
  const has = hasValue[sort.key];
  return [...list].sort((a, b) => {
    if (has(a) !== has(b)) return has(a) ? -1 : 1;
    if (!has(a)) return compareBy.plot(a, b);
    return sort.reversed ? compare(b, a) : compare(a, b);
  });
}

// Starred first, each part keeping its order.
const starredFirst = (list, starred) => (starred.size
  ? [...list.filter((p) => starred.has(p.id)), ...list.filter((p) => !starred.has(p.id))]
  : list);

export function sortPlots(plots, searchResults, sort, starred = new Set()) {
  if (!searchResults) return starredFirst(sortGroup(plots, sort), starred);
  const matches = plots.filter((p) => searchResults.matchedIds.has(p.id));
  const rest = sortGroup(plots.filter((p) => !searchResults.matchedIds.has(p.id)), { key: 'plot' });
  if (sort.key === 'best') {
    const rank = new Map(searchResults.orderedIds.map((id, i) => [id, i]));
    return [...starredFirst(matches.sort((a, b) => rank.get(a.id) - rank.get(b.id)), starred), ...rest];
  }
  return [...starredFirst(sortGroup(matches, sort), starred), ...rest];
}
