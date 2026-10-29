// Sorting the plot list. With no sort picked, it's newest status update first,
// or best match while searching. While searching, matches always come before
// the (dimmed) non-matches; the sort orders each part.

import { displayName } from './plots';
import { parseUtc } from './reports';

export const SORTS = [
  { key: 'best', label: 'Best match', searchOnly: true },
  { key: 'updated', label: 'Last status update', directions: ['Newest first', 'Oldest first'] },
  { key: 'name', label: 'Name', directions: ['A to Z', 'Z to A'] },
  { key: 'plot', label: 'Zone and plot', directions: ['A to Z', 'Z to A'] },
];

export const defaultSort = (searching) => (searching ? { key: 'best' } : { key: 'updated', reversed: false });

// Each comparer puts the "first" direction first. Plots with nothing to sort by
// (vacant, never reported) go last either way.
const compareBy = {
  updated: (a, b) => parseUtc(b.latest_report.created_at) - parseUtc(a.latest_report.created_at),
  name: (a, b) => displayName(a.shop).localeCompare(displayName(b.shop), undefined, { sensitivity: 'base' }),
  plot: (a, b) => a.zone.localeCompare(b.zone) || a.id.localeCompare(b.id, undefined, { numeric: true }),
};
const hasValue = {
  updated: (p) => !!(p.shop && p.latest_report),
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

export function sortPlots(plots, searchResults, sort) {
  if (!searchResults) return sortGroup(plots, sort);
  const matches = plots.filter((p) => searchResults.matchedIds.has(p.id));
  const rest = sortGroup(plots.filter((p) => !searchResults.matchedIds.has(p.id)), { key: 'plot' });
  if (sort.key === 'best') {
    const rank = new Map(searchResults.orderedIds.map((id, i) => [id, i]));
    return [...matches.sort((a, b) => rank.get(a.id) - rank.get(b.id)), ...rest];
  }
  return [...sortGroup(matches, sort), ...rest];
}
