export const ACTIVITIES = ['active', 'inactive', 'wip', 'vacant', 'unclear'];
export const LOCKS = ['unlocked', 'locked'];

export const ACTIVITY_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
  wip: 'WIP',
  vacant: 'Vacant',
  unclear: 'Unclear',
};

// Map square colors, keyed by latest reported activity.
export const STATUS_COLORS = {
  active: '#6fa37a',
  inactive: '#9a5f50',
  wip: '#b0902a',
  unclear: '#7d7a9e',
  vacant: '#55574c',
  unknown: '#55574c',
};

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

export function statusColor(plot) {
  return STATUS_COLORS[plot.latest_report?.activity] || STATUS_COLORS.unknown;
}
