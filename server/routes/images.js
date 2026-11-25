// server/routes/images.js
//
// Shop images (3.11), mounted at /api. The rules live in lib/images.js.
//   POST   /plots/:id/images        multipart: image (the file), kind (gallery | icon)
//          The owner, maintainers and staff. Saved as the uploader's draft:
//          it reaches the card only through an edit (routes/revisions.js).
//   DELETE /images/:id              the uploader takes back their own draft
// Uploads aren't in the Mod log: a draft is private until it's part of an
// edit, and edits are logged.

import express from 'express';
import multer from 'multer';
import { uploads as uploadLimit } from '../lib/rateLimits.js';
import { getCurrentShop } from '../lib/shops.js';
import { imageType } from '../lib/imageType.js';
import {
  ImageError, KINDS, MAX_UPLOAD_MB, addImage, deleteDraft, getImage, managesImages, publicImage, uploadBlocked,
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

router.post('/plots/:id/images', needAccount, uploadLimit, receiveImage, async (req, res) => {
  const shop = getCurrentShop.get(req.params.id);
  if (!shop) return res.status(409).json({ error: 'This plot has no shop to add images to.' });
  if (!managesImages(req.account, shop)) {
    return res.status(403).json({ error: "Only the shop's owner, its maintainers or a moderator can add images." });
  }
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });
  // Only these four types reach the image decoder, judged by the file's
  // contents, never its name or claimed type.
  if (!imageType(req.file.buffer)) return res.status(400).json({ error: 'Only PNG, JPEG, WebP or GIF images can be uploaded.' });
  const kind = req.body?.kind ?? 'gallery';
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be gallery or icon.' });
  const blocked = uploadBlocked(req.account);
  if (blocked) return res.status(409).json({ error: blocked });

  let image;
  try {
    image = await addImage({ buffer: req.file.buffer, kind, shop, account: req.account });
  } catch (err) {
    if (err instanceof ImageError) return res.status(400).json({ error: err.message });
    throw err;
  }
  res.status(201).json(publicImage(image));
});

router.delete('/images/:id', needAccount, async (req, res) => {
  const image = getImage.get(req.params.id);
  if (!image || image.account_id !== req.account.id || image.status !== 'draft') {
    return res.status(404).json({ error: 'Image not found.' });
  }
  await deleteDraft(image);
  res.json({ deleted: true });
});

export default router;
