import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  // ── Schema v1 ─────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS send_history (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id           TEXT    NOT NULL,
      photo_asset_id         TEXT    NOT NULL,
      photo_filename_or_uuid TEXT    NOT NULL,
      album_name             TEXT    NOT NULL,
      message_id_or_hash     TEXT    NOT NULL,
      greeting_used          TEXT    NOT NULL,
      sent_at                TEXT    NOT NULL,
      lob_postcard_id        TEXT    NOT NULL,
      status                 TEXT    NOT NULL CHECK (status IN ('sent', 'failed')),
      error_message          TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_send_history_unique_sent
      ON send_history (recipient_id, photo_asset_id)
      WHERE status = 'sent';

    CREATE INDEX IF NOT EXISTS idx_send_history_recipient
      ON send_history (recipient_id);

    CREATE TABLE IF NOT EXISTS message_usage (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id       TEXT    NOT NULL,
      message_id_or_hash TEXT    NOT NULL,
      used_at            TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_message_usage_recipient
      ON message_usage (recipient_id);

    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER NOT NULL,
      applied_at TEXT    NOT NULL
    );
  `);

  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as {
    v: number | null;
  };
  const currentVersion = row?.v ?? 0;

  if (currentVersion < 1) {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      1,
      new Date().toISOString(),
    );
  }

  // ── Schema v2: message_type column ────────────────────────────────────────
  if (currentVersion < 2) {
    try {
      db.exec('ALTER TABLE message_usage ADD COLUMN message_type TEXT');
    } catch {
      // column may already exist if migrating from Posty
    }
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      2,
      new Date().toISOString(),
    );
  }

  // ── Schema v3: proof_url + expected_delivery_date on send_history ─────────
  if (currentVersion < 3) {
    try {
      db.exec('ALTER TABLE send_history ADD COLUMN proof_url TEXT');
    } catch {
      /* already exists */
    }
    try {
      db.exec('ALTER TABLE send_history ADD COLUMN expected_delivery_date TEXT');
    } catch {
      /* already exists */
    }
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      3,
      new Date().toISOString(),
    );
  }

  // ── Schema v4: recipient_settings table ───────────────────────────────────
  if (currentVersion < 4) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS recipient_settings (
        recipient_id      TEXT    PRIMARY KEY NOT NULL,
        frequency_days    INTEGER NOT NULL DEFAULT 30,
        active            INTEGER NOT NULL DEFAULT 1,
        greeting_override TEXT,
        next_photo_id     TEXT,
        postcard_size     TEXT CHECK (postcard_size IN ('4x6', '6x9')),
        notes             TEXT,
        updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      4,
      new Date().toISOString(),
    );
  }

  // ── Schema v5: signature_override on recipient_settings ───────────────────
  if (currentVersion < 5) {
    try {
      db.exec('ALTER TABLE recipient_settings ADD COLUMN signature_override TEXT');
    } catch {
      /* already exists */
    }
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      5,
      new Date().toISOString(),
    );
  }

  // ── Schema v6: sandbox flag on send_history ────────────────────────────────
  if (currentVersion < 6) {
    try {
      db.exec('ALTER TABLE send_history ADD COLUMN sandbox INTEGER NOT NULL DEFAULT 0');
    } catch {
      /* already exists */
    }
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      6,
      new Date().toISOString(),
    );
  }

  // ── Schema v7: address_label on recipient_settings ────────────────────────
  if (currentVersion < 7) {
    try {
      db.exec('ALTER TABLE recipient_settings ADD COLUMN address_label TEXT');
    } catch {
      /* already exists */
    }
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      7,
      new Date().toISOString(),
    );
  }
}
