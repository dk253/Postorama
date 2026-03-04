/**
 * Photos.app adapter — communicates with Photos.app via JXA (JavaScript for Automation).
 * Adapted from Posty for Electron (CommonJS, no .js extensions).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdirSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import type { PhotoAsset } from '../../shared/ipc-types';

const execFileAsync = promisify(execFile);

function jxaStr(value: string): string {
  return JSON.stringify(value);
}

async function runJXA(script: string): Promise<string> {
  const tmpFile = path.join(
    os.tmpdir(),
    `postorama-jxa-${Date.now()}-${Math.random().toString(36).slice(2)}.js`,
  );
  try {
    writeFileSync(tmpFile, script, 'utf-8');
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', tmpFile], {
      timeout: 120_000,
    });
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const detail = (e.stderr ? String(e.stderr) : (e.message ?? String(err))).trim();
    throw new Error(`Photos JXA error: ${detail}`);
  } finally {
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {
      // best effort
    }
  }
}

export async function listAllAlbumNames(): Promise<string[]> {
  const script = `
    const app = Application('Photos');
    app.includeStandardAdditions = true;
    const names = [];
    try {
      const albums = app.albums();
      for (let i = 0; i < albums.length; i++) {
        try { names.push(albums[i].name()); } catch (_) {}
      }
    } catch (_) {}
    JSON.stringify(names);
  `;
  const output = await runJXA(script);
  return JSON.parse(output) as string[];
}

export async function listAlbumPhotos(albumName: string): Promise<PhotoAsset[]> {
  const script = `
    const albumName = ${jxaStr(albumName)};
    const app = Application('Photos');
    app.includeStandardAdditions = true;

    function findAlbum(name) {
      try {
        const albums = app.albums();
        for (let i = 0; i < albums.length; i++) {
          try { if (albums[i].name() === name) return albums[i]; } catch (_) {}
        }
      } catch (_) {}
      try {
        const smart = app.smartAlbums();
        for (let i = 0; i < smart.length; i++) {
          try { if (smart[i].name() === name) return smart[i]; } catch (_) {}
        }
      } catch (_) {}
      return null;
    }

    const album = findAlbum(albumName);
    if (!album) throw new Error('Album not found: ' + albumName);

    const items = album.mediaItems();
    const results = [];
    for (let i = 0; i < items.length; i++) {
      try {
        const item = items[i];
        const id = item.id();
        const fname = item.filename();
        let captureDate = null;
        try {
          const d = item.date();
          if (d) captureDate = d.toISOString();
        } catch (_) {}
        results.push({ id, filename: fname, captureDate });
      } catch (_) {}
    }
    JSON.stringify(results);
  `;

  const output = await runJXA(script);
  return JSON.parse(output) as PhotoAsset[];
}

export async function exportPhoto(photoId: string): Promise<string> {
  const exportDir = path.join(
    os.tmpdir(),
    `postorama-export-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(exportDir, { recursive: true });

  const script = `
    const photoId  = ${jxaStr(photoId)};
    const exportDir = ${jxaStr(exportDir)};
    const app = Application('Photos');
    app.includeStandardAdditions = true;

    function findItem(id) {
      try {
        const item = app.mediaItems.byId(id);
        item.filename();
        return item;
      } catch (_) {}
      const all = app.mediaItems();
      for (let i = 0; i < all.length; i++) {
        try { if (all[i].id() === id) return all[i]; } catch (_) {}
      }
      return null;
    }

    const item = findItem(photoId);
    if (!item) throw new Error('Photo not found: ' + photoId);

    app.export([item], {
      to: Path(exportDir),
      usingOriginals: false,
    });

    item.filename();
  `;

  await runJXA(script);

  const files = readdirSync(exportDir);
  if (files.length === 0) {
    throw new Error(`Photos.app exported nothing to ${exportDir}.`);
  }

  const exportedFile = files[0];
  if (!exportedFile) throw new Error('Export dir is empty after export');
  return path.join(exportDir, exportedFile);
}

export async function addToSentAlbum(photoId: string, sentAlbumName: string): Promise<void> {
  const script = `
    const photoId       = ${jxaStr(photoId)};
    const sentAlbumName = ${jxaStr(sentAlbumName)};
    const app = Application('Photos');
    app.includeStandardAdditions = true;

    let sentAlbum = null;
    try {
      const albums = app.albums();
      for (let i = 0; i < albums.length; i++) {
        try {
          if (albums[i].name() === sentAlbumName) {
            sentAlbum = albums[i];
            break;
          }
        } catch (_) {}
      }
    } catch (_) {}

    if (!sentAlbum) {
      sentAlbum = app.make({ new: 'album' });
      sentAlbum.name = sentAlbumName;
    }

    function findItem(id) {
      try {
        const item = app.mediaItems.byId(id);
        item.filename();
        return item;
      } catch (_) {}
      const all = app.mediaItems();
      for (let i = 0; i < all.length; i++) {
        try { if (all[i].id() === id) return all[i]; } catch (_) {}
      }
      return null;
    }

    const item = findItem(photoId);
    if (!item) throw new Error('Photo not found: ' + photoId);

    app.add([item], { to: sentAlbum });
    'ok';
  `;

  await runJXA(script);
}

export async function setPhotoCaption(photoId: string, caption: string): Promise<boolean> {
  const script = `
    const photoId = ${jxaStr(photoId)};
    const caption = ${jxaStr(caption)};
    const app = Application('Photos');
    app.includeStandardAdditions = true;

    function findItem(id) {
      try {
        const item = app.mediaItems.byId(id);
        item.filename();
        return item;
      } catch (_) {}
      const all = app.mediaItems();
      for (let i = 0; i < all.length; i++) {
        try { if (all[i].id() === id) return all[i]; } catch (_) {}
      }
      return null;
    }

    const item = findItem(photoId);
    if (!item) throw new Error('Photo not found: ' + photoId);
    item.description = caption;
    'ok';
  `;

  try {
    await runJXA(script);
    return true;
  } catch {
    return false;
  }
}
