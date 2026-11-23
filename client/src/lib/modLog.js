import { parseUtc } from './reports';

// Admin → Mod log: one page of entries (GET /api/admin/modlog). Read with
// React's use(), so it never rejects: a failure comes back as { error }.
export function loadLog({ kind = 'all', q = '', offset = 0 } = {}) {
  const params = new URLSearchParams({ kind, q, offset });
  return fetch(`/api/admin/modlog?${params}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
    .catch(() => ({ error: 'Could not load the mod log. Please try again.' }));
}

// The heading an entry goes under: "Today", "Yesterday", "Nov 20", or
// "Nov 20, 2025" for an earlier year. In the viewer's time zone.
export function dayLabel(dateString, now = new Date()) {
  const d = parseUtc(dateString);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
