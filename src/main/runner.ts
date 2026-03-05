/**
 * Core send logic — adapted from Posty's runner.ts for Electron.
 * Supports per-recipient settings (greeting_override, next_photo_id, postcard_size).
 */

import { listAlbumPhotos, exportPhoto, addToSentAlbum, setPhotoCaption } from './photos/adapter';
import { lookupContactAddress } from './contacts/adapter';
import { createPostcard, processImageForPostcard, warnIfImageTooLarge } from './lob/client';
import {
  getSentPhotoIds,
  recordSend,
  getUsedMessageIds,
  recordMessageUsage,
  clearMessageUsageForRecipient,
  getLastMessageType,
  hashMessage,
  clearNextPhotoId,
} from './db/queries';
import { notifySent, notifyLowPhotos, notifyOutOfPhotos, notifyError } from './notifications';
import { getSettings, getApiKey } from './settings';
import { loadMessages } from './messages';
import { unlinkSync, existsSync, rmdirSync } from 'fs';
import path from 'path';
import type { Recipient } from './photos/discovery';
import type { RecipientSettings, Message, PhotoAsset, SendResult } from '../shared/ipc-types';

// ── Message selection ─────────────────────────────────────────────────────────

function selectMessage(messages: Message[], recipientId: string): Message {
  const usedIds = getUsedMessageIds(recipientId);

  let available = messages.filter((m) => {
    const key = m.id ?? hashMessage(m.text);
    return !usedIds.has(key);
  });

  if (available.length === 0) {
    clearMessageUsageForRecipient(recipientId);
    available = messages;
  }

  const lastType = getLastMessageType(recipientId);
  if (lastType) {
    const differentType = available.filter((m) => (m.type ?? null) !== lastType);
    if (differentType.length > 0) available = differentType;
  }

  const idx = Math.floor(Math.random() * available.length);
  return available[idx] ?? messages[0]!;
}

// ── Photo selection ───────────────────────────────────────────────────────────

function pickNewestUnsent(photos: PhotoAsset[], sentIds: Set<string>): PhotoAsset | null {
  const unsent = photos.filter((p) => !sentIds.has(p.id));
  if (unsent.length === 0) return null;

  unsent.sort((a, b) => {
    if (!a.captureDate && !b.captureDate) return 0;
    if (!a.captureDate) return 1;
    if (!b.captureDate) return -1;
    return new Date(b.captureDate).getTime() - new Date(a.captureDate).getTime();
  });

  return unsent[0] ?? null;
}

// ── Temp file cleanup ─────────────────────────────────────────────────────────

function cleanupExportDir(filePath: string): void {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
    const dir = path.dirname(filePath);
    try {
      rmdirSync(dir);
    } catch {
      /* non-empty is fine */
    }
  } catch {
    // best effort
  }
}

// ── Per-recipient processing ──────────────────────────────────────────────────

