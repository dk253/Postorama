import { createHash } from 'crypto';
import { getDb } from './index';
import type { SendHistoryRow, RecipientSettings } from '../../shared/ipc-types';

// ── Send history ──────────────────────────────────────────────────────────────

export function getSentPhotoIds(recipientId: string): Set<string> {
  const db = getDb();
  const rows = db
    .prepare("SELECT photo_asset_id FROM send_history WHERE recipient_id = ? AND status = 'sent'")
    .all(recipientId) as Array<{ photo_asset_id: string }>;
  return new Set(rows.map((r) => r.photo_asset_id));
}

export interface RecordSendParams {
  recipient_id: string;
  photo_asset_id: string;
  photo_filename_or_uuid: string;
  album_name: string;
  message_id_or_hash: string;
  greeting_used: string;
  sent_at: string;
  lob_postcard_id: string;
  status: 'sent' | 'failed';
  sandbox?: boolean;
  error_message?: string | null;
  proof_url?: string | null;
  expected_delivery_date?: string | null;
}

export function recordSend(record: RecordSendParams): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO send_history
      (recipient_id, photo_asset_id, photo_filename_or_uuid, album_name,
       message_id_or_hash, greeting_used, sent_at, lob_postcard_id, status, sandbox, error_message,
       proof_url, expected_delivery_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    record.recipient_id,
    record.photo_asset_id,
    record.photo_filename_or_uuid,
    record.album_name,
    record.message_id_or_hash,
    record.greeting_used,
    record.sent_at,
    record.lob_postcard_id,
    record.status,
    record.sandbox ? 1 : 0,
    record.error_message ?? null,
    record.proof_url ?? null,
    record.expected_delivery_date ?? null,
  );
}

export function clearTestData(): number {
  const db = getDb();
  const result = db.prepare('DELETE FROM send_history WHERE sandbox = 1').run();
  db.prepare('DELETE FROM message_usage').run();
  return result.changes;
}

export function getLastSentDate(recipientId: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT sent_at FROM send_history WHERE recipient_id = ? AND status = 'sent' ORDER BY sent_at DESC LIMIT 1",
    )
    .get(recipientId) as { sent_at: string } | undefined;
  return row?.sent_at ?? null;
}

export function getSentCountForRecipient(recipientId: string): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as count FROM send_history WHERE recipient_id = ? AND status = 'sent'",
    )
    .get(recipientId) as { count: number };
  return row.count;
}

export function getRecentSends(limit = 50, recipientId?: string): SendHistoryRow[] {
  const db = getDb();
  if (recipientId) {
    return db
      .prepare('SELECT * FROM send_history WHERE recipient_id = ? ORDER BY sent_at DESC LIMIT ?')
      .all(recipientId, limit) as SendHistoryRow[];
  }
  return db
    .prepare('SELECT * FROM send_history ORDER BY sent_at DESC LIMIT ?')
    .all(limit) as SendHistoryRow[];
}

export function getAllSendsForCsv(): SendHistoryRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM send_history ORDER BY sent_at DESC').all() as SendHistoryRow[];
}

// ── Message rotation ──────────────────────────────────────────────────────────

export function getUsedMessageIds(recipientId: string): Set<string> {
  const db = getDb();
  const rows = db
    .prepare('SELECT message_id_or_hash FROM message_usage WHERE recipient_id = ?')
    .all(recipientId) as Array<{ message_id_or_hash: string }>;
  return new Set(rows.map((r) => r.message_id_or_hash));
}

export function recordMessageUsage(
  recipientId: string,
  messageIdOrHash: string,
  messageType?: string,
): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO message_usage (recipient_id, message_id_or_hash, message_type, used_at) VALUES (?, ?, ?, ?)',
  ).run(recipientId, messageIdOrHash, messageType ?? null, new Date().toISOString());
}

export function getLastMessageType(recipientId: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT message_type FROM message_usage WHERE recipient_id = ? ORDER BY used_at DESC LIMIT 1',
    )
    .get(recipientId) as { message_type: string | null } | undefined;
  return row?.message_type ?? null;
}

export function clearMessageUsageForRecipient(recipientId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM message_usage WHERE recipient_id = ?').run(recipientId);
}

// ── Recipient settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Omit<RecipientSettings, 'recipient_id'> = {
  frequency_days: 30,
  active: false,
  greeting_override: null,
  signature_override: null,
  next_photo_id: null,
  postcard_size: null,
  notes: null,
  address_label: null,
};

interface RecipientSettingsRow {
  recipient_id: string;
  frequency_days: number;
  active: number;
  greeting_override: string | null;
  signature_override: string | null;
  next_photo_id: string | null;
  postcard_size: '4x6' | '6x9' | null;
  notes: string | null;
  address_label: string | null;
}

export function getRecipientSettings(recipientId: string): RecipientSettings {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM recipient_settings WHERE recipient_id = ?')
    .get(recipientId) as RecipientSettingsRow | undefined;

  if (!row) return { ...DEFAULT_SETTINGS, recipient_id: recipientId };

  return {
    ...row,
    active: row.active === 1,
  };
}

export function upsertRecipientSettings(
  settings: Partial<RecipientSettings> & { recipient_id: string },
): RecipientSettings {
  const db = getDb();
  const existing = getRecipientSettings(settings.recipient_id);
  const merged = { ...existing, ...settings };

  db.prepare(
    `
    INSERT INTO recipient_settings
      (recipient_id, frequency_days, active, greeting_override, signature_override, next_photo_id, postcard_size, notes, address_label, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT (recipient_id) DO UPDATE SET
      frequency_days     = excluded.frequency_days,
      active             = excluded.active,
      greeting_override  = excluded.greeting_override,
      signature_override = excluded.signature_override,
      next_photo_id      = excluded.next_photo_id,
      postcard_size      = excluded.postcard_size,
      notes              = excluded.notes,
      address_label      = excluded.address_label,
      updated_at         = excluded.updated_at
  `,
  ).run(
    merged.recipient_id,
    merged.frequency_days,
    merged.active ? 1 : 0,
    merged.greeting_override ?? null,
    merged.signature_override ?? null,
    merged.next_photo_id ?? null,
    merged.postcard_size ?? null,
    merged.notes ?? null,
    merged.address_label ?? null,
  );

  return getRecipientSettings(settings.recipient_id);
}

export function clearNextPhotoId(recipientId: string): void {
  const db = getDb();
  db.prepare('UPDATE recipient_settings SET next_photo_id = NULL WHERE recipient_id = ?').run(
    recipientId,
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function hashMessage(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}
