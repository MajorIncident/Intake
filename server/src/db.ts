import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export type DB = Database.Database;

export interface DatabaseOptions {
  memory?: boolean;
  filename?: string;
}

const DEFAULT_DB_DIR = path.resolve(__dirname, '..', '..', 'data');
const DEFAULT_DB_FILE = path.join(DEFAULT_DB_DIR, 'intake.db');

function ensureDirectoryExists(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createDatabase(options: DatabaseOptions = {}): DB {
  const filename = options.memory ? ':memory:' : options.filename ?? DEFAULT_DB_FILE;
  if (filename !== ':memory:') {
    ensureDirectoryExists(filename);
  }
  const db = new Database(filename);
  applyMigrations(db);
  return db;
}

function applyMigrations(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_items (
      id TEXT PRIMARY KEY,
      analysis_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT,
      owner TEXT,
      role TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      due_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      dependencies TEXT,
      risk TEXT,
      change_control TEXT NOT NULL,
      verification TEXT NOT NULL,
      links TEXT,
      notes TEXT
    );
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_action_items_analysis_status_priority
      ON action_items (analysis_id, status, priority);
  `);
}
