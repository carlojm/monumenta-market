// server/scripts/restore.js
//
// Step 1 of a restore: download a backup from R2 and check it. It's saved next
// to the database as market.db.restore; the live database isn't touched.
// Restarting the server swaps it in (see db/applyRestore.js).
//
// Usage (from server/): npm run restore                list the backups
//                       npm run restore -- 2026-10-29  fetch that day's backup
//                       npm run restore -- 2026-10-29-predeploy-abc1234
//                                                      a labelled one (see the list)
// On Fly:               fly ssh console -C "npm run restore -- 2026-10-29"
//                       then: fly apps restart lofy
//
// On Fly this reads backups/; anywhere else it reads backups-dev/.

import 'dotenv/config';
import fs from 'node:fs';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { dbPath } from '../db/path.js';
import { BUCKET, NOT_CONFIGURED, PREFIX, backupClient, backupsConfigured } from '../lib/backup.js';

// A date, or a date and a label: the part of the name between market- and .db.gz.
const date = process.argv[2];
const target = `${dbPath}.restore`;
const tmp = `${target}.download`;

// Fails unless the file is a sound SQLite database with this site's tables.
function check(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const result = db.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`integrity check failed: ${result}`);
    return db.prepare('SELECT (SELECT count(*) FROM shops) AS shops, (SELECT count(*) FROM accounts) AS accounts').get();
  } finally {
    db.close();
    // Opening it read-only leaves empty -wal/-shm files behind; nothing is in them.
    for (const side of ['-wal', '-shm']) fs.rmSync(file + side, { force: true });
  }
}

try {
  if (!backupsConfigured()) throw new Error(NOT_CONFIGURED);
  const s3 = backupClient();

  if (!date) {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }));
    const keys = (listed.Contents ?? []).map((o) => o.Key).sort().reverse();
    console.log(keys.length ? `Backups in ${PREFIX}:\n  ${keys.join('\n  ')}` : `No backups in ${PREFIX}`);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}(-[a-z0-9-]+)?$/.test(date)) throw new Error(`"${date}" isn't a date like 2026-10-29`);

  const key = `${PREFIX}market-${date}.db.gz`;
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  fs.writeFileSync(tmp, zlib.gunzipSync(Buffer.from(await obj.Body.transformToByteArray())));
  const counts = check(tmp);
  fs.renameSync(tmp, target);

  console.log(`Downloaded ${key}: ${counts.shops} shops, ${counts.accounts} accounts, integrity ok.`);
  console.log(`Saved as ${target}. The live database is unchanged.`);
  console.log('Restart the server to swap it in (on Fly: fly apps restart lofy).');
} catch (err) {
  fs.rmSync(tmp, { force: true });
  console.error('Restore failed:', err.name === 'NoSuchKey' ? `no backup for ${date} (run without a date to list them)` : err.message);
  process.exit(1);
}
