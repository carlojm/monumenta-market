// server/lib/images.js
//
// Shop images (3.10/3.11). Two kinds:
//   gallery  screenshots of the shop, shown in the card's carousel.
//   icon     one small square picture that stands for the shop, shown in the
//            table and on the card.
// The shop's owner and maintainers, and staff, can upload. An upload is a
// draft: it only reaches the card through an edit (lib/revisions.js), and an
// edit that adds one waits for a moderator unless a moderator made it.
// (Decided 11/24.) Drafts never sent are deleted after DRAFT_HOURS.
//
// Every upload is re-encoded to WebP here, whatever it was sent as. That drops
// EXIF and other metadata (a photo's location, camera, editing software), and
// whatever else was hidden in the file, so only pixels reach the image host.
// File names are random, so a pending image can't be found by guessing.

import crypto from 'node:crypto';
import sharp from 'sharp';
import db from '../db/init.js';
import { isStaff, runsShop } from './revisions.js';
import { putFile, removeImageFiles, urlFor } from './imageStore.js';

export const KINDS = ['gallery', 'icon'];
export const MAX_UPLOAD_MB = 10;
export const MAX_PER_DAY = 20; // uploads per account, staff excepted
export const DRAFT_HOURS = 24; // uploads never sent in an edit are deleted after this
const MIN_SIZE = { gallery: [640, 360], icon: [16, 16] }; // 16: a Minecraft item's texture
const FULL_SIZE = 1920; // longest side, for the full-size viewer
const CARD_WIDTH = 960; // the card's carousel (twice its width, for sharp screens)
const ICON_SIZE = 128;

// A problem with the uploaded file; its message is for the uploader.
export class ImageError extends Error {}

// Decodes, checks and re-encodes an upload. Throws an ImageError when the
// file isn't a usable image.
async function encode(buffer, kind) {
  try {
    return await encodeImage(buffer, kind);
  } catch (err) {
    if (err instanceof ImageError) throw err;
    throw new ImageError("That file couldn't be read as an image."); // sharp found it broken partway through
  }
}

