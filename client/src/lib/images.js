// Shop images (3.11): the API calls, who may manage them, and the cover's
// crop. The server checks every rule again; this only decides what to show.

import { maintainersOf } from './shopFields';

// The cover is a banner this many times wider than it is tall.
export const COVER_ASPECT = 5 / 2;
export const MAX_UPLOAD_MB = 10;

export const isStaff = (account) => account?.role === 'moderator' || account?.role === 'admin';

// The owner, maintainers and staff upload, delete and pick the cover. Staff
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
export const setCover = (plotId, imageId, crop) => send(`/api/plots/${plotId}/cover`, json('PUT', { image_id: imageId, crop }));

// --- The crop: {x, y, w, h} in fractions of the image ---

// How much taller a fraction of the width is than the same fraction of the
// height, for a banner-shaped crop: h = w * ratio.
const heightPerWidth = (width, height) => (width / height) / COVER_ASPECT;

// The biggest banner that fits, in the middle.
export function defaultCrop(width, height) {
  const r = heightPerWidth(width, height);
  const w = Math.min(1, 1 / r);
  const h = w * r;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Moved by (dx, dy), kept inside the image.
export const moveCrop = (c, dx, dy) => ({ ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) });

// Resized from its top-left corner to width `w`, keeping the banner shape,
// between a fifth of the image and as big as fits.
export function resizeCrop(c, w, width, height) {
  const r = heightPerWidth(width, height);
  const max = Math.min(1 - c.x, (1 - c.y) / r);
  const next = clamp(w, Math.min(0.2, max), max);
  return { ...c, w: next, h: next * r };
}

// Styles that show only the crop of an image inside a COVER_ASPECT box: the
// image is scaled so the crop fills the box, then shifted to it.
export const coverStyle = ({ x, y, w, h }) => ({
  width: `${100 / w}%`,
  height: `${100 / h}%`,
  left: `${(-x / w) * 100}%`,
  top: `${(-y / h) * 100}%`,
});
