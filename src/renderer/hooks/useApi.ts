import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  RecipientStatus,
  SendHistoryRow,
  AppSettings,
  Message,
  SchedulerStatus,
  SendResult,
  RecipientSettings,
  PhotoAsset,
  Address,
} from '../../shared/ipc-types';

function invoke<T>(channel: string, data?: unknown): Promise<T> {
  return window.api.invoke(channel, data) as Promise<T>;
}

// ── Recipients ────────────────────────────────────────────────────────────────

export function useRecipients() {
  return useQuery<RecipientStatus[]>({
    queryKey: ['recipients'],
    queryFn: () => invoke('recipients:list'),
  });
}

export function useSendNow() {
  const qc = useQueryClient();
  return useMutation<SendResult, Error, { recipientId: string }>({
    mutationFn: (data) => invoke('recipients:sendNow', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipients'] });
      qc.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

export function useContactAddresses(contactName: string | undefined) {
  return useQuery<Array<{ label: string; address: Address }>>({
    queryKey: ['contactAddresses', contactName],
    queryFn: () => invoke('recipients:getAddresses', { contactName }),
    enabled: !!contactName,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateRecipientSettings() {
  const qc = useQueryClient();
  return useMutation<
    RecipientSettings,
    Error,
    Partial<RecipientSettings> & { recipient_id: string }
  >({
    mutationFn: (data) => invoke('recipients:updateSettings', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipients'] });
    },
  });
}

// ── Photos ────────────────────────────────────────────────────────────────────

export function usePhotos(albumName: string | undefined) {
  return useQuery<PhotoAsset[]>({
    queryKey: ['photos', albumName],
    queryFn: () => invoke('photos:listForRecipient', { albumName }),
    enabled: !!albumName,
  });
}

export function useThumbnail(photoId: string | undefined) {
  return useQuery<string>({
    queryKey: ['thumbnail', photoId],
    queryFn: () => invoke('photos:getThumbnail', { photoId }),
    enabled: !!photoId,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

// ── History ───────────────────────────────────────────────────────────────────

export function useHistory(recipientId?: string, limit = 50) {
  return useQuery<SendHistoryRow[]>({
    queryKey: ['history', recipientId, limit],
    queryFn: () => invoke('history:list', { recipientId, limit }),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => invoke('settings:get'),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<AppSettings, Error, Partial<AppSettings>>({
    mutationFn: (data) => invoke('settings:set', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

export function useApiKey() {
  return useQuery<string>({
    queryKey: ['apiKey'],
    queryFn: () => invoke('settings:getApiKey'),
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation<void, Error, { key: string }>({
    mutationFn: (data) => invoke('settings:setApiKey', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['apiKey'] });
    },
  });
}

export function useTestApiKey() {
  return useQuery<string>({
    queryKey: ['testApiKey'],
    queryFn: () => invoke('settings:getTestApiKey'),
  });
}

export function useSetTestApiKey() {
  const qc = useQueryClient();
  return useMutation<void, Error, { key: string }>({
    mutationFn: (data) => invoke('settings:setTestApiKey', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['testApiKey'] });
      qc.invalidateQueries({ queryKey: ['apiKey'] });
    },
  });
}

export function useLiveApiKey() {
  return useQuery<string>({
    queryKey: ['liveApiKey'],
    queryFn: () => invoke('settings:getLiveApiKey'),
  });
}

export function useSetLiveApiKey() {
  const qc = useQueryClient();
  return useMutation<void, Error, { key: string }>({
    mutationFn: (data) => invoke('settings:setLiveApiKey', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liveApiKey'] });
      qc.invalidateQueries({ queryKey: ['apiKey'] });
    },
  });
}

export function useClearTestData() {
  const qc = useQueryClient();
  return useMutation<{ deletedCount: number }, Error, void>({
    mutationFn: () => invoke('app:clearTestData'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['history'] });
      qc.invalidateQueries({ queryKey: ['recipients'] });
    },
  });
}

export function useTestLob() {
  return useMutation<{ ok: boolean; error?: string }, Error, void>({
    mutationFn: () => invoke('lob:testConnection'),
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function useMessages() {
  return useQuery<Message[]>({
    queryKey: ['messages'],
    queryFn: () => invoke('messages:list'),
  });
}

export function useSaveMessages() {
  const qc = useQueryClient();
  return useMutation<void, Error, { messages: Message[] }>({
    mutationFn: (data) => invoke('messages:save', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function useSchedulerStatus() {
  return useQuery<SchedulerStatus>({
    queryKey: ['schedulerStatus'],
    queryFn: () => invoke('scheduler:status'),
    refetchInterval: 60_000,
  });
}
