// server/lib/backup.js
//
// Nightly database backups to a private R2 bucket (separate from the public
// image bucket, since the database holds password and session hashes).
//
// Each run copies the database with SQLite's backup API (safe while the site
// is writing), gzips it, and uploads it as <prefix>/market-YYYY-MM-DD.db.gz.
// Running twice on one day just replaces that day's file. Old copies are then
// pruned: the last 30 days are kept, plus the 1st of each month for a year.
//
// The live site uploads to backups/; anywhere else (your computer) uses
// backups-dev/, so a local test can never replace a real backup.
//
// Env: R2_ENDPOINT, R2_BACKUP_BUCKET, R2_BACKUP_ACCESS_KEY_ID, R2_BACKUP_SECRET_ACCESS_KEY.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

export const BUCKET = process.env.R2_BACKUP_BUCKET;
export const PREFIX = process.env.NODE_ENV === 'production' ? 'backups/' : 'backups-dev/';
const KEEP_DAILY = 30;
const KEEP_MONTHLY_DAYS = 366;
const RUN_AT_UTC_HOUR = 4; // quiet time for both EU and US players

export const backupsConfigured = () =>
  !!(BUCKET && process.env.R2_BACKUP_ACCESS_KEY_ID && process.env.R2_BACKUP_SECRET_ACCESS_KEY);

export const backupClient = () => new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_BACKUP_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_BACKUP_SECRET_ACCESS_KEY,
  },
});

const today = () => new Date().toISOString().slice(0, 10);
const daysOld = (date) => Math.round((Date.parse(today()) - Date.parse(date)) / 86_400_000);

// Which backups to delete: anything past 30 days, except the nightly one of
// the 1st of a month within the last year (labelled ones, like the backup
// before a deploy, go at 30 days). Files that don't look like backups are
// left alone.
export function expiredKeys(keys) {
  return keys.filter((key) => {
    const [, date, label] = key.match(/market-(\d{4}-\d{2}-\d{2})(-[a-z0-9-]+)?\.db\.gz$/) ?? [];
    if (!date) return false;
    const age = daysOld(date);
    if (age < KEEP_DAILY) return false;
    return !(!label && date.endsWith('-01') && age < KEEP_MONTHLY_DAYS);
  });
}

// A label names an extra backup (market-<date>-<label>.db.gz), so it doesn't
// replace that day's nightly one.
export const LABEL = /^[a-z0-9-]+$/;

export const NOT_CONFIGURED = 'Backups need R2_BACKUP_BUCKET, R2_BACKUP_ACCESS_KEY_ID and R2_BACKUP_SECRET_ACCESS_KEY';

// Back up `db` (the open database) now. Returns { key, bytes, deleted }.
export async function runBackup(db, label = null) {
  if (!backupsConfigured()) throw new Error(NOT_CONFIGURED);
  if (label !== null && !LABEL.test(label)) throw new Error(`"${label}" isn't a label like predeploy-abc1234`);
  const s3 = backupClient();
  const tmp = path.join(os.tmpdir(), `market-backup-${process.pid}.db`);
  try {
    await db.backup(tmp);
    const body = zlib.gzipSync(fs.readFileSync(tmp));
    const key = `${PREFIX}market-${today()}${label ? `-${label}` : ''}.db.gz`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'application/gzip' }));

    const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }));
    const old = expiredKeys((listed.Contents ?? []).map((o) => o.Key));
    if (old.length) {
      await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: old.map((Key) => ({ Key })) } }));
    }
    return { key, bytes: body.length, deleted: old };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// Run a backup every day at 4am UTC. A failed run is logged and the next
// night tries again; it never takes the site down.
export function scheduleBackups(db) {
  if (!backupsConfigured()) {
    console.log('Backups off (R2_BACKUP_* not set)');
    return;
  }
  const next = new Date();
  next.setUTCHours(RUN_AT_UTC_HOUR, 0, 0, 0);
  if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
  setTimeout(async () => {
    try {
      const { key, bytes, deleted } = await runBackup(db);
      console.log(`Backup saved: ${key} (${Math.round(bytes / 1024)} KB)${deleted.length ? `, removed ${deleted.length} old` : ''}`);
    } catch (err) {
      console.error('Backup failed:', err);
    }
    scheduleBackups(db);
  }, next - new Date());
  console.log(`Next backup: ${next.toISOString()}`);
}
