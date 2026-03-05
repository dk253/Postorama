import React, { useState, useEffect } from 'react';
import { XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { useUpdateRecipientSettings, useSendNow, useHistory, useContactAddresses } from '../hooks/useApi';
import PhotoBrowser from './PhotoBrowser';
import Spinner from './shared/Spinner';
import type { RecipientStatus } from '../../shared/ipc-types';

interface Props {
  recipient: RecipientStatus;
  onClose: () => void;
  showToast: (type: 'success' | 'error', msg: string) => void;
}

function useSentPhotoIds(recipientId: string): Set<string> {
  const { data: history } = useHistory(recipientId, 200);
  if (!history) return new Set();
  return new Set(history.filter((h) => h.status === 'sent').map((h) => h.photo_asset_id));
}

export default function RecipientDetail({
  recipient: r,
  onClose,
  showToast,
}: Props): React.ReactElement {
  const updateSettings = useUpdateRecipientSettings();
  const sendNow = useSendNow();
  const sentPhotoIds = useSentPhotoIds(r.id);

  const [savedSettings, setSavedSettings] = useState(r.settings);
  const [greetingOverride, setGreetingOverride] = useState(r.settings.greeting_override ?? '');
  const [signatureOverride, setSignatureOverride] = useState(r.settings.signature_override ?? '');
  const [frequencyDays, setFrequencyDays] = useState(r.settings.frequency_days);
  const [size, setSize] = useState<'4x6' | '6x9' | ''>(r.settings.postcard_size ?? '');
  const [notes, setNotes] = useState(r.settings.notes ?? '');
  const [active, setActive] = useState(r.settings.active);
  const [scheduled, setScheduled] = useState(r.settings.scheduled);
  const [addressLabel, setAddressLabel] = useState<string | null>(r.settings.address_label);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingPhotoId, setPendingPhotoId] = useState<string | undefined>(undefined);
  const [composeOpen, setComposeOpen] = useState(false);
  const [personalNote, setPersonalNote] = useState('');

  const isDirty =
    greetingOverride !== (savedSettings.greeting_override ?? '') ||
    signatureOverride !== (savedSettings.signature_override ?? '') ||
    frequencyDays !== savedSettings.frequency_days ||
    size !== (savedSettings.postcard_size ?? '') ||
    notes !== (savedSettings.notes ?? '') ||
    active !== savedSettings.active ||
    scheduled !== savedSettings.scheduled ||
    addressLabel !== savedSettings.address_label;

  const { data: contactAddresses, isLoading: addressesLoading } = useContactAddresses(r.fullName);

  useEffect(() => {
    setSavedSettings(r.settings);
    setGreetingOverride(r.settings.greeting_override ?? '');
    setSignatureOverride(r.settings.signature_override ?? '');
    setFrequencyDays(r.settings.frequency_days);
    setSize(r.settings.postcard_size ?? '');
    setNotes(r.settings.notes ?? '');
    setActive(r.settings.active);
    setScheduled(r.settings.scheduled);
    setAddressLabel(r.settings.address_label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id]); // intentionally reset only when the selected recipient changes

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings.mutateAsync({
        recipient_id: r.id,
        greeting_override: greetingOverride.trim() || null,
        signature_override: signatureOverride.trim() || null,
        frequency_days: frequencyDays,
        postcard_size: size || null,
        notes: notes.trim() || null,
        active,
        scheduled,
        address_label: addressLabel,
      });
      setSavedSettings(updated);
      showToast('success', 'Settings saved');
    } catch (err) {
      showToast('error', String(err));
    } finally {
      setSaving(false);
    }
  };

  const openCompose = (photoId?: string) => {
    setPendingPhotoId(photoId);
    setPersonalNote('');
    setComposeOpen(true);
  };

  const handleConfirmSend = async () => {
    setComposeOpen(false);
    setSending(true);
    try {
      const result = await sendNow.mutateAsync({
        recipientId: r.id,
        photoId: pendingPhotoId,
        message: personalNote.trim() || undefined,
      });
      if (result.success) {
        showToast('success', `Sent to ${r.fullName}!`);
      } else {
        showToast('error', result.error ?? 'Send failed');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={
        { background: 'var(--bg)', zIndex: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties
      }
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <button onClick={onClose} style={{ color: 'var(--text-secondary)' }}>
          <XMarkIcon className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {r.fullName}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            Postorama / {r.albumName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded"
            />
            <span style={{ color: 'var(--text-secondary)' }}>Active</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={scheduled}
              onChange={(e) => setScheduled(e.target.checked)}
              className="rounded"
            />
            <span style={{ color: 'var(--text-secondary)' }}>Scheduled</span>
          </label>
          <button
            onClick={() => openCompose()}
            disabled={sending}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            {sending ? <Spinner size={12} /> : <PaperAirplaneIcon className="w-3 h-3" />}
            Send
          </button>
        </div>
      </div>

      {/* Compose panel — slides up over the body when sending */}
      {composeOpen && (
        <div
          className="absolute inset-x-0 bottom-0 p-4 space-y-3 shadow-lg"
          style={{
            background: 'var(--bg-elevated)',
            borderTop: '1px solid var(--border)',
            zIndex: 20,
          }}
        >
          <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Personal note
          </p>
          <textarea
            value={personalNote}
            onChange={(e) => setPersonalNote(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Write a personal message… or leave blank to use a random message from your library."
            className="w-full rounded-md px-3 py-2 text-xs resize-none"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setComposeOpen(false)}
              className="px-3 py-1.5 rounded-md text-xs font-medium"
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSend}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              <PaperAirplaneIcon className="w-3 h-3" />
              Send
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Greeting + Signature */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Greeting
              </label>
              <input
                type="text"
                value={greetingOverride}
                onChange={(e) => setGreetingOverride(e.target.value)}
                placeholder={`Dear ${r.fullName.split(' ')[0]},`}
                className="w-full rounded-md px-3 py-1.5 text-xs"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Signature
              </label>
              <input
                type="text"
                value={signatureOverride}
                onChange={(e) => setSignatureOverride(e.target.value)}
                placeholder="Love, Me"
                className="w-full rounded-md px-3 py-1.5 text-xs"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Mailing address */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Mailing Address
            </label>
            {addressesLoading ? (
              <Spinner size={12} />
            ) : !contactAddresses || contactAddresses.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--error)' }}>
                No address found in Contacts.app
              </p>
            ) : (
              <div className="space-y-1.5">
                {contactAddresses.length > 1 && (
                  <select
                    value={addressLabel ?? contactAddresses[0]!.label}
                    onChange={(e) => setAddressLabel(e.target.value)}
                    className="w-full rounded-md px-3 py-1.5 text-xs"
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {contactAddresses.map((a) => (
                      <option key={a.label} value={a.label}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
                {(() => {
                  const effectiveLabel = addressLabel ?? contactAddresses[0]!.label;
                  const entry =
                    contactAddresses.find((a) => a.label === effectiveLabel) ??
                    contactAddresses[0]!;
                  const addr = entry.address;
                  return (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                      {addr.address1}
                      {addr.address2 ? `, ${addr.address2}` : ''}
                      <br />
                      {addr.city}, {addr.state} {addr.postalCode}
                    </p>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Frequency + Size */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Frequency (days)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={frequencyDays}
                onChange={(e) => setFrequencyDays(Number(e.target.value))}
                className="w-full rounded-md px-3 py-1.5 text-xs"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1"
                style={{ color: 'var(--text-secondary)' }}
              >
                Postcard size
              </label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as '4x6' | '6x9' | '')}
                className="w-full rounded-md px-3 py-1.5 text-xs"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Default</option>
                <option value="4x6">4x6</option>
                <option value="6x9">6x9</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              className="block text-xs font-medium mb-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md px-3 py-1.5 text-xs resize-none"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              placeholder="Private notes…"
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2 rounded-md text-xs font-medium disabled:opacity-50"
            style={
              isDirty
                ? { background: 'var(--accent)', color: 'white' }
                : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
            }
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>

          {/* Photo browser */}
          <div>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Photos · {r.unsentPhotos} unsent / {r.totalPhotos} total
            </p>
            <PhotoBrowser
              albumName={r.albumName}
              recipientId={r.id}
              sentPhotoIds={sentPhotoIds}
              nextPhotoId={r.settings.next_photo_id}
              onSendNow={openCompose}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
