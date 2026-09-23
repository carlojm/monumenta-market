import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db/init.js';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from './lib/r2.js';
import { adminAuth } from './middleware/adminAuth.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- API routes ---

app.get('/api/plots', (req, res) => {
  const plots = db.prepare(`
    SELECT p.*,
      (SELECT GROUP_CONCAT(body, ' ')
       FROM comments c WHERE c.plot_x = p.x AND c.plot_z = p.z AND c.status = 'approved'
      ) AS comment_text,
      (SELECT report_type FROM reports r
       WHERE r.plot_x = p.x AND r.plot_z = p.z ORDER BY r.created_at DESC LIMIT 1
      ) AS latest_report_type,
      (SELECT created_at FROM reports r
       WHERE r.plot_x = p.x AND r.plot_z = p.z ORDER BY r.created_at DESC LIMIT 1
      ) AS latest_report_at
    FROM plots p
  `).all();
  res.json(plots);
});

app.get('/api/plots/:x/:z', (req, res) => {
  const { x, z } = req.params;
  const plot = db.prepare('SELECT * FROM plots WHERE x = ? AND z = ?').get(x, z);
  if (!plot) return res.status(404).json({ error: 'Plot not found' });

  const comments = db.prepare(
    'SELECT * FROM comments WHERE plot_x = ? AND plot_z = ? AND status = ? ORDER BY created_at DESC'
  ).all(x, z, 'approved');

  const images = db.prepare(
    'SELECT * FROM images WHERE plot_x = ? AND plot_z = ? ORDER BY sort_order'
  ).all(x, z);

  const latestReport = db.prepare(
    'SELECT report_type, created_at FROM reports WHERE plot_x = ? AND plot_z = ? ORDER BY created_at DESC LIMIT 1'
  ).get(x, z);

  res.json({ ...plot, comments, images, latestReport: latestReport || null });
});

app.post('/api/plots/:x/:z/comments', (req, res) => {
  const { x, z } = req.params;
  const { author, body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body required' });

  const result = db.prepare(
    'INSERT INTO comments (plot_x, plot_z, author, body) VALUES (?, ?, ?, ?)'
  ).run(x, z, author || null, body.trim());

  res.status(201).json({ id: result.lastInsertRowid, status: 'pending' });
});

app.post('/api/plots/:x/:z/report', (req, res) => {
  const { x, z } = req.params;
  const { report_type } = req.body;

  if (!['open', 'closed'].includes(report_type)) {
    return res.status(400).json({ error: 'report_type must be "open" or "closed"' });
  }

  db.prepare(
    'INSERT INTO reports (plot_x, plot_z, report_type) VALUES (?, ?, ?)'
  ).run(x, z, report_type);

  res.status(201).json({ recorded: true });
});

// --- Admin: update plot (upsert + diff-based activity log) ---

const TRACKED_FIELDS = ['owner', 'shop_name', 'zone', 'status', 'description'];

app.put('/api/plots/:x/:z', adminAuth, (req, res) => {
  const { x, z } = req.params;
  const updates = req.body;

  const existing = db.prepare('SELECT * FROM plots WHERE x = ? AND z = ?').get(x, z);
  const now = new Date().toISOString();

  if (!existing) {
    db.prepare(`
      INSERT INTO plots (x, z, owner, shop_name, zone, status, description, is_guild, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      x, z,
      updates.owner || null,
      updates.shop_name || null,
      updates.zone || null,
      updates.status || 'active',
      updates.description || null,
      updates.is_guild ? 1 : 0,
      now
    );
    return res.status(201).json({ created: true });
  }

  // Build diff for tracked fields, insert a system comment per change
  const insertSystemComment = db.prepare(`
    INSERT INTO comments (plot_x, plot_z, author, body, is_system, status)
    VALUES (?, ?, NULL, ?, 1, 'approved')
  `);

  for (const field of TRACKED_FIELDS) {
    if (field in updates && updates[field] !== existing[field]) {
      const oldVal = existing[field] || '(empty)';
      const newVal = updates[field] || '(empty)';
      insertSystemComment.run(x, z, `${field} updated from "${oldVal}" to "${newVal}"`);
    }
  }

  db.prepare(`
    UPDATE plots SET owner = ?, shop_name = ?, zone = ?, status = ?, description = ?, is_guild = ?, updated_at = ?
    WHERE x = ? AND z = ?
  `).run(
    updates.owner ?? existing.owner,
    updates.shop_name ?? existing.shop_name,
    updates.zone ?? existing.zone,
    updates.status ?? existing.status,
    updates.description ?? existing.description,
    updates.is_guild !== undefined ? (updates.is_guild ? 1 : 0) : existing.is_guild,
    now,
    x, z
  );

  res.json({ updated: true });
});

// --- Admin: upload image to R2 ---

app.post('/api/plots/:x/:z/image', adminAuth, upload.single('image'), async (req, res) => {
  const { x, z } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const ext = req.file.originalname.split('.').pop();
  const key = `market/${x}_${z}_${Date.now()}.${ext}`;

  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  }));

  const url = `${R2_PUBLIC_URL}/${key}`;

  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM images WHERE plot_x = ? AND plot_z = ?'
  ).get(x, z).m;

  const result = db.prepare(
    'INSERT INTO images (plot_x, plot_z, url, sort_order) VALUES (?, ?, ?, ?)'
  ).run(x, z, url, maxOrder + 1);

  res.status(201).json({ id: result.lastInsertRowid, url });
});

app.delete('/api/admin/images/:id', adminAuth, (req, res) => {
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// --- Admin: comment moderation ---

app.get('/api/admin/comments/pending', adminAuth, (req, res) => {
  const comments = db.prepare(
    "SELECT * FROM comments WHERE status = 'pending' ORDER BY created_at ASC"
  ).all();
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
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));