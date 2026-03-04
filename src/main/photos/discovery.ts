/**
 * Discovers postcard recipients by scanning Photos.app albums matching:
 *   "Postorama: <Contact Name>"
 */

import { listAllAlbumNames } from './adapter';

export interface Recipient {
  id: string;
  fullName: string;
  albumName: string;
  sentAlbumName: string;
}

export const ALBUM_PREFIX = 'Postorama: ';
export const SENT_SUFFIX = ' - Sent';

const ALBUM_PATTERN = /^Postorama: (.+)$/;

export function parseAlbumName(albumName: string): { fullName: string } | null {
  const match = ALBUM_PATTERN.exec(albumName);
  if (!match) return null;
  return {
    fullName: match[1]!.trim(),
  };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export async function discoverRecipients(): Promise<Recipient[]> {
  const allNames = await listAllAlbumNames();

  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  for (const albumName of allNames) {
    if (albumName.endsWith(SENT_SUFFIX)) continue;

    const parsed = parseAlbumName(albumName);
    if (!parsed) continue;

    const { fullName } = parsed;
    const id = slugify(fullName);

    if (seen.has(id)) {
      console.warn(`Warning: duplicate contact "${fullName}" (album "${albumName}") — skipping.`);
      continue;
    }
    seen.add(id);

    recipients.push({
      id,
      fullName,
      albumName,
      sentAlbumName: `${albumName}${SENT_SUFFIX}`,
    });
  }

  return recipients;
}
