/**
 * Contacts.app adapter via Swift CNContactStore.
 * Adapted from Posty — fixes __dirname for Electron (CJS, packaged app).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { app } from 'electron';
import type { Address } from '../../shared/ipc-types';

const execFileAsync = promisify(execFile);

function getContactLookupBinaryPath(): string {
  // Packaged: binary lives in Contents/Resources/scripts/contact-lookup (via extraResources)
  // Dev: compiled to scripts/contact-lookup by `yarn build:swift`
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'contact-lookup');
  }
  return path.join(__dirname, '..', '..', '..', 'scripts', 'contact-lookup');
}

const COUNTRY_MAP: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  'u.s.a.': 'US',
  'u.s.': 'US',
  canada: 'CA',
  'united kingdom': 'GB',
  england: 'GB',
  'great britain': 'GB',
  australia: 'AU',
  germany: 'DE',
  france: 'FR',
  mexico: 'MX',
  japan: 'JP',
  china: 'CN',
  india: 'IN',
  brazil: 'BR',
  spain: 'ES',
  italy: 'IT',
  netherlands: 'NL',
  'new zealand': 'NZ',
  ireland: 'IE',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
};

function normaliseCountry(raw: string): string {
  if (!raw.trim()) return 'US';
  if (raw.length === 2) return raw.toUpperCase();
  return COUNTRY_MAP[raw.toLowerCase().trim()] ?? raw;
}

async function runSwift(args: string[]): Promise<string> {
  const binaryPath = getContactLookupBinaryPath();
  try {
    const { stdout } = await execFileAsync(binaryPath, args, {
      timeout: 30_000,
    });
    return stdout.trim();
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stderr = String(e.stderr ?? '').trim();
    const stdout = String(e.stdout ?? '').trim();
    const detail = stderr || stdout || e.message || '';
    throw new Error(`Contacts lookup failed: ${detail}`);
  }
}

interface RawContactAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  label: string;
}

interface RawContactResult {
  found: boolean;
  error?: string;
  addresses?: RawContactAddress[];
  name?: string;
}

interface RawValidateResult {
  found: boolean;
  error?: string;
  addressCount?: number;
  preferredLabel?: string;
}

function parseStreet(street: string): { address1: string; address2?: string } {
  const lines = street
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const address1 = lines[0] ?? '';
  const address2 = lines[1];
  return address2 ? { address1, address2 } : { address1 };
}

/**
 * When Contacts.app stores city/state/zip inside the street block (common with
 * manually-typed or imported contacts), CNPostalAddress returns an empty city.
 * Detect the pattern "City, ST ZIP" on the last street line and pull it out.
 */
function normalizeRawAddress(raw: RawContactAddress): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  let { street, city, state, zip } = raw;

  if (!city.trim()) {
    const lines = street
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1) {
      const lastLine = lines[lines.length - 1]!;
      const m = lastLine.match(/^(.+),\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (m) {
        street = lines.slice(0, -1).join('\n');
        city = m[1]!.trim();
        if (!state.trim()) state = m[2]!.toUpperCase();
        if (!zip.trim()) zip = m[3]!;
      }
    }
  }

  return { street, city, state, zip };
}

function pickPreferredAddress(addresses: RawContactAddress[]): RawContactAddress | null {
  if (addresses.length === 0) return null;
  for (const label of ['home', 'other']) {
    const match = addresses.find((a) => a.label.toLowerCase() === label);
    if (match) return match;
  }
  return addresses[0] ?? null;
}

export async function lookupContactAddress(
  contactName: string,
  preferredLabel?: string | null,
): Promise<Address> {
  const output = await runSwift([contactName]);
  const result = JSON.parse(output) as RawContactResult;

  if (result.error === 'access_denied') {
    throw new Error(
      'Contacts.app access denied. Go to System Settings → Privacy & Security → Contacts.',
    );
  }

  if (!result.found) {
    throw new Error(`Contact not found: "${contactName}"`);
  }

  const addresses = result.addresses ?? [];
  let preferred: RawContactAddress | null = null;
  if (preferredLabel) {
    preferred =
      addresses.find((a) => a.label.toLowerCase() === preferredLabel.toLowerCase()) ?? null;
  }
  if (!preferred) preferred = pickPreferredAddress(addresses);
  if (!preferred) {
    throw new Error(`Contact "${contactName}" has no addresses.`);
  }

  const norm = normalizeRawAddress(preferred);
  const { address1, address2 } = parseStreet(norm.street);
  if (!address1) throw new Error(`Contact "${contactName}" has an address with no street.`);

  return {
    address1,
    ...(address2 ? { address2 } : {}),
    city: norm.city,
    state: norm.state,
    postalCode: norm.zip,
    country: normaliseCountry(preferred.country),
  };
}

export async function getContactAddresses(
  contactName: string,
): Promise<Array<{ label: string; address: Address }>> {
  const output = await runSwift([contactName]);
  const result = JSON.parse(output) as RawContactResult;

  if (result.error === 'access_denied') {
    throw new Error('Contacts.app access denied.');
  }

  if (!result.found) return [];

  return (result.addresses ?? [])
    .map((raw) => {
      const norm = normalizeRawAddress(raw);
      const { address1, address2 } = parseStreet(norm.street);
      if (!address1) return null;
      return {
        label: raw.label || 'other',
        address: {
          address1,
          ...(address2 ? { address2 } : {}),
          city: norm.city,
          state: norm.state,
          postalCode: norm.zip,
          country: normaliseCountry(raw.country),
        } as Address,
      };
    })
    .filter((a): a is { label: string; address: Address } => a !== null);
}

export async function validateContact(
  contactName: string,
): Promise<{ found: boolean; addressCount: number; preferredLabel: string }> {
  const output = await runSwift([contactName, 'validate']);
  const result = JSON.parse(output) as RawValidateResult;

  if (result.error === 'access_denied') {
    throw new Error('Contacts.app access denied.');
  }

  return {
    found: result.found,
    addressCount: result.addressCount ?? 0,
    preferredLabel: result.preferredLabel ?? '',
  };
}
