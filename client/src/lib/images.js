// Shop images (3.11): the API calls, and who may manage them. The server
// checks every rule again; this only decides what to show.

import { maintainersOf } from './shopFields';

export const MAX_UPLOAD_MB = 10;

export const isStaff = (account) => account?.role === 'moderator' || account?.role === 'admin';

// The owner, maintainers and staff change a shop's images (in an edit; one
// adding an image waits for a moderator unless a moderator made it).
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

// Uploads one file as your draft; it's used when the edit is sent.
export function uploadImage(plotId, file, kind = 'gallery') {
  const form = new FormData();
  form.append('kind', kind);
  form.append('image', file);
  return send(`/api/plots/${plotId}/images`, { method: 'POST', body: form });
}

// Deletes a draft of yours, taken back out of the edit before sending.
export const deleteDraft = (id) => send(`/api/images/${id}`, { method: 'DELETE' });
