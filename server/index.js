import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import './db/applyRestore.js'; // must come before anything that opens the database
import db from './db/init.js';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from './lib/r2.js';
import { requireModerator } from './middleware/adminAuth.js';
import { startVerifyServer } from './lib/verifyServer.js';
import { scheduleBackups } from './lib/backup.js';
import { loadAccount } from './lib/auth.js';
import { ACCURACY_COLUMNS, NOT_OUTDATED, VOTES } from './lib/comments.js';
import { imageType } from './lib/imageType.js';
import { logModAction } from './lib/modlog.js';
import * as limits from './lib/rateLimits.js';
import { addLogEntry } from './lib/shopLog.js';
import { SHOP_FIELDS, getCurrentShop, getPlot, getShop } from './lib/shops.js';
import { applyRevision, authorChanged, cleanSnapshot, ownersOtherShop, pendingForPlot, recordDirect, recordMove, snapshotOf } from './lib/revisions.js';
import {
  KINDS, cleanTag, listTags, sameName, tagsByShop, tagsForShop,
} from './lib/tags.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import adminTagRoutes from './routes/adminTags.js';
import revisionRoutes from './routes/revisions.js';

const MAX_IMAGE_MB = 8;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_MB * 1024 * 1024, files: 1 } });

// Reads one uploaded file into req.file. multer reports problems (too big,
// wrong field name) as errors, which would otherwise become a 500.
function receiveImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Images can be at most ${MAX_IMAGE_MB} MB.` });
    if (err) return res.status(400).json({ error: 'Could not read the upload. Send one image.' });
    next();
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// On Fly every request comes through Fly's proxy, which adds the visitor's
// real IP to X-Forwarded-For. Trusting exactly one hop makes req.ip that IP
// (rate limits count by it). Trusting more would let a visitor fake their IP
// by sending the header themselves. Fly sets FLY_APP_NAME on its machines.
if (process.env.FLY_APP_NAME) app.set('trust proxy', 1);

// Security headers: instructions the browser follows for this site.
// - Content-Security-Policy: only run scripts, styles and fonts from this
//   site, and only show images from here or the shop image host. If someone
//   ever slips HTML into the page, the browser still won't run their script.
// - frame-ancestors 'none': no other site can show this one in a frame
//   (stops "clickjacking", where a hidden frame tricks you into clicking).
// - Strict-Transport-Security (on by default): browsers use HTTPS only.
// No CORS: the pages and the API share one origin, so other sites' scripts
// get nothing (Vite proxies /api in dev).
const imageHost = R2_PUBLIC_URL ? new URL(R2_PUBLIC_URL).origin : null;
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      'img-src': ["'self'", 'data:', ...(imageHost ? [imageHost] : [])],
      'style-src': ["'self'"],
      'font-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': null, // Fly already forces HTTPS, and this breaks local http tests
    },
  },
}));
app.use('/api', limits.api); // safety net: 300 requests a minute per IP (before parsing bodies)
app.use(express.json());
app.use(cookieParser());
app.use(loadAccount); // sets req.account when logged in
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // admin-only account management
app.use('/api/admin', adminTagRoutes); // tag management (moderators and admins)
app.use('/api', revisionRoutes); // page revisions: suggest, review, publish

const ACTIVITY = ['vacant', 'wip', 'unclear', 'inactive', 'active'];
const LOCK = ['locked', 'unlocked'];
const REPORT_HISTORY = 20;

// --- Shared queries ---

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
  return {
    ...shop,
    tags: tagsForShop(shop.id),
    comments: getApprovedComments.all(shop.id),
    images: getImages.all(shop.id),
  };
}

// --- Public API ---

app.get('/api/plots', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*,
      s.id AS shop_id, s.owner, s.maintainers, s.shop_name, s.guild_name, s.description, s.stock, s.palette,
      s.guild_color, s.primary_color, s.secondary_color, s.updated_at,
      (SELECT GROUP_CONCAT(body, ' ') FROM comments c
       WHERE c.shop_id = s.id AND c.status = 'approved' AND c.is_system = 0
         AND ${NOT_OUTDATED}) AS comment_text
    FROM plots p
    LEFT JOIN shops s ON s.plot_id = p.id AND s.closed_at IS NULL
    ORDER BY p.id
  `).all();
  const shopTags = tagsByShop(); // one query for every shop's tags

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
      tags: shopTags.get(r.shop_id) ?? [],
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

  const shop = getCurrentShop.get(plot.id);
  res.json({
    ...plot,
    is_guild: !!plot.is_guild,
    shop: shopWithDetails(shop),
    pending_edits: pendingForPlot(plot.id, shop ?? null, req.account),
    latest_report: latestStatus(plot.id),
    reports,
    past_shops: pastShops,
  });
});

