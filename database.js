const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db;

function initDatabase() {
  // Always use a fixed path so app name changes don't create new databases
  const userDataDir = path.join(app.getPath('appData'), 'the-queue');
  if (!require('fs').existsSync(userDataDir)) {
    require('fs').mkdirSync(userDataDir, { recursive: true });
  }
  const dbPath = path.join(userDataDir, 'the-queue.db');
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'movie',
      status TEXT NOT NULL DEFAULT 'queued',
      priority INTEGER NOT NULL DEFAULT 3,
      genre TEXT,
      platform TEXT,
      notes TEXT,
      url TEXT,
      rating INTEGER,
      image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      watched INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_queue_type ON queue_items(type);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_items(status);
    CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_items(priority);
  `);

  // Migrate: add sort_order and watched columns if they don't exist
  const columns = db.prepare("PRAGMA table_info(queue_items)").all().map(c => c.name);
  if (!columns.includes('sort_order')) {
    db.exec('ALTER TABLE queue_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
    // Initialize sort_order based on existing row order
    const rows = db.prepare('SELECT id FROM queue_items ORDER BY created_at ASC').all();
    const update = db.prepare('UPDATE queue_items SET sort_order = ? WHERE id = ?');
    rows.forEach((row, i) => update.run(i, row.id));
  }
  if (!columns.includes('watched')) {
    db.exec('ALTER TABLE queue_items ADD COLUMN watched INTEGER NOT NULL DEFAULT 0');
  }

  return db;
}

function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
