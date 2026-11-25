// server/lib/images.js
//
// Shop images (3.10/3.11). Two kinds:
//   gallery  screenshots of the shop, shown in the card's carousel.
//   icon     one small square picture that stands for the shop, shown in the
//            table. A new approved icon replaces the old one.
// The shop's owner and maintainers, and staff, can upload. Staff uploads show
// at once; the owner's and maintainers' wait for a moderator to approve them.
// (Decided 11/24: only the people who run a shop add its pictures, and a
// moderator checks them.)
//
// Every upload is re-encoded to WebP here, whatever it was sent as. That drops
// EXIF and other metadata (a photo's location, camera, editing software), and
// whatever else was hidden in the file, so only pixels reach the image host.
// File names are random, so a pending image can't be found by guessing.

import crypto from 'node:crypto';
import sharp from 'sharp';
import db from '../db/init.js';
import { isStaff, runsShop } from './revisions.js';
import { putFile, removeFiles, urlFor } from './imageStore.js';

export const KINDS = ['gallery', 'icon'];
export const MAX_UPLOAD_MB = 10;
export const MAX_GALLERY = 10; // approved and pending, per shop
export const MAX_PER_DAY = 20; // uploads per account, staff excepted
export const MAX_PENDING = 10; // waiting for review, per account
export const PENDING_DAYS = 30; // unreviewed uploads are deleted after this
const MIN_SIZE = { gallery: [640, 360], icon: [64, 64] };
const FULL_SIZE = 1920; // longest side, for the full-size viewer
const CARD_WIDTH = 960; // the card's carousel (twice its width, for sharp screens)
const ICON_SIZE = 128;

