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
      author TEXT,
      body TEXT NOT NULL,
      is_system INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
  `);
}

// Drops everything. Only used by the plots.json loader.
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
