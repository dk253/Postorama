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

function buildBackHtml(size: '4x6' | '6x9'): string {
  const [w, h] = size === '4x6' ? ['6.25in', '4.25in'] : ['9.25in', '6.25in'];
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
    <div class="signature">{{signature}}</div>
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
}

export async function createPostcard(params: CreatePostcardParams): Promise<LobPostcardResult> {
  const frontHtml = buildFrontHtml(params.imageBase64, params.size);
  const backHtml = buildBackHtml(params.size);

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
): Promise<{ base64: string; widthPx: number; heightPx: number; sizeBytes: number }> {
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

  const { width: srcW = 0, height: srcH = 0 } = await sharp(workPath).rotate().metadata();
  const isPortrait = srcH > srcW;

  let image = sharp(workPath).rotate();
  if (isPortrait) image = image.rotate(90);

  const buffer = await image
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
