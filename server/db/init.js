import Database from 'better-sqlite3';
import { dbPath } from './path.js';

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
      role TEXT NOT NULL DEFAULT 'player',      -- 'player' | 'moderator' (admins come from ADMIN_UUIDS in .env)
      banned_at TEXT,                            -- set when an admin bans the account
      ban_reason TEXT,                           -- only shown to admins
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

  // Comment accuracy votes from linked accounts. A comment's status is its
  // latest vote; every vote is kept. Deleting a comment deletes its votes.
  db.exec(`
    CREATE TABLE IF NOT EXISTS comment_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      vote TEXT NOT NULL,                        -- 'accurate' | 'outdated'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS comment_votes_comment ON comment_votes(comment_id, created_at);
  `);

  // Private record of staff actions, comment activity and page revisions
  // (staff only). account_id is NULL when the emergency ADMIN_TOKEN was used.
  // Not cleared by db:load.
  db.exec(`
    CREATE TABLE IF NOT EXISTS mod_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id),
      actor_name TEXT,                           -- kept so entries still say who if the account is deleted
      action TEXT NOT NULL,                      -- e.g. 'comment.delete', 'shop.edit', 'account.role'
      target TEXT,                               -- e.g. 'plot:lime-3', 'account:4'
      details TEXT,                              -- human-readable summary
      revision_id INTEGER,                       -- the revision a 'revision.*' entry is about
      data TEXT,                                 -- JSON specifics, e.g. each field's old and new text
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tags (see server/data/tags.json). Categories describe what kind of shop it
  // is; stock tags (in groups) describe what it sells. sort_order is the order
  // tags are shown in (from their position in tags.json), not alphabetical.
  db.exec(`
    CREATE TABLE IF NOT EXISTS tag_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      color TEXT,                                -- fallback for its tags without a color
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,                        -- 'category' | 'stock'
      name TEXT NOT NULL COLLATE NOCASE,
      aliases TEXT NOT NULL DEFAULT '[]',        -- JSON list, e.g. ["White"]; searched like the name
      group_id INTEGER REFERENCES tag_groups(id),  -- stock tags only
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'approved',   -- 'approved' | 'pending' (a suggestion)
      suggested_by INTEGER REFERENCES accounts(id),
      suggested_for_shop_id INTEGER REFERENCES shops(id) ON DELETE SET NULL,  -- the shop a suggestion came from
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (kind, name)
    );

    -- Tags belong to a shop (like comments), so a closed shop keeps its tags.
    CREATE TABLE IF NOT EXISTS shop_tags (
      shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (shop_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS shop_tags_tag ON shop_tags(tag_id);

    -- Page revisions (Phase 3): one row per edit to a shop page, whether it's a
    -- player's suggestion waiting for review or an owner's/staff's direct edit.
    -- Together they're the plot's page history.
    -- Snapshots are JSON holding every shop field plus "tag_ids", so adding a
    -- shop field never changes this table:
    --   base, proposed: what the author saw and what they asked for. A field
    --     where they differ was changed by the author; where base differs from
    --     the shop at review time, someone else changed it too (a conflict).
    --   old_values, new_values: set when applied; the shop just before, and
    --     what was actually written (a reviewer may resolve conflicts or fix
    --     typos first). Undo puts old_values back.
    CREATE TABLE IF NOT EXISTS revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plot_id TEXT NOT NULL REFERENCES plots(id),
      shop_id INTEGER REFERENCES shops(id),   -- the shop being edited; NULL if the plot was empty
      action TEXT NOT NULL,                   -- 'edit' | 'open' (a new shop/owner here) | 'vacate' (plot is now empty)
      base TEXT,                              -- JSON snapshot, NULL if the plot was empty
      proposed TEXT,                          -- JSON snapshot, NULL for 'vacate'
      summary TEXT,                           -- optional "what did you change?"
      author_id INTEGER REFERENCES accounts(id), -- NULL once the author deletes their account
      direct INTEGER NOT NULL DEFAULT 0,      -- 1 = owner/staff edit, applied without review
      status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected' | 'withdrawn'
      reviewer_id INTEGER REFERENCES accounts(id),
      review_note TEXT,                       -- why it was rejected or changed; shown to the author
      old_values TEXT,                        -- JSON snapshot, set when applied
      new_values TEXT,                        -- JSON snapshot, set when applied
      part_of INTEGER REFERENCES revisions(id), -- a closure caused by another revision: its owner moved there (3.12)
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS revisions_plot ON revisions(plot_id, created_at);       -- a plot's history
    CREATE INDEX IF NOT EXISTS revisions_status ON revisions(status, created_at);      -- the review queue
    CREATE INDEX IF NOT EXISTS revisions_author ON revisions(author_id, status);       -- "my edits", pending cap
  `);

  // --- Migrations: bring older databases up to date. Each runs once. ---

  // Oct 2026: comments can belong to a linked account.
  addColumnIfMissing('comments', 'account_id', 'INTEGER REFERENCES accounts(id)');
  db.exec('CREATE INDEX IF NOT EXISTS comments_account ON comments(account_id)');

  // Oct 2026: moderator is a role. (Older databases keep an unused is_moderator column.)
  addColumnIfMissing('accounts', 'role', "TEXT NOT NULL DEFAULT 'player'");

  // Oct 2026: accounts can be banned.
  addColumnIfMissing('accounts', 'banned_at', 'TEXT');
  addColumnIfMissing('accounts', 'ban_reason', 'TEXT');

  // Oct 2026: a suggested tag remembers which shop it was suggested for.
  addColumnIfMissing('tags', 'suggested_for_shop_id', 'INTEGER REFERENCES shops(id) ON DELETE SET NULL');

  // Oct 2026: mod log entries keep the staff member's name.
  addColumnIfMissing('mod_log', 'actor_name', 'TEXT');

  // Nov 2026: revision entries link their revision and keep what changed (3.13).
  addColumnIfMissing('mod_log', 'revision_id', 'INTEGER');
  addColumnIfMissing('mod_log', 'data', 'TEXT');

  // Nov 2026: one shop per owner; a move closes the old shop as part of the new one (3.12).
  addColumnIfMissing('revisions', 'part_of', 'INTEGER REFERENCES revisions(id)');
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
// sessions, verify codes and the tag lists are left alone so a reload doesn't
// wipe them (shops' tag links go, since the shops are rebuilt).
export function dropSchema() {
  db.exec(`
    DROP TABLE IF EXISTS revisions;
    DROP TABLE IF EXISTS comment_votes;
    DROP TABLE IF EXISTS shop_tags;
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
