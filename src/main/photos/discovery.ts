/**
 * Discovers postcard recipients by scanning albums inside the "Postorama"
 * Photos.app folder. Each album name is the recipient's full name.
 * Sent albums live in the "Postorama Sent" folder as "<Name> - Sent".
 */

import { listAlbumsInFolder, POSTORAMA_FOLDER } from './adapter';

export interface Recipient {
  id: string;
  fullName: string;
  albumName: string;
  sentAlbumName: string;
}

export const SENT_SUFFIX = ' - Sent';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function discoverRecipients(): Promise<Recipient[]> {
  const albumNames = await listAlbumsInFolder(POSTORAMA_FOLDER);

  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  for (const albumName of albumNames) {
    // Skip any sent albums that ended up in the main folder
    if (albumName.endsWith(SENT_SUFFIX)) continue;

    const fullName = albumName.trim();
    if (!fullName) continue;

    const id = slugify(fullName);

    if (seen.has(id)) {
      console.warn(`Warning: duplicate contact "${fullName}" — skipping.`);
      continue;
    }
    seen.add(id);

    recipients.push({
      id,
      fullName,
      albumName,
      sentAlbumName: `${fullName}${SENT_SUFFIX}`,
    });
  }

  return recipients;
}
