const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function cooldownKey(plotId) {
  return `report_cooldown_${plotId}`;
}

function readCooldown(plotId) {
  try {
    return Number(localStorage.getItem(cooldownKey(plotId))) || 0;
  } catch {
    return 0;
  }
}

export function canReport(plotId) {
  return Date.now() - readCooldown(plotId) > COOLDOWN_MS;
}

export function recordReport(plotId) {
  try {
    localStorage.setItem(cooldownKey(plotId), String(Date.now()));
  } catch {
    // storage blocked; the cooldown just won't persist
  }
}

export function cooldownRemainingMinutes(plotId) {
  const remaining = COOLDOWN_MS - (Date.now() - readCooldown(plotId));
  return Math.max(0, Math.ceil(remaining / 60000));
}

export function parseUtc(dateString) {
  // SQLite's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" with no timezone,
  // but it's UTC. Normalize to ISO so Date parses it as UTC, not local time.
  if (dateString.includes('T') || dateString.endsWith('Z')) {
    return new Date(dateString);
  }
  return new Date(dateString.replace(' ', 'T') + 'Z');
}

export function timeAgo(dateString) {
  const diffMs = Date.now() - parseUtc(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function formatDate(dateString) {
  return parseUtc(dateString).toLocaleDateString();
}
