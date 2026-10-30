// server/scripts/backup.js
//
// Back up the database to R2 right now (the site also does this nightly).
//
// Usage (from server/): npm run backup        uploads to backups-dev/
// On Fly:               fly ssh console -C "npm run backup"   uploads to backups/

import 'dotenv/config';
import db from '../db/init.js';
import { runBackup } from '../lib/backup.js';

try {
  const { key, bytes, deleted } = await runBackup(db);
  console.log(`Backup saved: ${key} (${Math.round(bytes / 1024)} KB)`);
  if (deleted.length) console.log(`Removed old backups: ${deleted.join(', ')}`);
} catch (err) {
  console.error('Backup failed:', err.message);
  process.exit(1);
}
