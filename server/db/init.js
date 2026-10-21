import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '../market.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// All timestamps use SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) format so they
// sort correctly against CURRENT_TIMESTAMP.
export function createSchema() {
  db.exec(`
    -- Fixed plot geometry. Never added or removed after import.
    CREATE TABLE IF NOT EXISTS plots (
      id TEXT PRIMARY KEY,            -- e.g. 'lime-3'
      zone TEXT NOT NULL,
      x INTEGER NOT NULL,             -- NW corner
      z INTEGER NOT NULL,
      is_guild INTEGER NOT NULL DEFAULT 0
    );

    -- A shop's life on one plot. closed_at IS NULL means it's the current shop.
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plot_id TEXT NOT NULL REFERENCES plots(id),
      owner TEXT NOT NULL,
      shop_name TEXT,
      guild_name TEXT,
      description TEXT,
      stock TEXT,
      palette TEXT,
      guild_color TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      opened_at TEXT,                 -- NULL when unknown (imported shops)
      closed_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_current_shop_per_plot
      ON shops(plot_id) WHERE closed_at IS NULL;

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      author TEXT,                             -- typed name (old comments) or the account's name when posted
      body TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      account_id INTEGER REFERENCES accounts(id)  -- set for comments from linked accounts
    );
    CREATE INDEX IF NOT EXISTS comments_shop ON comments(shop_id);

    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Every status report is kept. shop_id is the shop that was current at the
    -- time (NULL if the plot was vacant). Both parts are optional.
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plot_id TEXT NOT NULL REFERENCES plots(id),
      shop_id INTEGER REFERENCES shops(id),
      activity TEXT,                  -- vacant | wip | unclear | inactive | active
      lock TEXT,                      -- locked | unlocked
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS reports_plot ON reports(plot_id, created_at);

    -- Verified players. Proven by joining the verify Minecraft server, which
    -- gives us their Mojang UUID. Other tables link to the internal id.
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,                 -- Mojang UUID, never changes
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- current Minecraft name
      password_hash TEXT NOT NULL,               -- scrypt salt + hash, never the password
      is_moderator INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Logins. The browser holds a random token in an httpOnly cookie; we store
    -- only its hash, so a leaked database can't be used to log in.
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL                   -- pushed forward on each visit (90 days)
    );

    -- One-time codes from the verify server's kick message. Claiming one on
    -- the site creates the account, or resets its password if it exists.
    CREATE TABLE IF NOT EXISTS verify_codes (
      code TEXT PRIMARY KEY,                     -- e.g. 'K7QXM'
      uuid TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,                  -- 10 minutes after created_at
      used_at TEXT                               -- set when claimed; a code works once
    );
  `);

  // --- Migrations: bring older databases up to date. Each runs once. ---

  // Oct 2026: comments can belong to a linked account.
  addColumnIfMissing('comments', 'account_id', 'INTEGER REFERENCES accounts(id)');
  db.exec('CREATE INDEX IF NOT EXISTS comments_account ON comments(account_id)');
}

// CREATE TABLE IF NOT EXISTS never changes an existing table, so new columns
// on existing tables are added here instead.
function addColumnIfMissing(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`db: added ${table}.${column}`);
  }
}

// Drops the plot data tables. Only used by the plots.json loader. Accounts,
// sessions and verify codes are left alone so a reload doesn't wipe accounts.
export function dropSchema() {
  db.exec(`
    DROP TABLE IF EXISTS comments;
    DROP TABLE IF EXISTS images;
    DROP TABLE IF EXISTS reports;
    DROP TABLE IF EXISTS shops;
    DROP TABLE IF EXISTS plots;
  `);
}

const plotCols = db.prepare('PRAGMA table_info(plots)').all().map((c) => c.name);
if (plotCols.length && !plotCols.includes('id')) {
  // Pre-migration database (plots keyed by x, z). Rebuild it from plots.json.
  console.warn('market.db uses the old schema. Run `npm run db:load` to rebuild it.');
} else {
  createSchema();
}

export default db;