// Every approved tag and group, in display order (for the tag picker).
app.get('/api/tags', (req, res) => {
  res.json(listTags());
});

// Suggest a tag that isn't in the list yet. It's pending (hidden) until staff
// approve it in Admin → Tags; approving can also add it to the shop it came from.
const MAX_PENDING_SUGGESTIONS = 5;
const pendingByAccount = db.prepare("SELECT COUNT(*) AS n FROM tags WHERE status = 'pending' AND suggested_by = ?");

app.post('/api/tags/suggest', limits.tagSuggestions, (req, res) => {
  if (!req.account) return res.status(401).json({ error: 'Link your Minecraft account to suggest tags.' });
  const kind = req.body.kind;
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be category or stock' });
  const { tag, error } = cleanTag(req.body, kind);
  if (error) return res.status(400).json({ error });
  if (sameName.get(kind, tag.name, 0)) {
    return res.status(400).json({ error: `"${tag.name}" is already a tag, or has already been suggested.` });
  }
  if (pendingByAccount.get(req.account.id).n >= MAX_PENDING_SUGGESTIONS) {
    return res.status(400).json({
      error: `You already have ${MAX_PENDING_SUGGESTIONS} suggestions waiting for review. Please wait for those first.`,
    });
  }
  const shop = req.body.plot_id ? getCurrentShop.get(String(req.body.plot_id)) : null;

  const id = db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO tags (kind, name, aliases, group_id, color, status, suggested_by, suggested_for_shop_id)
      VALUES (@kind, @name, @aliases, @group_id, @color, 'pending', @by, @shop)
    `).run({ ...tag, kind, by: req.account.id, shop: shop?.id ?? null });
    logModAction(req, 'tag.suggest', `tag:${lastInsertRowid}`,
      `Suggested ${kind === 'category' ? 'category' : 'tag'} "${tag.name}"${shop ? ` for ${shop.owner}'s shop` : ''}`);
    return lastInsertRowid;
  })();
  res.status(201).json({ id, status: 'pending' });
});

// A single shop, current or past (for viewing a plot's history).
app.get('/api/shops/:id', (req, res) => {
  const shop = getShop.get(req.params.id);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json(shopWithDetails(shop));
});

// Linked accounts only. No approval queue: moderators delete bad comments afterwards.
app.post('/api/plots/:id/comments', limits.comments, (req, res) => {
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
  logModAction(req, 'comment.create', `plot:${req.params.id}`,
    `Commented on ${shop.owner}'s shop: "${body.slice(0, 300)}"`);

  res.status(201).json(getComment.get(result.lastInsertRowid));
});

