import { ipcMain, app, shell } from 'electron';
import path from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { discoverRecipients } from '../photos/discovery';
import { listAlbumPhotos, exportPhoto } from '../photos/adapter';
import { validateContact, getContactAddresses } from '../contacts/adapter';
import { processRecipient } from '../runner';
import {
  getRecipientSettings,
  upsertRecipientSettings,
  getSentPhotoIds,
  getSentCountForRecipient,
  getLastSentDate,
  getRecentSends,
  getAllSendsForCsv,
  clearTestData,
} from '../db/queries';
import {
  getSettings,
  updateSettings,
  getApiKey,
  setApiKey,
  getTestApiKey,
  setTestApiKey,
  getLiveApiKey,
  setLiveApiKey,
} from '../settings';
import { loadMessages, saveMessages } from '../messages';
import { testLobConnection } from '../lob/client';
import { getSchedulerStatus } from '../scheduler';
import type { RecipientStatus } from '../../shared/ipc-types';
import { addDays, formatISO } from 'date-fns';

export function registerIpcHandlers(): void {
  // ── recipients:list ────────────────────────────────────────────────────────
  ipcMain.handle('recipients:list', async (): Promise<RecipientStatus[]> => {
    const settings = getSettings();
    let recipients;
    try {
      recipients = await discoverRecipients();
    } catch {
      return [];
    }

    const statuses: RecipientStatus[] = await Promise.all(
      recipients.map(async (r) => {
      const recipientSettings = getRecipientSettings(r.id);
      const lastSentAt = getLastSentDate(r.id);
      const sentCount = getSentCountForRecipient(r.id);
      const sentIds = getSentPhotoIds(r.id);

      // Run photo list + contact validation in parallel
      const [photosResult, contactResult] = await Promise.allSettled([
        listAlbumPhotos(r.albumName),
        validateContact(r.fullName),
      ]);

      const allPhotos = photosResult.status === 'fulfilled' ? photosResult.value : [];
      const totalPhotos = allPhotos.length;
      const unsentPhotos = allPhotos.filter((p) => !sentIds.has(p.id)).length;

      // Determine address warning
      let addressError: string | null = null;
      if (contactResult.status === 'rejected') {
        addressError = String(contactResult.reason).replace(/^Error:\s*/i, '');
      } else if (!contactResult.value.found) {
        addressError = `"${r.fullName}" not found in Contacts.app`;
      } else if (contactResult.value.addressCount === 0) {
        addressError = `"${r.fullName}" has no mailing address in Contacts.app`;
      }

      let nextSendDate: string | null = null;
      if (lastSentAt && recipientSettings.active) {
        nextSendDate = formatISO(addDays(new Date(lastSentAt), recipientSettings.frequency_days), {
          representation: 'date',
        });
      }

      let status: RecipientStatus['status'] = 'ok';
      let errorMessage: string | undefined;
      if (!recipientSettings.active) {
        status = 'inactive';
      } else if (addressError) {
        status = 'error';
        errorMessage = addressError;
      } else if (unsentPhotos === 0) {
        status = 'empty';
      } else if (unsentPhotos <= settings.lowPhotoThreshold) {
        status = 'low';
      }

      return {
        id: r.id,
        fullName: r.fullName,
        albumName: r.albumName,
        sentAlbumName: r.sentAlbumName,
        settings: recipientSettings,
        lastSentAt,
        nextSendDate,
        sentCount,
        totalPhotos,
        unsentPhotos,
        errorMessage,
        status,
      };
    }),
    );

    return statuses;
  });

  // ── recipients:sendNow ─────────────────────────────────────────────────────
  ipcMain.handle(
    'recipients:sendNow',
    async (
      _e,
      { recipientId, photoId, message }: { recipientId: string; photoId?: string; message?: string },
    ) => {
      let recipients;
      try {
        recipients = await discoverRecipients();
      } catch (err) {
        return { success: false, error: String(err) };
      }

      const recipient = recipients.find((r) => r.id === recipientId);
      if (!recipient) return { success: false, error: `Recipient "${recipientId}" not found` };

      const recipientSettings = getRecipientSettings(recipientId);
      return processRecipient(recipient, recipientSettings, false, photoId, message || undefined);
    },
  );

  // ── recipients:updateSettings ──────────────────────────────────────────────
  ipcMain.handle('recipients:updateSettings', async (_e, data) => {
    return upsertRecipientSettings(data);
  });

  // ── recipients:getAddresses ────────────────────────────────────────────────
  ipcMain.handle(
    'recipients:getAddresses',
    async (_e, { contactName }: { contactName: string }) => {
      return getContactAddresses(contactName);
    },
  );

  // ── photos:listForRecipient ────────────────────────────────────────────────
  ipcMain.handle('photos:listForRecipient', async (_e, { albumName }: { albumName: string }) => {
    return listAlbumPhotos(albumName);
  });

  // ── photos:getThumbnail ────────────────────────────────────────────────────
  ipcMain.handle('photos:getThumbnail', async (_e, { photoId }: { photoId: string }) => {
    const thumbnailDir = path.join(app.getPath('userData'), 'thumbnails');
    mkdirSync(thumbnailDir, { recursive: true });

    const cacheFile = path.join(thumbnailDir, `${photoId.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`);

    if (existsSync(cacheFile)) {
      return readFileSync(cacheFile).toString('base64');
    }

    // Export full photo then resize
    const exported = await exportPhoto(photoId);
    const sharp = (await import('sharp')).default;

    const buffer = await sharp(exported)
      .rotate()
      .resize(200, 150, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 60 })
      .toBuffer();

    writeFileSync(cacheFile, buffer);

    // Clean up export
    try {
      const { unlinkSync, rmdirSync } = await import('fs');
      const pathModule = await import('path');
      unlinkSync(exported);
      try {
        rmdirSync(pathModule.dirname(exported));
      } catch {
        /* ok */
      }
    } catch {
      /* best effort */
    }

    return buffer.toString('base64');
  });

  // ── history:list ───────────────────────────────────────────────────────────
  ipcMain.handle('history:list', async (_e, { recipientId, limit } = {}) => {
    return getRecentSends(limit ?? 50, recipientId);
  });

  // ── settings:get ──────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => getSettings());

  // ── settings:set ──────────────────────────────────────────────────────────
  ipcMain.handle('settings:set', (_e, partial) => updateSettings(partial));

  // ── settings:getApiKey ────────────────────────────────────────────────────
  ipcMain.handle('settings:getApiKey', () => getApiKey());

  // ── settings:setApiKey ────────────────────────────────────────────────────
  ipcMain.handle('settings:setApiKey', (_e, { key }: { key: string }) => {
    setApiKey(key);
  });

  // ── settings:getTestApiKey ────────────────────────────────────────────────
  ipcMain.handle('settings:getTestApiKey', () => getTestApiKey());

  // ── settings:setTestApiKey ────────────────────────────────────────────────
  ipcMain.handle('settings:setTestApiKey', (_e, { key }: { key: string }) => {
    setTestApiKey(key);
  });

  // ── settings:getLiveApiKey ────────────────────────────────────────────────
  ipcMain.handle('settings:getLiveApiKey', () => getLiveApiKey());

  // ── settings:setLiveApiKey ────────────────────────────────────────────────
  ipcMain.handle('settings:setLiveApiKey', (_e, { key }: { key: string }) => {
    setLiveApiKey(key);
  });

  // ── app:clearTestData ─────────────────────────────────────────────────────
  ipcMain.handle('app:clearTestData', () => {
    const deletedCount = clearTestData();
    return { deletedCount };
  });

  // ── lob:testConnection ────────────────────────────────────────────────────
  ipcMain.handle('lob:testConnection', async () => {
    const key = getApiKey();
    if (!key) return { ok: false, error: 'No API key configured' };
    try {
      await testLobConnection(key);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ── messages:list ─────────────────────────────────────────────────────────
  ipcMain.handle('messages:list', () => loadMessages());

  // ── messages:save ─────────────────────────────────────────────────────────
  ipcMain.handle('messages:save', (_e, { messages }) => {
    saveMessages(messages);
  });

  // ── scheduler:status ──────────────────────────────────────────────────────
  ipcMain.handle('scheduler:status', () => getSchedulerStatus());

  // ── app:openDb ────────────────────────────────────────────────────────────
  ipcMain.handle('app:openDb', () => {
    shell.openPath(app.getPath('userData'));
  });

  // ── app:exportHistoryCsv ──────────────────────────────────────────────────
  ipcMain.handle('app:exportHistoryCsv', async () => {
    const rows = getAllSendsForCsv();
    const header =
      'id,recipient_id,photo_asset_id,sent_at,lob_postcard_id,status,greeting_used,proof_url,expected_delivery_date\n';
    const csvRows = rows
      .map((r) =>
        [
          r.id,
          r.recipient_id,
          r.photo_asset_id,
          r.sent_at,
          r.lob_postcard_id,
          r.status,
          `"${(r.greeting_used ?? '').replace(/"/g, '""')}"`,
          r.proof_url ?? '',
          r.expected_delivery_date ?? '',
        ].join(','),
      )
      .join('\n');

    const outPath = path.join(app.getPath('downloads'), `postorama-history-${Date.now()}.csv`);
    writeFileSync(outPath, header + csvRows, 'utf-8');
    shell.showItemInFolder(outPath);
    return { path: outPath };
  });
}
