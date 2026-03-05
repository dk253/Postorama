/**
 * Lob REST API client.
 * Adapted from Posty — identical logic, extended recordSend with proof_url/expected_delivery_date.
 */

import { unlinkSync, existsSync } from 'fs';
import { File } from 'node:buffer';
import type { Address, ReturnAddress } from '../../shared/ipc-types';

const LOB_BASE_URL = 'https://api.lob.com/v1';

export interface LobPostcardResult {
  id: string;
  url: string;
  expected_delivery_date?: string;
  thumbnails?: Array<{ small: string; medium: string; large: string }>;
}

export interface PhotoMeta {
  dateTaken?: string;
  location?: string;
}

function parseExifGps(exif: Buffer): { lat: number; lon: number } | undefined {
  // EXIF data begins with "Exif\0\0" followed by a TIFF block.
  if (exif.length < 8 || exif.slice(0, 6).toString('ascii') !== 'Exif\0\0') return undefined;
  const t = exif.slice(6); // TIFF block
  const le = t.slice(0, 2).toString('ascii') === 'II';
  const r16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const r32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  if (r16(2) !== 42) return undefined; // TIFF magic

  // Scan IFD0 for the GPS sub-IFD pointer (tag 0x8825).
  const ifd0 = r32(4);
  const ifd0Count = r16(ifd0);
  let gpsIfd: number | undefined;
  for (let i = 0; i < ifd0Count; i++) {
    const e = ifd0 + 2 + i * 12;
    if (r16(e) === 0x8825) { gpsIfd = r32(e + 8); break; }
  }
  if (gpsIfd === undefined) return undefined;

  // Read GPS IFD entries.
  const gpsCount = r16(gpsIfd);
  let latRef = 'N', lonRef = 'E';
  let lat: number | undefined, lon: number | undefined;

  const readRational3 = (dataOffset: number): number => {
    const deg = r32(dataOffset) / r32(dataOffset + 4);
    const min = r32(dataOffset + 8) / r32(dataOffset + 12);
    const sec = r32(dataOffset + 16) / r32(dataOffset + 20);
    return deg + min / 60 + sec / 3600;
  };

  for (let i = 0; i < gpsCount; i++) {
    const e = gpsIfd + 2 + i * 12;
    const tag = r16(e);
    if (tag === 0x0001) latRef = t.slice(e + 8, e + 9).toString('ascii');
    else if (tag === 0x0002) lat = readRational3(r32(e + 8));
    else if (tag === 0x0003) lonRef = t.slice(e + 8, e + 9).toString('ascii');
    else if (tag === 0x0004) lon = readRational3(r32(e + 8));
  }

  if (lat === undefined || lon === undefined) return undefined;
  return { lat: latRef === 'S' ? -lat : lat, lon: lonRef === 'W' ? -lon : lon };
}

async function reverseGeocode(lat: number, lon: number): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Postorama/1.0' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return undefined;
    const data = (await res.json()) as { address?: Record<string, string> };
    const addr = data.address;
    if (!addr) return undefined;
    const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.suburb;
    if (city && addr.country_code?.toUpperCase() === 'US') return `${city}, ${addr.state}`;
    if (city && addr.country) return `${city}, ${addr.country}`;
    if (addr.state && addr.country) return `${addr.state}, ${addr.country}`;
    return undefined;
  } catch {
    return undefined;
  }
}

async function extractPhotoMeta(filePath: string, sharp: typeof import('sharp')): Promise<PhotoMeta> {
  const result: PhotoMeta = {};

  // Extract capture date from raw EXIF buffer.
  // DateTimeOriginal is stored as ASCII "YYYY:MM:DD HH:MM:SS" — searchable without a parser.
  try {
    const { exif } = await sharp(filePath).metadata();
    if (exif) {
      const str = exif.toString('latin1');
      const m = str.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):\d{2}/);
      if (m) {
        const MONTHS = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December',
        ];
        const monthName = MONTHS[parseInt(m[2]) - 1] ?? m[2];
        const h = parseInt(m[4]);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        result.dateTaken = `${monthName} ${parseInt(m[3])}, ${m[1]} · ${h12}:${m[5]} ${period}`;
      }
    }
  } catch {
    // non-fatal
  }

  // Extract GPS from EXIF and reverse-geocode to a human-friendly place name.
  try {
    const { exif } = await sharp(filePath).metadata();
    if (exif) {
      const gps = parseExifGps(exif);
      if (gps) {
        result.location = await reverseGeocode(gps.lat, gps.lon);
      }
    }
  } catch {
    // non-fatal
  }

  return result;
}

