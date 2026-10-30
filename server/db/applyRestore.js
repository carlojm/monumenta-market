// server/db/applyRestore.js
//
// Step 2 of a restore (step 1 is scripts/restore.js). When the server starts
// and finds market.db.restore, it swaps it in before the database is opened:
//   market.db          -> market.db.before-restore-<time>   (kept, for undo)
//   market.db.restore  -> market.db
//
// The old database's -wal file (recent changes not yet folded into the main
// file) is folded in first, so the kept copy is one complete file.
// To undo: rename the before-restore file to market.db.restore and restart.
//
// Only index.js imports this, and before anything opens the database. Scripts
// run while the server is up, so they must never swap the file.

import fs from 'node:fs';
import Database from 'better-sqlite3';
import { dbPath } from './path.js';

const restore = `${dbPath}.restore`;

if (fs.existsSync(restore)) {
  if (fs.existsSync(dbPath)) {
    const old = new Database(dbPath);
    old.pragma('wal_checkpoint(TRUNCATE)');
    old.pragma('journal_mode = DELETE'); // removes the -wal/-shm files
    old.close();
    const kept = `${dbPath}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(dbPath, kept);
    console.log(`Restore: kept the old database as ${kept}`);
  }
  fs.renameSync(restore, dbPath);
  console.log(`Restore: now using the restored database (${dbPath})`);
}
