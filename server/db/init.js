import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '../market.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS plots (
    x INTEGER NOT NULL,
    z INTEGER NOT NULL,
    owner TEXT,
    shop_name TEXT,
    zone TEXT,
    status TEXT DEFAULT 'active',
    description TEXT,
    is_guild INTEGER DEFAULT 0,
    updated_at TEXT,
    PRIMARY KEY (x, z)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_x INTEGER NOT NULL,
    plot_z INTEGER NOT NULL,
    author TEXT,
    body TEXT NOT NULL,
    is_system INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plot_x, plot_z) REFERENCES plots(x, z)
  );

  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plot_x INTEGER NOT NULL,
    plot_z INTEGER NOT NULL,
    url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (plot_x, plot_z) REFERENCES plots(x, z)
  );
`);

export default db;