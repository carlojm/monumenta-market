// server/routes/images.js
//
// Shop images (3.11), mounted at /api. The rules live in lib/images.js.
//   POST   /plots/:id/images        multipart: image (the file), kind (gallery | icon)
//          Linked accounts. The owner, maintainers and staff publish at once;
//          anyone else's upload waits for review.
//   GET    /images/pending          the review queue (staff: every shop; owners and maintainers: theirs)
//   POST   /images/:id/approve
//   POST   /images/:id/reject       deletes it
//   DELETE /images/:id              the owner, maintainers or staff; or the uploader, while it's pending
//   PUT    /plots/:id/cover {image_id, crop}   the owner, maintainers or staff pick the
//          card's cover from the gallery; image_id null removes it
// Every change is recorded in the Mod log.

import express from 'express';
import multer from 'multer';
import db from '../db/init.js';
import { uploads as uploadLimit } from '../lib/rateLimits.js';
import { logModAction } from '../lib/modlog.js';
import { getCurrentShop, getShop } from '../lib/shops.js';
import { imageType } from '../lib/imageType.js';
import {
  ImageError, KINDS, MAX_UPLOAD_MB, addImage, approveImage, cleanCrop, deleteImage, getImage, managesImages, publicImage,
  setCover, uploadBlocked,
} from '../lib/images.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });

// Reads one uploaded file into req.file (and the text fields into req.body).
// multer reports problems (too big, wrong field name) as errors, which would
// otherwise become a 500.
function receiveImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Images can be at most ${MAX_UPLOAD_MB} MB.` });
    if (err) return res.status(400).json({ error: 'Could not read the upload. Send one image.' });
    next();
  });
}

const needAccount = (req, res, next) => (req.account ? next()
  : res.status(401).json({ error: 'Link your Minecraft account to add images.' }));

const shopLabel = (shop) => shop.shop_name || shop.guild_name || shop.owner;
const kindLabel = (kind) => (kind === 'icon' ? 'an icon' : 'a screenshot');

router.post('/plots/:id/images', needAccount, uploadLimit, receiveImage, async (req, res) => {
  const shop = getCurrentShop.get(req.params.id);
  if (!shop) return res.status(409).json({ error: 'This plot has no shop to add images to.' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  // Only these four types reach the image decoder, judged by the file's
  // contents, never its name or claimed type.
  if (!imageType(req.file.buffer)) return res.status(400).json({ error: 'Only PNG, JPEG, WebP or GIF images can be uploaded.' });
  const kind = req.body?.kind ?? 'gallery';
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be gallery or icon.' });
  const blocked = uploadBlocked(req.account, shop, kind);
  if (blocked) return res.status(409).json({ error: blocked });

  let image;
  try {
    image = await addImage({ buffer: req.file.buffer, kind, shop, account: req.account });
  } catch (err) {
    if (err instanceof ImageError) return res.status(400).json({ error: err.message });
    throw err;
  }
  const waiting = image.status === 'pending';
  logModAction(req, waiting ? 'image.suggest' : 'image.add', `plot:${shop.plot_id}`,
    `${waiting ? 'Suggested' : 'Added'} ${kindLabel(kind)} for ${shopLabel(shop)}`, { data: { image_id: image.id } });
  res.status(201).json(publicImage(image));
});

// Pending uploads for current shops; owners and maintainers see their shops'.
const allPending = db.prepare(`
  SELECT i.*, a.name AS uploader, s.plot_id, s.owner, s.maintainers, s.shop_name, s.guild_name
  FROM images i JOIN shops s ON s.id = i.shop_id AND s.closed_at IS NULL
  LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.status = 'pending' ORDER BY i.id