// ── HTML templates ────────────────────────────────────────────────────────────

function buildFrontHtml(imageBase64: string, size: '4x6' | '6x9'): string {
  const [w, h] = size === '4x6' ? ['6.25in', '4.25in'] : ['9.25in', '6.25in'];
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${w}; height: ${h}; overflow: hidden; background: #000; }
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
</head>
<body>
<img src="data:image/jpeg;base64,${imageBase64}" alt="">
</body>
</html>`;
}

function buildBackHtml(size: '4x6' | '6x9', photoMetaText?: string): string {
  const [w, h] = size === '4x6' ? ['6.25in', '4.25in'] : ['9.25in', '6.25in'];
  const metaHtml = photoMetaText
    ? `\n    <div class="photo-meta">${photoMetaText}</div>`
    : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${w};
    height: ${h};
    font-family: Georgia, 'Times New Roman', serif;
    overflow: hidden;
  }
  .container {
    display: flex;
    width: 100%;
    height: 100%;
    padding: 0.3in;
    gap: 0.2in;
  }
  .message-side {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding-right: 0.2in;
    border-right: 1px solid #c8c8c8;
    overflow: hidden;
  }
  .salutation {
    font-size: 10.5pt;
    line-height: 1.65;
    color: #222;
    margin-bottom: 0.12in;
  }
  .message-text {
    font-size: 10.5pt;
    line-height: 1.65;
    color: #222;
    flex: 1;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .signature {
    font-size: 10.5pt;
    line-height: 1.65;
    color: #222;
    margin-top: 0.12in;
  }
  .photo-meta {
    font-size: 7pt;
    font-style: italic;
    line-height: 1.5;
    color: #aaa;
    margin-top: 0.08in;
  }
  .address-side {
    width: 3in;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
</head>
<body>
<div class="container">
  <div class="message-side">
    <div class="salutation">{{greeting}}</div>
    <div class="message-text">{{message}}</div>
    <div class="signature">{{signature}}</div>${metaHtml}
  </div>
  <div class="address-side">
    {{addressBlock}}
  </div>
</div>
</body>
</html>`;
}

// ── Lob API helpers ───────────────────────────────────────────────────────────

function lobAuthHeader(apiKey: string): string {
  return 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
}

interface LobAddress {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country?: string;
}

function toRecipientLobAddress(name: string, addr: Address): LobAddress {
  const out: LobAddress = {
    name,
    address_line1: addr.address1,
    address_city: addr.city,
    address_state: addr.state,
    address_zip: addr.postalCode,
    address_country: addr.country ?? 'US',
  };
  if (addr.address2) out.address_line2 = addr.address2;
  return out;
}