export async function processRecipient(
  recipient: Recipient,
  recipientSettings: RecipientSettings,
  force = false,
  overridePhotoId?: string,
  overrideMessage?: string,
): Promise<SendResult> {
  const settings = getSettings();
  const messages = loadMessages();
  const apiKey = getApiKey();

  if (!apiKey) {
    return { success: false, error: 'Lob API key not configured' };
  }

  // 1. Enumerate photos
  let allPhotos: PhotoAsset[];
  try {
    allPhotos = await listAlbumPhotos(recipient.albumName);
  } catch (err) {
    const msg = `Failed to list album "${recipient.albumName}": ${String(err)}`;
    notifyError(recipient.id, msg);
    return { success: false, error: msg };
  }

  // 2. Determine unsent photos
  const sentIds = force ? new Set<string>() : getSentPhotoIds(recipient.id);
  const unsentCount = allPhotos.filter((p) => !sentIds.has(p.id)).length;

  // 3. Low / empty warnings (skip for manual sends where user picked a specific photo)
  if (!overridePhotoId) {
    if (unsentCount === 0) {
      notifyOutOfPhotos(recipient);
      return { success: false, error: 'No unsent photos remaining' };
    }

    if (unsentCount <= settings.lowPhotoThreshold) {
      notifyLowPhotos(recipient, unsentCount);
    }
  }

  // 4. Pick photo: overridePhotoId > next_photo_id > newest unsent
  let selectedPhoto: PhotoAsset | null = null;
  if (overridePhotoId) {
    selectedPhoto = allPhotos.find((p) => p.id === overridePhotoId) ?? null;
    if (!selectedPhoto) {
      return { success: false, error: 'Selected photo not found in album' };
    }
  } else if (recipientSettings.next_photo_id) {
    selectedPhoto = allPhotos.find((p) => p.id === recipientSettings.next_photo_id) ?? null;
    if (selectedPhoto) {
      clearNextPhotoId(recipient.id);
    }
  }
  if (!selectedPhoto) {
    selectedPhoto = pickNewestUnsent(allPhotos, sentIds);
  }
  if (!selectedPhoto) {
    notifyOutOfPhotos(recipient);
    return { success: false, error: 'No unsent photos remaining' };
  }

  // 5. Pick message (or use personal note override)
  let messageKey: string;
  let messageText: string;
  let selectedMessageType: string | undefined;
  if (overrideMessage) {
    messageText = overrideMessage;
    messageKey = hashMessage(overrideMessage);
    selectedMessageType = undefined;
  } else {
    const selectedMessage = selectMessage(messages, recipient.id);
    messageKey = selectedMessage.id ?? hashMessage(selectedMessage.text);
    messageText =
      selectedMessage.type === 'quote'
        ? `Today's Quote: ${selectedMessage.text}`
        : selectedMessage.text;
    selectedMessageType = selectedMessage.type;
  }

  // 6. Effective greeting: "Dear <firstName>," by default, overridable per recipient
  const firstName = recipient.fullName.split(' ')[0] ?? recipient.fullName;
  const effectiveGreeting = recipientSettings.greeting_override ?? `Dear ${firstName},`;

  // 6b. Effective signature: "Love, <senderFirstName>" from return address by default
  const senderName = settings.returnAddress?.name ?? '';
  const senderFirstName = senderName.split(' ')[0] ?? senderName;
  const effectiveSignature = recipientSettings.signature_override ?? `Love, ${senderFirstName}`;

  // 7. Effective size
  const size: '4x6' | '6x9' = recipientSettings.postcard_size ?? settings.defaultPostcardSize;

  // 8. Resolve mailing address
  let mailingAddress: Awaited<ReturnType<typeof lookupContactAddress>>;
  try {
    mailingAddress = await lookupContactAddress(recipient.fullName, recipientSettings.address_label);
  } catch (err) {
    const msg = `Cannot resolve address for "${recipient.fullName}": ${String(err)}`;
    notifyError(recipient.id, msg);
    return { success: false, error: msg };
  }

  const returnAddress = settings.returnAddress;
  if (!returnAddress) {
    return { success: false, error: 'Return address not configured' };
  }

  // 9. Export photo
  let exportedPath: string | null = null;
  try {
    exportedPath = await exportPhoto(selectedPhoto.id);
  } catch (err) {
    const msg = `Failed to export photo ${selectedPhoto.id}: ${String(err)}`;
    notifyError(recipient.id, msg);
    return { success: false, error: msg };
  }

  // 10. Resize and compress
  let imageData: Awaited<ReturnType<typeof processImageForPostcard>>;
  try {
    imageData = await processImageForPostcard(exportedPath, size);
    warnIfImageTooLarge(imageData.sizeBytes, console);
  } catch (err) {
    const msg = `Failed to process image: ${String(err)}`;
    notifyError(recipient.id, msg);
    cleanupExportDir(exportedPath);
    return { success: false, error: msg };
  }

  // 11. Create Lob postcard
  let lobResult: Awaited<ReturnType<typeof createPostcard>>;
  try {
    lobResult = await createPostcard({
      apiKey,
      recipientName: recipient.fullName,
      recipientAddress: mailingAddress,
      returnAddress,
      imageBase64: imageData.base64,
      message: messageText,
      greeting: effectiveGreeting,
      signature: effectiveSignature,
      size,
      useSandbox: settings.useSandbox,
    });
  } catch (err) {
    const msg = `Lob API failed: ${String(err)}`;
    notifyError(recipient.id, msg);
    recordSend({
      recipient_id: recipient.id,
      photo_asset_id: selectedPhoto.id,
      photo_filename_or_uuid: selectedPhoto.filename,
      album_name: recipient.albumName,
      message_id_or_hash: messageKey,
      greeting_used: effectiveGreeting,
      sent_at: new Date().toISOString(),
      lob_postcard_id: '',
      status: 'failed',
      sandbox: settings.useSandbox,
      error_message: String(err),
    });
    cleanupExportDir(exportedPath);
    return { success: false, error: msg };
  }

  // 12. Persist success to DB
  recordSend({
    recipient_id: recipient.id,
    photo_asset_id: selectedPhoto.id,
    photo_filename_or_uuid: selectedPhoto.filename,
    album_name: recipient.albumName,
    message_id_or_hash: messageKey,
    greeting_used: effectiveGreeting,
    sent_at: new Date().toISOString(),
    lob_postcard_id: lobResult.id,
    status: 'sent',
    sandbox: settings.useSandbox,
    proof_url: lobResult.url ?? null,
    expected_delivery_date: lobResult.expected_delivery_date ?? null,
  });

  // Only track library message usage — personal notes don't participate in rotation
  if (!overrideMessage) {
    recordMessageUsage(recipient.id, messageKey, selectedMessageType);
  }

  // 13. Mark in Photos.app
  try {
    await addToSentAlbum(selectedPhoto.id, recipient.sentAlbumName);
  } catch (err) {
    console.warn('Failed to add to sent album (non-fatal):', err);
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    await setPhotoCaption(selectedPhoto.id, `Sent to ${recipient.fullName} on ${today}`);
  } catch {
    // non-fatal
  }

  // 14. Notify success
  notifySent(recipient);

  cleanupExportDir(exportedPath);

  return {
    success: true,
    lobId: lobResult.id,
    proofUrl: lobResult.url,
    expectedDeliveryDate: lobResult.expected_delivery_date,
  };
}
