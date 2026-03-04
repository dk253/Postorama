import BetterSqlite3 from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import { runMigrations } from './migrations';

let _db: BetterSqlite3.Database | null = null;

export function getDb(): BetterSqlite3.Database {
  if (_db) return _db;

  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });
  const dbPath = path.join(userData, 'postorama.db');

  _db = new BetterSqlite3(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  runMigrations(_db);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
