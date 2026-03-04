import React, { useState } from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import {
  EllipsisHorizontalIcon,
  PaperAirplaneIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { RecipientStatus } from '../../shared/ipc-types';
import { useSendNow, useUpdateRecipientSettings } from '../hooks/useApi';
import Spinner from './shared/Spinner';

interface Props {
  recipient: RecipientStatus;
  onSelect: (r: RecipientStatus) => void;
  showToast: (type: 'success' | 'error', msg: string) => void;
}

export default function RecipientCard({
  recipient: r,
  onSelect,
  showToast,
}: Props): React.ReactElement {
  const sendNow = useSendNow();
  const updateSettings = useUpdateRecipientSettings();
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSending(true);
    try {
      const result = await sendNow.mutateAsync({ recipientId: r.id });
      if (result.success) {
        showToast('success', `Postcard sent to ${r.fullName}!`);
      } else {
        showToast('error', result.error ?? 'Send failed');
      }
    } catch (err) {
      showToast('error', String(err));
    } finally {
      setSending(false);
    }
  };

  const handleToggleActive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateSettings.mutateAsync({
        recipient_id: r.id,
        active: !r.settings.active,
      });
    } catch {
      // ignore
    }
  };

  const statusColor: Record<string, string> = {
    ok: 'var(--success)',
    low: 'var(--warning)',
    empty: 'var(--error)',
    inactive: 'var(--text-tertiary)',
    error: 'var(--error)',
  };

  return (
    <button
      onClick={() => onSelect(r)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:bg-white/5 active:bg-white/10"
    >
      {/* Status dot */}
      <div
        className="status-dot flex-shrink-0"
        style={{ background: statusColor[r.status] ?? 'var(--text-tertiary)' }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {r.fullName}
          </span>
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
            {r.unsentPhotos}/{r.totalPhotos}
          </span>
        </div>
        {r.status === 'error' && r.errorMessage ? (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--error)' }}>
            ⚠ {r.errorMessage}
          </p>
        ) : (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {r.lastSentAt
                ? `Sent ${formatDistanceToNow(parseISO(r.lastSentAt), { addSuffix: true })}`
                : 'Never sent'}
            </span>
            {r.nextSendDate && (
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                · next {r.nextSendDate}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={handleSend}
          disabled={sending || r.status === 'empty' || r.status === 'error'}
          className="p-1.5 rounded-md transition-colors disabled:opacity-40"
          style={{
            background: 'var(--accent)',
            color: 'white',
          }}
          title="Send now"
        >
          {sending ? <Spinner size={12} /> : <PaperAirplaneIcon className="w-3 h-3" />}
        </button>

        <Menu as="div" className="relative">
          <MenuButton
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <EllipsisHorizontalIcon className="w-4 h-4" />
          </MenuButton>
          <MenuItems
            className="absolute right-0 z-10 mt-1 w-36 rounded-lg shadow-lg py-1"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={() => onSelect(r)}
                  className="w-full text-left px-3 py-1.5 text-xs"
                  style={{
                    background: focus ? 'var(--bg-card)' : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  View Details
                </button>
              )}
            </MenuItem>
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={handleToggleActive}
                  className="w-full text-left px-3 py-1.5 text-xs"
                  style={{
                    background: focus ? 'var(--bg-card)' : 'transparent',
                    color: 'var(--text-primary)',
                  }}
                >
                  {r.settings.active ? 'Pause' : 'Resume'}
                </button>
              )}
            </MenuItem>
          </MenuItems>
        </Menu>

        <ChevronRightIcon className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    </button>
  );
}