// Accuracy vote from a linked account. The latest vote is the comment's status;
// voting the same as the current status changes nothing.
app.post('/api/comments/:id/vote', limits.votes, (req, res) => {
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
  // Look it up first so the mod log keeps a copy of what was removed.
  const comment = db.prepare(`
    SELECT c.body, s.plot_id, s.owner FROM comments c JOIN shops s ON s.id = c.shop_id
    WHERE c.id = ? AND c.account_id = ? AND c.is_system = 0
  `).get(req.params.id, req.account.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  logModAction(req, 'comment.delete_own', `plot:${comment.plot_id}`,
    `Deleted their own comment on ${comment.owner}'s shop: "${comment.body.slice(0, 300)}"`);
  res.json({ deleted: true });
});

app.post('/api/plots/:id/report', limits.reports, (req, res) => {
  const plot = getPlot.get(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  const activity = req.body.activity || null;
  const lock = req.body.lock || null;
  if (!lock && activity !== 'vacant') return res.status(400).json({ error: 'Report needs a lock state (locked or unlocked)' });
  if (activity && !ACTIVITY.includes(activity)) return res.status(400).json({ error: `activity must be one of ${ACTIVITY.join(', ')}` });
  if (lock && !LOCK.includes(lock)) return res.status(400).json({ error: `lock must be one of ${LOCK.join(', ')}` });

  const shop = getCurrentShop.get(plot.id);
  if (!shop) return res.status(409).json({ error: "This plot is vacant, so there's no shop to report on." });
  db.prepare('INSERT INTO reports (plot_id, shop_id, activity, lock) VALUES (?, ?, ?, ?)')
    .run(plot.id, shop.id, activity, lock);

  res.status(201).json({ recorded: true });
});

// --- Admin: edit a plot's shop ---
//
// Body: any SHOP_FIELDS and `tag_ids`, plus `rename: true` to fix an owner
// typo in place. Fields not sent stay as they are.
// - Plot is vacant: opens a new shop (owner required).
// - Owner changed (and not a rename): closes the current shop and opens a new
//   one with the submitted fields. The old shop keeps its history.
// - Otherwise: updates the current shop and logs each changed field.
// These are page revisions published at once (lib/revisions.js), so they show
// in the page history like everyone else's edits.

app.put('/api/plots/:id/shop', requireModerator, (req, res) => {
  const plot = getPlot.get(req.params.id);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });
  const current = getCurrentShop.get(plot.id) ?? null;
  const now = snapshotOf(current);
  const sentOwner = typeof req.body.owner === 'string' ? req.body.owner.trim() : current?.owner;

  let action = 'edit';
  if (!current) {
    if (!sentOwner) return res.status(400).json({ error: 'Owner is required to open a shop' });
    action = 'open';
  } else if (!sentOwner) {
    return res.status(400).json({ error: 'Owner can\'t be blank. Use vacate to empty the plot.' });
  } else if (sentOwner !== current.owner && !req.body.rename) {
    action = 'open';
  }
  // A new shop starts from only what was submitted; an edit keeps unsent fields.
  const cleaned = cleanSnapshot(req.body, action === 'open' ? null : now);
  if (cleaned.error) return res.status(400).json({ error: cleaned.error });
  const values = cleaned.snapshot;
  if (action === 'edit' && !authorChanged(now, values)) return res.json({ updated: false });
  // One shop per owner (3.12): a new shop moves its owner here, but renaming
  // this one to someone who has a shop elsewhere would give them two.
  const elsewhere = action === 'edit' && values.owner !== now.owner && ownersOtherShop(values.owner, plot.id);
  if (elsewhere) return res.status(400).json({ error: `${values.owner} already has a shop at ${elsewhere.plot_id}.` });

  const applied = db.transaction(() => {
    const result = applyRevision({ action, plotId: plot.id, shop: current, values, author: req.account });
    const id = recordDirect({ plotId: plot.id, shopId: current?.id ?? null, action, base: now, proposed: values, account: req.account, applied: result });
    if (result.moved) recordMove({ moved: result.moved, partOf: id, toPlot: plot.id, account: req.account });
    if (action === 'open') {
      const moved = result.moved ? `, moving them from ${result.moved.shop.plot_id}` : '';
      logModAction(req, 'shop.open', `plot:${plot.id}`, current
        ? `Closed ${current.owner}'s shop and opened one for ${values.owner}${moved}`
        : `Opened a shop for ${values.owner}${moved}`);
    } else {
      logModAction(req, 'shop.edit', `plot:${plot.id}`, `Edited ${current.owner}'s shop: ${result.changed.join(', ')}`);
    }
    return result;
  })();

  if (action === 'open') return res.status(201).json({ ...(current ? { closed: current.id } : {}), opened: applied.opened });
  res.json({ updated: applied.changed });
});

app.post('/api/plots/:id/vacate', requireModerator, (req, res) => {
  const current = getCurrentShop.get(req.params.id);
  if (!current) return res.status(409).json({ error: 'Plot is already vacant' });
  db.transaction(() => {
    const now = snapshotOf(current);
    const applied = applyRevision({ action: 'vacate', plotId: req.params.id, shop: current, author: req.account });
    recordDirect({ plotId: req.params.id, shopId: current.id, action: 'vacate', base: now, proposed: null, account: req.account, applied });
    logModAction(req, 'shop.vacate', `plot:${req.params.id}`, `Closed ${current.owner}'s shop; plot is now vacant`);
  })();
  res.json({ closed: current.id });
});

// --- Admin: images (attached to the plot's current shop) ---

app.post('/api/plots/:id/image', requireModerator, limits.uploads, receiveImage, async (req, res) => {
  const shop = getCurrentShop.get(req.params.id);
  if (!shop) return res.status(409).json({ error: 'This plot has no shop to add images to' });
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  // Trust the file's contents, never its name or claimed type: a file named
  // photo.png could be a web page, which the image host would then serve.
  const type = imageType(req.file.buffer);
  if (!type) return res.status(400).json({ error: 'Only PNG, JPEG, WebP or GIF images can be uploaded.' });
  const key = `market/${req.params.id}_${shop.id}_${Date.now()}.${type.ext}`;

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: req.file.buffer,
    ContentType: type.mime,
  }));

  const url = `${R2_PUBLIC_URL}/${key}`;
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM images WHERE shop_id = ?')
    .get(shop.id).m;
  const result = db.prepare('INSERT INTO images (shop_id, url, sort_order) VALUES (?, ?, ?)')
    .run(shop.id, url, maxOrder + 1);

  logModAction(req, 'image.add', `plot:${req.params.id}`, `Added an image to ${shop.owner}'s shop`);
  res.status(201).json({ id: result.lastInsertRowid, url });
});

