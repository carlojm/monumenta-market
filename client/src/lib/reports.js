const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function cooldownKey(x, z) {
  return `report_cooldown_${x}_${z}`;
}

export function canReport(x, z) {
  const last = localStorage.getItem(cooldownKey(x, z));
  return !last || Date.now() - Number(last) > COOLDOWN_MS;
}

export function recordReport(x, z) {
  localStorage.setItem(cooldownKey(x, z), String(Date.now()));
}

export function cooldownRemainingMinutes(x, z) {
  const last = localStorage.getItem(cooldownKey(x, z));
  if (!last) return 0;
  const remaining = COOLDOWN_MS - (Date.now() - Number(last));
  return Math.max(0, Math.ceil(remaining / 60000));
}

export function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}