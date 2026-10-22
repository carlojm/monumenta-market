import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db/init.js';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from './lib/r2.js';
import { adminAuth } from './middleware/adminAuth.js';
import { startVerifyServer } from './lib/verifyServer.js';
import { loadAccount } from './lib/auth.js';
import { ACCURACY_COLUMNS, NOT_OUTDATED, VOTES } from './lib/comments.js';
import authRoutes from './routes/auth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(loadAccount); // sets req.account when logged in
app.use('/api/auth', authRoutes);

const SHOP_FIELDS = ['owner', 'shop_name', 'guild_name', 'description', 'stock', 'palette',
  'guild_color', 'primary_color', 'secondary_color'];
const ACTIVITY = ['vacant', 'wip', 'unclear', 'inactive', 'active'];
const LOCK = ['locked', 'unlocked'];
const REPORT_HISTORY = 20;

// --- Shared queries ---

const getPlot = db.prepare('SELECT * FROM plots WHERE id = ?');
const getCurrentShop = db.prepare('SELECT * FROM shops WHERE plot_id = ? AND closed_at IS NULL');
const getShop = db.prepare('SELECT * FROM shops WHERE id = ?');
// A linked comment shows the account's *current* name (so it follows renames)
// and is marked verified. Older comments keep their typed name.
const COMMENT_COLUMNS = `
  c.id, c.shop_id, c.body, c.is_system, c.status, c.created_at, c.account_id,
  COALESCE(a.name, c.author) AS author,
  a.id IS NOT NULL AS verified,
  ${ACCURACY_COLUMNS}
`;
const getApprovedComments = db.prepare(`
  SELECT ${COMMENT_COLUMNS} FROM comments c LEFT JOIN accounts a ON a.id = c.account_id
  WHERE c.shop_id = ? AND c.status = 'approved' ORDER BY c.created_at DESC, c.id DESC
`);
const getComment = db.prepare(`
  SELECT ${COMMENT_COLUMNS} FROM comments c LEFT JOIN accounts a ON a.id = c.account_id WHERE c.id = ?
`);
const COMMENT_MAX = 2000;
const getImages = db.prepare('SELECT * FROM images WHERE shop_id = ? ORDER BY sort_order');
const insertSystemComment = db.prepare(
  "INSERT INTO comments (shop_id, author, body, is_system, status) VALUES (?, NULL, ?, 1, 'approved')"
);

// A plot's current status. Reports can leave out a part, so activity and lock
// each come from the most recent report that has them. created_at is the time
// of the newest report of any kind.
const latestActivity = db.prepare(
  'SELECT activity FROM reports WHERE plot_id = ? AND activity IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1'
);
const latestLock = db.prepare(
  'SELECT lock FROM reports WHERE plot_id = ? AND lock IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1'
);
const latestReportAt = db.prepare('SELECT MAX(created_at) AS at FROM reports WHERE plot_id = ?');

function latestStatus(plotId) {
  const created_at = latestReportAt.get(plotId).at;
  if (!created_at) return null;
  return {
    activity: latestActivity.get(plotId)?.activity ?? null,
    lock: latestLock.get(plotId)?.lock ?? null,
    created_at,
  };
}

function shopWithDetails(shop) {
  if (!shop) return null;
  return { ...shop, comments: getApprovedComments.all(shop.id), images: getImages.all(shop.id) };
}

// Blank strings from forms mean "not set".
function cleanShopFields(body) {
  const out = {};
  for (const f of SHOP_FIELDS) {
    if (f in body) out[f] = typeof body[f] === 'string' && body[f].trim() === '' ? null : body[f];
  }
  return out;
}

const insertShop = db.prepare(`
  INSERT INTO shops (plot_id, owner, shop_name, guild_name, description, stock, palette,
    guild_color, primary_color, secondary_color, opened_at)
  VALUES (@plot_id, @owner, @shop_name, @guild_name, @description, @stock, @palette,
    @guild_color, @primary_color, @secondary_color, CURRENT_TIMESTAMP)
`);
const closeShop = db.prepare('UPDATE shops SET closed_at = CURRENT_TIMESTAMP WHERE id = ?');

function openShop(plotId, fields) {
  const row = Object.fromEntries(SHOP_FIELDS.map((f) => [f, fields[f] ?? null]));
  const { lastInsertRowid } = insertShop.run({ ...row, plot_id: plotId });
  insertSystemComment.run(lastInsertRowid, `Shop opened by ${fields.owner}`);
  return lastInsertRowid;
}

// --- Public API ---

