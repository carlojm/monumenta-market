// Shop images (3.11): the API calls, and who may manage them. The server
// checks every rule again; this only decides what to show.

import { maintainersOf } from './shopFields';

export const MAX_UPLOAD_MB = 10;

export const isStaff = (account) => account?.role === 'moderator' || account?.role === 'admin';

// The owner, maintainers and staff upload and delete. Staff
// also approve, and their uploads skip review.
export function managesImages(account, shop) {
  if (!account || !shop) return false;
  if (isStaff(account)) return true;
  const name = account.name.toLowerCase();
  return shop.owner?.trim().toLowerCase() === name || maintainersOf(shop).some((m) => m.toLowerCase() === name);
}

async function send(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
  return body;
}

export function uploadImage(plotId, file, kind = 'gallery') {
  const form = new FormData();
  form.append('kind', kind);
  form.append('image', file);
  return send(`/api/plots/${plotId}/images`, { method: 'POST', body: form });
}

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
export const approveImage = (id) => send(`/api/images/${id}/approve`, json('POST'));
export const rejectImage = (id) => send(`/api/images/${id}/reject`, json('POST'));
export const deleteImage = (id) => send(`/api/images/${id}`, json('DELETE'));
