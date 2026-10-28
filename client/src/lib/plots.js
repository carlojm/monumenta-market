export const ACTIVITIES = ['active', 'inactive', 'wip', 'vacant', 'unclear'];
export const LOCKS = ['unlocked', 'locked'];

export const ACTIVITY_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  wip: 'WIP',
  vacant: 'Vacant',
  unclear: 'Unclear',
};

// Map square colors. Each plot falls into one category from both parts of its
// status (see mapCategory); the legend lists them in this order.
export const MAP_CATEGORIES = [
  { key: 'active', label: 'Active', color: '#6fa37a' },
  { key: 'locked', label: 'Locked', color: '#c4a032' },
  { key: 'inactive', label: 'Inactive', color: '#b0564a' },
  { key: 'quiet', label: 'Vacant', color: '#d4d4d459' },
];
const MAP_COLORS = Object.fromEntries(MAP_CATEGORIES.map((c) => [c.key, c.color]));

export function displayName(shop) {
  if (!shop) return 'Vacant plot';
  return shop.shop_name || shop.guild_name || shop.owner;
}

// "[FISH] The Aquarium" for guilds, the player name otherwise.
export function ownerLabel(shop) {
  if (!shop) return '—';
  return shop.guild_name ? `[${shop.owner}] ${shop.guild_name}` : shop.owner;
}

// "Active, unlocked" (either part may be missing)
export function reportLabel(report) {
  if (!report) return null;
  return [report.activity && ACTIVITY_LABELS[report.activity], report.lock]
    .filter(Boolean)
    .join(', ');
}

// active + unlocked (or lock unknown) = active, active + locked = locked,
// inactive = inactive; WIP, unclear, reported vacant, no report or no shop = quiet.
export function mapCategory(plot) {
  if (!plot.shop) return 'quiet';
  const report = plot.latest_report;
  if (report?.activity === 'inactive') return 'inactive';
  if (report?.activity === 'active') return report.lock === 'locked' ? 'locked' : 'active';
  return 'quiet';
}

export function statusColor(plot) {
  return MAP_COLORS[mapCategory(plot)];
}