`);

router.get('/images/pending', needAccount, (req, res) => {
  const rows = allPending.all().filter((r) => managesImages(req.account, r));
  res.json(rows.map((r) => ({ ...publicImage(r), plot_id: r.plot_id, shop_name: shopLabel(r) })));
});

// The image and its shop, if this account manages that shop's images (or,
// to delete, uploaded it and it's still pending). Otherwise answers with the
// error and returns null.
function imageToManage(req, res) {
  const image = getImage.get(req.params.id);
  if (!image) {
    res.status(404).json({ error: 'Image not found.' });
    return null;
  }
  const shop = getShop.get(image.shop_id);
  const withdrawing = req.method === 'DELETE' && image.status === 'pending' && image.account_id === req.account.id;
  if (!managesImages(req.account, shop) && !withdrawing) {
    res.status(403).json({ error: "Only the shop's owner, its maintainers or a moderator can do that." });
    return null;
  }
  return { image, shop };
}

router.post('/images/:id/approve', needAccount, async (req, res) => {
  const found = imageToManage(req, res);
  if (!found) return;
  const { image, shop } = found;
  if (image.status !== 'pending') return res.status(409).json({ error: 'This image was already reviewed.' });
  if (shop.closed_at) return res.status(409).json({ error: 'That shop has closed since this was uploaded.' });
  await approveImage(image, req.account);
  logModAction(req, 'image.approve', `plot:${shop.plot_id}`,
    `Approved ${kindLabel(image.kind)} by ${image.uploader ?? 'a deleted account'} for ${shopLabel(shop)}`, { data: { image_id: image.id } });
  res.json(publicImage(getImage.get(image.id)));
});

router.post('/images/:id/reject', needAccount, async (req, res) => {
  const found = imageToManage(req, res);
  if (!found) return;
  const { image, shop } = found;
  if (image.status !== 'pending') return res.status(409).json({ error: 'This image was already reviewed.' });
  await deleteImage(image);
  logModAction(req, 'image.reject', `plot:${shop.plot_id}`,
    `Rejected ${kindLabel(image.kind)} by ${image.uploader ?? 'a deleted account'} for ${shopLabel(shop)}`);
  res.json({ deleted: true });
});

router.delete('/images/:id', needAccount, async (req, res) => {
  const found = imageToManage(req, res);
  if (!found) return;
  const { image, shop } = found;
  await deleteImage(image);
  const withdrawn = image.status === 'pending' && image.account_id === req.account.id;
  logModAction(req, withdrawn ? 'image.withdraw' : 'image.delete', `plot:${shop.plot_id}`,
    `${withdrawn ? 'Withdrew' : 'Deleted'} ${kindLabel(image.kind)} for ${shopLabel(shop)}`);
  res.json({ deleted: true });
});

router.put('/plots/:id/cover', needAccount, (req, res) => {
  const shop = getCurrentShop.get(req.params.id);
  if (!shop) return res.status(409).json({ error: 'This plot has no shop.' });
  if (!managesImages(req.account, shop)) {
    return res.status(403).json({ error: "Only the shop's owner, its maintainers or a moderator can pick the cover." });
  }
  const imageId = req.body?.image_id ?? null;
  if (imageId === null) {
    setCover(shop, null, null);
    logModAction(req, 'image.cover', `plot:${shop.plot_id}`, `Removed the cover of ${shopLabel(shop)}`);
    return res.json({ cover: null });
  }
  const image = getImage.get(imageId);
  if (!image || image.shop_id !== shop.id || image.kind !== 'gallery' || image.status !== 'approved') {
    return res.status(400).json({ error: "The cover must be one of this shop's screenshots." });
  }
  const crop = cleanCrop(req.body?.crop);
  if (!crop) return res.status(400).json({ error: 'The crop must be a rectangle inside the image.' });
  setCover(shop, image.id, crop);
  logModAction(req, 'image.cover', `plot:${shop.plot_id}`, `Changed the cover of ${shopLabel(shop)}`, { data: { image_id: image.id, crop } });
  res.json({ cover: { image_id: image.id, crop } });
});

export default router;