// The files that make up an image, by its storage key (images made before
// 3.11 have none, and their files are left alone).
const filesOf = (image) => (!image.storage_key ? []
  : image.kind === 'icon' ? [`${image.storage_key}.webp`] : [`${image.storage_key}.webp`, `${image.storage_key}-card.webp`]);

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
    // Square, cut from the middle if it isn't already.
    const icon = await input().resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' }).webp({ quality: 90 }).toBuffer();
    return { files: [['', icon]], width: ICON_SIZE, height: ICON_SIZE };
  }
  const full = await input().resize(FULL_SIZE, FULL_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const card = await input().resize({ width: CARD_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  return { files: [['', full.data], ['-card', card]], width: full.info.width, height: full.info.height };
}

// --- Who may do what (always checked here, never only in the browser) ---

// Uploading, and deleting the shop's images.
export const managesImages = (account, shop) => isStaff(account) || runsShop(account, shop);
// Publishing without review, and approving or rejecting uploads.
export const reviewsImages = (account) => isStaff(account);

// --- Reading ---

const IMAGE_COLUMNS = `i.id, i.shop_id, i.kind, i.status, i.url, i.card_url, i.width, i.height, i.created_at,
  i.account_id, a.name AS uploader`;
const getImage = db.prepare(`SELECT i.*, a.name AS uploader FROM images i LEFT JOIN accounts a ON a.id = i.account_id WHERE i.id = ?`);
const approvedGallery = db.prepare(`SELECT ${IMAGE_COLUMNS} FROM images i LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.shop_id = ? AND i.kind = 'gallery' AND i.status = 'approved' ORDER BY i.sort_order, i.id`);
const approvedIcon = db.prepare(`SELECT ${IMAGE_COLUMNS} FROM images i LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.shop_id = ? AND i.kind = 'icon' AND i.status = 'approved' ORDER BY i.id DESC LIMIT 1`);
const pendingForShop = db.prepare(`SELECT ${IMAGE_COLUMNS} FROM images i LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.shop_id = ? AND i.status = 'pending' ORDER BY i.id`);

export { getImage };

// What the browser gets for an image.
export const publicImage = (i) => ({
  id: i.id, kind: i.kind, status: i.status, url: i.url, card_url: i.card_url ?? i.url,
  width: i.width, height: i.height, uploader: i.uploader ?? null, created_at: i.created_at,
});

// A shop's images for its page: the approved gallery, the icon, and, for the people who run the shop and staff, the uploads waiting for review.
export function imagesForShop(shop, account) {
  const pending = managesImages(account, shop) ? pendingForShop.all(shop.id) : [];
  return {
    images: approvedGallery.all(shop.id).map(publicImage),
    icon: approvedIcon.get(shop.id)?.url ?? null,
    pending_images: pending.map(publicImage),
  };
}

// --- Uploading ---

const countGallery = db.prepare(
  "SELECT count(*) AS n FROM images WHERE shop_id = ? AND kind = 'gallery' AND status IN ('pending', 'approved')",
);
const countToday = db.prepare("SELECT count(*) AS n FROM images WHERE account_id = ? AND created_at > datetime('now', '-1 day')");
const countPending = db.prepare("SELECT count(*) AS n FROM images WHERE account_id = ? AND status = 'pending'");
const myPendingIcons = db.prepare(
  "SELECT * FROM images WHERE shop_id = ? AND account_id = ? AND kind = 'icon' AND status = 'pending'",
);
const nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM images WHERE shop_id = ?');
const insertImage = db.prepare(`
  INSERT INTO images (shop_id, kind, status, url, card_url, storage_key, width, height, sort_order, account_id,
    created_at, reviewer_id, reviewed_at)
  VALUES (@shop_id, @kind, @status, @url, @card_url, @storage_key, @width, @height, @sort_order, @account_id,
    CURRENT_TIMESTAMP, @reviewer_id, CASE WHEN @reviewer_id IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END)
`);
const deleteRow = db.prepare('DELETE FROM images WHERE id = ?');
const otherIcons = db.prepare("SELECT * FROM images WHERE shop_id = ? AND kind = 'icon' AND status = 'approved' AND id != ?");

// Why this account can't upload this kind of image to this shop now, or null.
export function uploadBlocked(account, shop, kind) {
  if (kind === 'gallery' && countGallery.get(shop.id).n >= MAX_GALLERY) {
    return `This shop has ${MAX_GALLERY} screenshots already. Ask its owner or a moderator to remove one first.`;
  }
  if (isStaff(account)) return null;
  if (countToday.get(account.id).n >= MAX_PER_DAY) return `You can upload ${MAX_PER_DAY} images a day. Try again tomorrow.`;
  if (countPending.get(account.id).n >= MAX_PENDING) {
    return `You have ${MAX_PENDING} images waiting for review. Wait until some are reviewed.`;
  }
  return null;
}

// Re-encodes and stores an upload. Returns the new image row.
export async function addImage({ buffer, kind, shop, account }) {
  const encoded = await encode(buffer, kind);
  const key = crypto.randomUUID();
  for (const [suffix, body] of encoded.files) await putFile(`${key}${suffix}.webp`, body, 'image/webp');
  const direct = reviewsImages(account);

  const replaced = db.transaction(() => {
    // A new icon for a shop replaces the uploader's earlier one still waiting.
    const old = direct ? [] : (kind === 'icon' ? myPendingIcons.all(shop.id, account.id) : []);
    for (const image of old) deleteRow.run(image.id);
    const { lastInsertRowid } = insertImage.run({
      shop_id: shop.id, kind, status: direct ? 'approved' : 'pending', storage_key: key,
      url: urlFor(`${key}.webp`), card_url: kind === 'gallery' ? urlFor(`${key}-card.webp`) : null,
      width: encoded.width, height: encoded.height, sort_order: nextOrder.get(shop.id).n,
      account_id: account.id, reviewer_id: direct ? account.id : null,
    });
    return { id: lastInsertRowid, old: [...old, ...(direct && kind === 'icon' ? retireIcons(shop.id, lastInsertRowid) : [])] };
  })();
  await removeFiles(replaced.old.flatMap(filesOf));
  return getImage.get(replaced.id);
}

// An approved icon replaces the shop's earlier ones. Returns the rows removed
// (their files still need deleting).
function retireIcons(shopId, keepId) {
  const old = otherIcons.all(shopId, keepId);
  for (const image of old) deleteRow.run(image.id);
  return old;
}

// --- Reviewing and removing ---

const approveRow = db.prepare(
  "UPDATE images SET status = 'approved', reviewer_id = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
);

export async function approveImage(image, account) {
  const old = db.transaction(() => {
    approveRow.run(account?.id ?? null, image.id);
    return image.kind === 'icon' ? retireIcons(image.shop_id, image.id) : [];
  })();
  await removeFiles(old.flatMap(filesOf));
}

// Rejecting and deleting both remove the image and its files.
export async function deleteImage(image) {
  deleteRow.run(image.id);
  await removeFiles(filesOf(image));
}

// --- Clean-up: uploads nobody reviewed in PENDING_DAYS are deleted ---

const expiredPending = db.prepare(
  `SELECT * FROM images WHERE status = 'pending' AND created_at < datetime('now', '-${PENDING_DAYS} days')`,
);

export async function deleteExpiredPending() {
  const expired = expiredPending.all();
  for (const image of expired) deleteRow.run(image.id);
  await removeFiles(expired.flatMap(filesOf));
  return expired.length;
}

// At startup and then once a day.
export function scheduleImageCleanup() {
  const run = () => deleteExpiredPending()
    .then((n) => { if (n) console.log(`Deleted ${n} unreviewed image uploads older than ${PENDING_DAYS} days`); })
    .catch((err) => console.error('Image clean-up failed:', err.message));
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
