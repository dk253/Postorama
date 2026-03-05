import Store from 'electron-store';
import { app, safeStorage } from 'electron';
import type { AppSettings } from '../shared/ipc-types';

interface StoreSchema {
  returnAddress: AppSettings['returnAddress'];
  schedulerWindowStart: number;
  schedulerWindowEnd: number;
  schedulerWeekdayPref: number | null;
  pauseAll: boolean;
  defaultPostcardSize: '4x6' | '6x9';
  lowPhotoThreshold: number;
  useSandbox: boolean;
  launchAtLogin: boolean;
  encryptedApiKey: string;      // legacy — migrated to encryptedTestApiKey on first read
  encryptedTestApiKey: string;
  encryptedLiveApiKey: string;
}

const store = new Store<StoreSchema>({
  name: 'settings',
  defaults: {
    returnAddress: null,
    schedulerWindowStart: 9,
    schedulerWindowEnd: 17,
    schedulerWeekdayPref: null,
    pauseAll: false,
    defaultPostcardSize: '4x6',
    lowPhotoThreshold: 3,
    useSandbox: true,
    launchAtLogin: false,
    encryptedApiKey: '',
    encryptedTestApiKey: '',
    encryptedLiveApiKey: '',
  },
});

export function getSettings(): AppSettings {
  return {
    returnAddress: store.get('returnAddress'),
    schedulerWindowStart: store.get('schedulerWindowStart'),
    schedulerWindowEnd: store.get('schedulerWindowEnd'),
    schedulerWeekdayPref: store.get('schedulerWeekdayPref'),
    pauseAll: store.get('pauseAll'),
    defaultPostcardSize: store.get('defaultPostcardSize'),
    lowPhotoThreshold: store.get('lowPhotoThreshold'),
    useSandbox: store.get('useSandbox'),
    launchAtLogin: store.get('launchAtLogin'),
  };
}

export function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const keys = Object.keys(partial) as (keyof AppSettings)[];
  for (const key of keys) {
    const val = partial[key];
    if (val !== undefined) {
      store.set(key, val as never);
    }
  }

  if (partial.launchAtLogin !== undefined && app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: partial.launchAtLogin });
  }

  return getSettings();
}

// ── API key via safeStorage ───────────────────────────────────────────────────

function decryptKey(encrypted: string): string {
  if (!encrypted) return '';
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64')).trim();
  } catch {
    return '';
  }
}

function encryptKey(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (!trimmed) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this system.');
  }
  return safeStorage.encryptString(trimmed).toString('base64');
}

function migrateApiKey(): void {
  const legacy = store.get('encryptedApiKey');
  if (!legacy) return;
  if (store.get('encryptedTestApiKey') || store.get('encryptedLiveApiKey')) return;
  // Move legacy key to test slot (most likely was a test key)
  store.set('encryptedTestApiKey', legacy);
  store.set('encryptedApiKey', '');
}

export function getTestApiKey(): string {
  migrateApiKey();
  return decryptKey(store.get('encryptedTestApiKey'));
}

export function setTestApiKey(plaintext: string): void {
  store.set('encryptedTestApiKey', encryptKey(plaintext));
}

export function getLiveApiKey(): string {
  migrateApiKey();
  return decryptKey(store.get('encryptedLiveApiKey'));
}

export function setLiveApiKey(plaintext: string): void {
  store.set('encryptedLiveApiKey', encryptKey(plaintext));
}

/** Returns the active key based on the current useSandbox setting. */
export function getApiKey(): string {
  const settings = getSettings();
  return settings.useSandbox ? getTestApiKey() : getLiveApiKey();
}

/** @deprecated Use setTestApiKey / setLiveApiKey directly. */
export function setApiKey(plaintext: string): void {
  const settings = getSettings();
  if (settings.useSandbox) {
    setTestApiKey(plaintext);
  } else {
    setLiveApiKey(plaintext);
  }
}