app.get('/api/plots', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*,
      s.id AS shop_id, s.owner, s.shop_name, s.guild_name, s.description, s.stock, s.palette,
      s.guild_color, s.primary_color, s.secondary_color, s.updated_at,
      (SELECT GROUP_CONCAT(body, ' ') FROM comments c
       WHERE c.shop_id = s.id AND c.status = 'approved' AND c.is_system = 0
         AND ${NOT_OUTDATED}) AS comment_text
    FROM plots p
    LEFT JOIN shops s ON s.plot_id = p.id AND s.closed_at IS NULL
    ORDER BY p.id
  `).all();

  res.json(rows.map((r) => ({
    id: r.id,
    zone: r.zone,
    x: r.x,
    z: r.z,
    is_guild: !!r.is_guild,
    shop: r.shop_id ? {
      id: r.shop_id,
      ...Object.fromEntries(SHOP_FIELDS.map((f) => [f, r[f]])),
      updated_at: r.updated_at,
      comment_text: r.comment_text,
    } : null,
    latest_report: latestStatus(r.id),
  })));
});

app.get('/api/plots/:id', (req, res) => {
  const plot = getPlot.get(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });

  const reports = db.prepare(
    'SELECT activity, lock, created_at FROM reports WHERE plot_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'
  ).all(plot.id, REPORT_HISTORY);

  const pastShops = db.prepare(`
    SELECT id, owner, shop_name, guild_name, opened_at, closed_at FROM shops
    WHERE plot_id = ? AND closed_at IS NOT NULL ORDER BY closed_at DESC, id DESC
  `).all(plot.id);

  res.json({
    ...plot,
    is_guild: !!plot.is_guild,
    shop: shopWithDetails(getCurrentShop.get(plot.id)),
    latest_report: latestStatus(plot.id),
    reports,
    past_shops: pastShops,
  });
});

// A single shop, current or past (for viewing a plot's history).
app.get('/api/shops/:id', (req, res) => {
  const shop = getShop.get(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json(shopWithDetails(shop));
});

// Linked accounts only. No approval queue: moderators delete bad comments afterwards.
app.post('/api/plots/:id/comments', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Link your Minecraft account to comment.' });
  const shop = getCurrentShop.get(req.params.id);
  if (!shop) return res.status(409).json({ error: 'This plot has no shop to comment on' });
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ error: 'Comment body required' });
  if (body.length > COMMENT_MAX) {
    return res.status(400).json({ error: `Comments can be at most ${COMMENT_MAX} characters.` });
  }

  const result = db.prepare(`
    INSERT INTO comments (shop_id, account_id, author, body, status) VALUES (?, ?, ?, ?, 'approved')
  `).run(shop.id, req.account.id, req.account.name, body);

  res.status(201).json(getComment.get(result.lastInsertRowid));
});

// Accuracy vote from a linked account. The latest vote is the comment's status;
// voting the same as the current status changes nothing.
app.post('/api/comments/:id/vote', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Link your Minecraft account to vote.' });
  const { vote } = req.body;
  if (!VOTES.includes(vote)) return res.status(400).json({ error: `vote must be one of ${VOTES.join(', ')}` });
  const comment = db.prepare('SELECT id, is_system FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.is_system) return res.status(400).json({ error: 'Log entries can\'t be voted on' });

  const current = getComment.get(comment.id);
  if (current.accuracy !== vote) {
    db.prepare('INSERT INTO comment_votes (comment_id, account_id, vote) VALUES (?, ?, ?)')
      .run(comment.id, req.account.id, vote);
  }
  const updated = getComment.get(comment.id);
  res.json({ accuracy: updated.accuracy, accuracy_at: updated.accuracy_at });
});

// Deleting is only allowed for the comment's own account.
app.delete('/api/comments/:id', (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Log in to delete your comments.' });
  const result = db.prepare('DELETE FROM comments WHERE id = ? AND account_id = ?')
    .run(req.params.id, req.account.id);
  if (!result.changes) return res.status(404).json({ error: 'Comment not found' });
  res.json({ deleted: true });
});

app.post('/api/plots/:id/report', (req, res) => {
  const plot = getPlot.get(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  const activity = req.body.activity || null;
  const lock = req.body.lock || null;
  if (!lock && activity !== 'vacant') return res.status(400).json({ error: 'Report needs a lock state (locked or unlocked)' });
  if (activity && !ACTIVITY.includes(activity)) return res.status(400).json({ error: `activity must be one of ${ACTIVITY.join(', ')}` });
  if (lock && !LOCK.includes(lock)) return res.status(400).json({ error: `lock must be one of ${LOCK.join(', ')}` });

  const shop = getCurrentShop.get(plot.id);
  db.prepare('INSERT INTO reports (plot_id, shop_id, activity, lock) VALUES (?, ?, ?, ?)')
    .run(plot.id, shop?.id ?? null, activity, lock);

  res.status(201).json({ recorded: true });
});

// --- Admin: edit a plot's shop ---
//
// Body: any SHOP_FIELDS, plus `rename: true` to fix an owner typo in place.
// - Plot is vacant: opens a new shop (owner required).
// - Owner changed (and not a rename): closes the current shop and opens a new
//   one with the submitted fields. The old shop keeps its history.
// - Otherwise: updates the current shop and logs each changed field.

app.put('/api/plots/:id/shop', adminAuth, (req, res) => {
  const plot = getPlot.get(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  const fields = cleanShopFields(req.body);
  const current = getCurrentShop.get(plot.id);

  const result = db.transaction(() => {
    if (!current) {
      if (!fields.owner) return { status: 400, body: { error: 'Owner is required to open a shop' } };
      return { status: 201, body: { opened: openShop(plot.id, fields) } };
    }

    if ('owner' in fields && !fields.owner) {
      return { status: 400, body: { error: 'Owner can\'t be blank. Use vacate to empty the plot.' } };
    }

    if (fields.owner && fields.owner !== current.owner && !req.body.rename) {
      closeShop.run(current.id);
      insertSystemComment.run(current.id, `Shop closed, plot taken over by ${fields.owner}`);
      return { status: 201, body: { closed: current.id, opened: openShop(plot.id, fields) } };
    }

    const changed = SHOP_FIELDS.filter((f) => f in fields && fields[f] !== current[f]);
    if (!changed.length) return { status: 200, body: { updated: false } };
    for (const f of changed) {
      insertSystemComment.run(current.id,
        `${f} updated from "${current[f] ?? '(empty)'}" to "${fields[f] ?? '(empty)'}"`);
    }
    const sets = changed.map((f) => `${f} = @${f}`).join(', ');
    db.prepare(`UPDATE shops SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`)
      .run({ ...Object.fromEntries(changed.map((f) => [f, fields[f]])), id: current.id });
    return { status: 200, body: { updated: changed } };
  })();

  res.status(result.status).json(result.body);
});

app.post('/api/plots/:id/vacate', adminAuth, (req, res) => {
  const current = getCurrentShop.get(req.params.id);
  if (!current) return res.status(409).json({ error: 'Plot is already vacant' });
  db.transaction(() => {
    closeShop.run(current.id);
    insertSystemComment.run(current.id, 'Shop closed, plot is now vacant');
  })();
  res.json({ closed: current.id });
});

// --- Admin: images (attached to the plot's current shop) ---

app.post('/api/plots/:id/image', adminAuth, upload.single('image'), async (req, res) => {
  const shop = getCurrentShop.get(req.params.id);
  if (!shop) return res.status(409).json({ error: 'This plot has no shop to add images to' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const ext = req.file.originalname.split('.').pop();
  const key = `market/${req.params.id}_${shop.id}_${Date.now()}.${ext}`;

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }));

  const url = `${R2_PUBLIC_URL}/${key}`;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM images WHERE shop_id = ?')
    .get(shop.id).m;
  const result = db.prepare('INSERT INTO images (shop_id, url, sort_order) VALUES (?, ?, ?)')
    .run(shop.id, url, maxOrder + 1);

  res.status(201).json({ id: result.lastInsertRowid, url });
});

app.delete('/api/admin/images/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// --- Admin: comment moderation ---

app.get('/api/admin/comments/pending', adminAuth, (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, s.plot_id, s.owner FROM comments c JOIN shops s ON s.id = c.shop_id
    WHERE c.status = 'pending' ORDER BY c.created_at ASC
  `).all();
  res.json(comments);
});

app.post('/api/admin/comments/:id/approve', adminAuth, (req, res) => {
  db.prepare("UPDATE comments SET status = 'approved' WHERE id = ?").run(req.params.id);
  res.json({ approved: true });
});

app.post('/api/admin/comments/:id/reject', adminAuth, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ rejected: true });
});

// --- Serve React build in production ---
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'dist');
  app.use(express.static(clientDist));
  // Express 5 needs a named wildcard; a bare '*' throws at startup.
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// The fake Minecraft server for account verification runs in this same
// process, so it shares the database. Set VERIFY_PORT (e.g. 25565) to enable.
if (process.env.VERIFY_PORT) startVerifyServer(Number(process.env.VERIFY_PORT));