async function encodeImage(buffer, kind) {
  // limitInputPixels refuses "decompression bombs": small files that expand
  // to billions of pixels. 50 MP is well above an 8K screenshot.
  const input = () => sharp(buffer, { limitInputPixels: 50_000_000 }).rotate(); // rotate: apply the phone's orientation
  const meta = await input().metadata();
  const sideways = (meta.orientation ?? 1) >= 5;
  const [width, height] = sideways ? [meta.height, meta.width] : [meta.width, meta.height];
  const [minW, minH] = MIN_SIZE[kind];
  if (Math.max(width, height) < Math.max(minW, minH) || Math.min(width, height) < Math.min(minW, minH)) {
    throw new ImageError(kind === 'icon'
      ? `Icons need to be at least ${minW} by ${minH} pixels.`
      : `Screenshots need to be at least ${minW} by ${minH} pixels.`);
  }
  if (kind === 'icon') {
    // Square, cut from the middle if it isn't already. Pixel art smaller than
    // the icon (an item's 16x16 texture) is enlarged by copying pixels
    // ('nearest'), so its edges stay sharp instead of blurring; lossless, so
    // compression doesn't smear them either.
    const small = Math.min(width, height) < ICON_SIZE;
    const icon = await input().resize(ICON_SIZE, ICON_SIZE, { fit: 'cover', kernel: small ? 'nearest' : 'lanczos3' })
      .webp({ lossless: true }).toBuffer();
    return { files: [['', icon]], width: ICON_SIZE, height: ICON_SIZE };
  }
  const full = await input().resize(FULL_SIZE, FULL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const card = await input().resize({ width: CARD_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  return { files: [['', full.data], ['-card', card]], width: full.info.width, height: full.info.height };
}

// --- Who may do what (always checked here, never only in the browser) ---

// Uploading, and changing the shop's images in an edit.
export const managesImages = (account, shop) => isStaff(account) || runsShop(account, shop);

// --- Reading ---

const IMAGE_COLUMNS = `i.id, i.shop_id, i.kind, i.status, i.url, i.card_url, i.width, i.height, i.created_at,
  i.account_id, a.name AS uploader`;
const getImage = db.prepare(`SELECT i.*, a.name AS uploader FROM images i LEFT JOIN accounts a ON a.id = i.account_id WHERE i.id = ?`);
const approvedGallery = db.prepare(`SELECT ${IMAGE_COLUMNS} FROM images i LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.shop_id = ? AND i.kind = 'gallery' AND i.status = 'approved' ORDER BY i.sort_order, i.id`);
const approvedIcon = db.prepare(`SELECT ${IMAGE_COLUMNS} FROM images i LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.shop_id = ? AND i.kind = 'icon' AND i.status = 'approved' ORDER BY i.id DESC LIMIT 1`);

export { getImage };

// What the browser gets for an image.
export const publicImage = (i) => ({
  id: i.id, kind: i.kind, status: i.status, url: i.url, card_url: i.card_url ?? i.url,
  width: i.width, height: i.height, uploader: i.uploader ?? null, created_at: i.created_at,
});

// A shop's images for its page: the screenshots on the card and the icon.
// (Images in suggestions show with the suggestion, lib/revisions.js.)
export function imagesForShop(shop) {
  const icon = approvedIcon.get(shop.id);
  return {
    images: approvedGallery.all(shop.id).map(publicImage),
    icon: icon?.url ?? null,
    icon_id: icon?.id ?? null, // for the edit form
  };
}

// --- Uploading ---

const countToday = db.prepare("SELECT count(*) AS n FROM images WHERE account_id = ? AND created_at > datetime('now', '-1 day')");
const nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM images WHERE shop_id = ?');
const insertImage = db.prepare(`
  INSERT INTO images (shop_id, kind, status, url, card_url, storage_key, width, height, sort_order, account_id, created_at)
  VALUES (@shop_id, @kind, 'draft', @url, @card_url, @storage_key, @width, @height, @sort_order, @account_id, CURRENT_TIMESTAMP)
`);
const deleteRow = db.prepare('DELETE FROM images WHERE id = ?');

// Why this account can't upload now, or null. (How many screenshots a shop
// may have is checked when the edit is sent.)
export function uploadBlocked(account) {
  if (isStaff(account)) return null;
  if (countToday.get(account.id).n >= MAX_PER_DAY) return `You can upload ${MAX_PER_DAY} images a day. Try again tomorrow.`;
  return null;
}

// Re-encodes and stores an upload, as the account's draft. Returns the row.
export async function addImage({ buffer, kind, shop, account }) {
  const encoded = await encode(buffer, kind);
  const key = crypto.randomUUID();
  for (const [suffix, body] of encoded.files) await putFile(`${key}${suffix}.webp`, body, 'image/webp');
  const { lastInsertRowid } = insertImage.run({
    shop_id: shop.id, kind, storage_key: key,
    url: urlFor(`${key}.webp`), card_url: kind === 'gallery' ? urlFor(`${key}-card.webp`) : null,
    width: encoded.width, height: encoded.height, sort_order: nextOrder.get(shop.id).n, account_id: account.id,
  });
  return getImage.get(lastInsertRowid);
}

// Deletes a draft (taken back out of the edit form) and its files.
export async function deleteDraft(image) {
  deleteRow.run(image.id);
  await removeImageFiles([image]);
}

// --- Clean-up: drafts never sent in an edit are deleted after DRAFT_HOURS ---

const expiredDrafts = db.prepare(
  `SELECT * FROM images WHERE status = 'draft' AND created_at < datetime('now', '-${DRAFT_HOURS} hours')`,
);

export async function deleteExpiredDrafts() {
  const expired = expiredDrafts.all();
  for (const image of expired) deleteRow.run(image.id);
  await removeImageFiles(expired);
  return expired.length;
}

// At startup and then every hour.
export function scheduleImageCleanup() {
  const run = () => deleteExpiredDrafts()
    .then((n) => { if (n) console.log(`Deleted ${n} image drafts older than ${DRAFT_HOURS} hours`); })
    .catch((err) => console.error('Image clean-up failed:', err.message));
  run();
  setInterval(run, 60 * 60 * 1000).unref();
}