function toReturnLobAddress(addr: ReturnAddress): LobAddress {
  const out: LobAddress = {
    name: addr.name,
    address_line1: addr.address1,
    address_city: addr.city,
    address_state: addr.state,
    address_zip: addr.postalCode,
    address_country: addr.country ?? 'US',
  };
  if (addr.address2) out.address_line2 = addr.address2;
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CreatePostcardParams {
  apiKey: string;
  recipientName: string;
  recipientAddress: Address;
  returnAddress: ReturnAddress;
  imageBase64: string;
  message: string;
  greeting: string;
  signature: string;
  size: '4x6' | '6x9';
  useSandbox: boolean;
  photoMeta?: PhotoMeta;
}

export async function createPostcard(params: CreatePostcardParams): Promise<LobPostcardResult> {
  const frontHtml = buildFrontHtml(params.imageBase64, params.size);
  const metaParts: string[] = [];
  if (params.photoMeta?.dateTaken) metaParts.push(params.photoMeta.dateTaken);
  if (params.photoMeta?.location) metaParts.push(params.photoMeta.location);
  const photoMetaText = metaParts.length > 0 ? 'Photo: ' + metaParts.join('<br>') : undefined;
  const backHtml = buildBackHtml(params.size, photoMetaText);

  const form = new FormData();
  const to = toRecipientLobAddress(params.recipientName, params.recipientAddress);
  const from = toReturnLobAddress(params.returnAddress);

  for (const [k, v] of Object.entries(to)) {
    if (v !== undefined) form.append(`to[${k}]`, v);
  }
  for (const [k, v] of Object.entries(from)) {
    if (v !== undefined) form.append(`from[${k}]`, v);
  }
  form.append('front', new File([frontHtml], 'front.html', { type: 'text/html' }));
  form.append('back', new File([backHtml], 'back.html', { type: 'text/html' }));
  form.append('size', params.size);
  form.append('use_type', 'operational');
  form.append('merge_variables[message]', params.message);
  form.append('merge_variables[greeting]', params.greeting);
  form.append('merge_variables[signature]', params.signature);

  const res = await fetch(`${LOB_BASE_URL}/postcards`, {
    method: 'POST',
    headers: { Authorization: lobAuthHeader(params.apiKey) },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let detail = text;
    try {
      const json = JSON.parse(text) as { error?: { message?: string } };
      detail = json?.error?.message ?? text;
    } catch {
      // use raw text
    }
    throw new Error(`Lob API ${res.status}: ${detail}`);
  }

  return (await res.json()) as LobPostcardResult;
}

export async function testLobConnection(apiKey: string): Promise<void> {
  const res = await fetch(`${LOB_BASE_URL}/postcards?limit=1`, {
    headers: { Authorization: lobAuthHeader(apiKey) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Lob API ${res.status}: ${text}`);
  }
}

// ── Image processing ──────────────────────────────────────────────────────────

export async function processImageForPostcard(
  inputPath: string,
  size: '4x6' | '6x9',
): Promise<{ base64: string; widthPx: number; heightPx: number; sizeBytes: number; photoMeta: PhotoMeta }> {
  const sharp = (await import('sharp')).default;

  const [targetW, targetH] = size === '4x6' ? [1875, 1275] : [2775, 1875];

  let workPath = inputPath;
  const ext = inputPath.split('.').pop()?.toLowerCase() ?? '';
  if (['heic', 'heif'].includes(ext)) {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const jpgPath = inputPath.replace(/\.[^.]+$/, '_converted.jpg');
    await execFileAsync('sips', ['-s', 'format', 'jpeg', inputPath, '--out', jpgPath]);
    workPath = jpgPath;
  }

  // Extract EXIF metadata before Sharp pipelines strip it from the buffer.
  const photoMeta = await extractPhotoMeta(workPath, sharp);

  // Probe: apply EXIF auto-rotation, then read actual pixel dimensions.
  // Pass 1: apply EXIF auto-rotation and capture corrected pixel dimensions.
  // Chaining .rotate() + .rotate(90) in a single Sharp pipeline cancels out, so two passes are required.
  const { data: normalized, info: normInfo } = await sharp(workPath)
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const isPortrait = normInfo.height > normInfo.width;

  // Pass 2: rotate portrait → landscape if needed, then resize to postcard dimensions
  const pipeline = sharp(normalized);
  const buffer = await (isPortrait ? pipeline.rotate(90) : pipeline)
    .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88 })
    .toBuffer();

  if (workPath !== inputPath && existsSync(workPath)) {
    try {
      unlinkSync(workPath);
    } catch {
      /* ignore */
    }
  }

  return {
    base64: buffer.toString('base64'),
    widthPx: targetW,
    heightPx: targetH,
    sizeBytes: buffer.byteLength,
    photoMeta,
  };
}

export function warnIfImageTooLarge(
  sizeBytes: number,
  logger: { warn: (m: string) => void },
): void {
  const base64Size = Math.ceil(sizeBytes * 1.34);
  if (base64Size > 4_500_000) {
    logger.warn(
      `Estimated front HTML size is ${(base64Size / 1_000_000).toFixed(1)} MB — ` +
        'consider reducing JPEG quality if Lob rejects the request.',
    );
  }
}