app.delete('/api/admin/images/:id', requireModerator, (req, res) => {
  const image = db.prepare(
    'SELECT i.id, s.plot_id, s.owner FROM images i JOIN shops s ON s.id = i.shop_id WHERE i.id = ?'
  ).get(req.params.id);
  if (!image) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM images WHERE id = ?').run(image.id);
  logModAction(req, 'image.delete', `plot:${image.plot_id}`, `Deleted an image from ${image.owner}'s shop`);
  res.json({ deleted: true });
});

// --- Admin: comment moderation (after the fact; comments aren't queued) ---

const ADMIN_COMMENTS_PAGE = 50;
const searchAdminComments = db.prepare(`
  SELECT ${COMMENT_COLUMNS},
    s.plot_id, s.owner, s.shop_name, s.guild_name, s.closed_at AS shop_closed_at
  FROM comments c
  JOIN shops s ON s.id = c.shop_id
  LEFT JOIN accounts a ON a.id = c.account_id
  WHERE c.is_system = 0 AND (
    @q = '' OR c.body LIKE @like OR COALESCE(a.name, c.author) LIKE @like
    OR s.plot_id LIKE @like OR s.owner LIKE @like OR s.shop_name LIKE @like OR s.guild_name LIKE @like
  )
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT @limit OFFSET @offset
`);

// Newest first. `q` matches comment text, author, plot id, or shop owner/name
// (LIKE ignores capitalization). One extra row is fetched to know if there's more.
app.get('/api/admin/comments', requireModerator, (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
  const rows = searchAdminComments.all({ q, like: `%${q}%`, limit: ADMIN_COMMENTS_PAGE + 1, offset });
  res.json({ comments: rows.slice(0, ADMIN_COMMENTS_PAGE), hasMore: rows.length > ADMIN_COMMENTS_PAGE });
});

app.delete('/api/admin/comments/:id', requireModerator, (req, res) => {
  // Look it up first so the mod log keeps a copy of what was removed.
  const comment = db.prepare(`
    SELECT COALESCE(a.name, c.author, 'Anonymous') AS author, c.body, s.plot_id
    FROM comments c JOIN shops s ON s.id = c.shop_id LEFT JOIN accounts a ON a.id = c.account_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  logModAction(req, 'comment.delete', `plot:${comment.plot_id}`,
    `Deleted ${comment.author}'s comment: "${comment.body.slice(0, 300)}"`);
  res.json({ deleted: true });
});

// An /api address that matched no route above. Without this, the React app's
// catch-all below would answer it with the HTML page.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// --- Serve React build in production ---
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'dist');
  app.use(express.static(clientDist));
  // Express 5 needs a named wildcard; a bare '*' throws at startup.
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Errors from any route or middleware end up here (Express 5 also catches
// rejected promises in async routes). Express's built-in handler answers with
// an HTML page and logs a full stack trace even for a visitor's broken JSON.
// - Problems with the request itself (body-parser marks them `expose`: bad
//   JSON, too large) get their status and a short message, and no log line.
// - Anything else is our bug: log it in full for us, but tell the visitor
//   only that something went wrong, never the details.
const REQUEST_ERRORS = {
  'entity.parse.failed': "The request wasn't valid JSON.",
  'entity.too.large': 'The request was too large.',
};
// `next` is unused, but Express only treats a function as an error handler
// when it takes exactly 4 arguments.
app.use((err, req, res, next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status < 500 && err.expose) {
    return res.status(status).json({ error: REQUEST_ERRORS[err.type] ?? 'Bad request.' });
  }
  console.error(`Error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// The fake Minecraft server for account verification runs in this same
// process, so it shares the database. Set VERIFY_PORT (e.g. 25565) to enable.
if (process.env.VERIFY_PORT) startVerifyServer(Number(process.env.VERIFY_PORT));

// Nightly database backup to R2, on the live site only.
if (process.env.NODE_ENV === 'production') scheduleBackups(db);
