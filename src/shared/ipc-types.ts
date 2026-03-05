// All IPC channel names and shared interfaces between main and renderer.

export interface Address {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface ReturnAddress extends Address {
  name: string;
}

export interface PhotoAsset {
  id: string;
  filename: string;
  captureDate: string | null;
}

export interface Message {
  id?: string;
  text: string;
  type?: string;
  tags?: string[];
}

export interface RecipientSettings {
  recipient_id: string;
  frequency_days: number;
  active: boolean;
  scheduled: boolean;
  greeting_override: string | null;
  signature_override: string | null;
  next_photo_id: string | null;
  postcard_size: '4x6' | '6x9' | null;
  notes: string | null;
  address_label: string | null;
}

export interface RecipientStatus {
  id: string;
  fullName: string;
  albumName: string;
  sentAlbumName: string;
  /** From recipient_settings */
  settings: RecipientSettings;
  lastSentAt: string | null;
  nextSendDate: string | null;
  sentCount: number;
  totalPhotos: number;
  unsentPhotos: number;
  status: 'ok' | 'low' | 'empty' | 'inactive' | 'error';
  errorMessage?: string;
}

export interface SendHistoryRow {
  id: number;
  recipient_id: string;
  photo_asset_id: string;
  photo_filename_or_uuid: string;
  album_name: string;
  message_id_or_hash: string;
  greeting_used: string;
  sent_at: string;
  lob_postcard_id: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  proof_url: string | null;
  expected_delivery_date: string | null;
}

export interface AppSettings {
  returnAddress: ReturnAddress | null;
  schedulerWindowStart: number;
  schedulerWindowEnd: number;
  schedulerWeekdayPref: number | null;
  pauseAll: boolean;
  defaultPostcardSize: '4x6' | '6x9';
  lowPhotoThreshold: number;
  useSandbox: boolean;
  launchAtLogin: boolean;
}

export interface SchedulerStatus {
  running: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  activeRecipientCount: number;
  pauseAll: boolean;
}

export interface SendResult {
  success: boolean;
  lobId?: string;
  proofUrl?: string;
  expectedDeliveryDate?: string;
  error?: string;
}

// ── IPC Channel map ───────────────────────────────────────────────────────────

export type IpcChannels = {
  'recipients:list': { request: void; response: RecipientStatus[] };
  'recipients:getAddresses': {
    request: { contactName: string };
    response: Array<{ label: string; address: Address }>;
  };
  'recipients:sendNow': { request: { recipientId: string; photoId?: string; message?: string }; response: SendResult };
  'recipients:updateSettings': {
    request: Partial<RecipientSettings> & { recipient_id: string };
    response: RecipientSettings;
  };
  'photos:listForRecipient': { request: { albumName: string }; response: PhotoAsset[] };
  'photos:getThumbnail': { request: { photoId: string }; response: string }; // base64
  'history:list': {
    request: { recipientId?: string; limit?: number };
    response: SendHistoryRow[];
  };
  'settings:get': { request: void; response: AppSettings };
  'settings:set': { request: Partial<AppSettings>; response: AppSettings };
  'settings:getApiKey': { request: void; response: string };
  'settings:setApiKey': { request: { key: string }; response: void };
  'settings:getTestApiKey': { request: void; response: string };
  'settings:setTestApiKey': { request: { key: string }; response: void };
  'settings:getLiveApiKey': { request: void; response: string };
  'settings:setLiveApiKey': { request: { key: string }; response: void };
  'app:clearTestData': { request: void; response: { deletedCount: number } };
  'lob:testConnection': { request: void; response: { ok: boolean; error?: string } };
  'messages:list': { request: void; response: Message[] };
  'messages:save': { request: { messages: Message[] }; response: void };
  'scheduler:status': { request: void; response: SchedulerStatus };
  'app:openDb': { request: void; response: void };
  'app:exportHistoryCsv': { request: void; response: { path: string } };
};

export type IpcChannel = keyof IpcChannels;
