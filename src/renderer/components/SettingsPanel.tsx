import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import {
  useSettings,
  useUpdateSettings,
  useTestApiKey,
  useSetTestApiKey,
  useLiveApiKey,
  useSetLiveApiKey,
  useTestLob,
  useSchedulerStatus,
  useClearTestData,
} from '../hooks/useApi';
import Spinner from './shared/Spinner';
import { ToastContainer, useToast } from './shared/Toast';
import type { AppSettings } from '../../shared/ipc-types';

interface Props {
  onClose: () => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
    width: '100%',
  };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <p
        className="text-xs font-semibold mb-3 uppercase tracking-wide"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function SettingsPanel({ onClose }: Props): React.ReactElement {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const testLob = useTestLob();
  const { data: schedulerStatus } = useSchedulerStatus();

  const { toasts, showToast, dismissToast } = useToast();
  const { data: rawTestApiKey } = useTestApiKey();
  const { data: rawLiveApiKey } = useLiveApiKey();
  const setTestApiKey = useSetTestApiKey();
  const setLiveApiKey = useSetLiveApiKey();
  const clearTestData = useClearTestData();
  const [testKey, setTestKeyLocal] = useState('');
  const [liveKey, setLiveKeyLocal] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Local copies of all settings for editing
  const [localSettings, setLocalSettings] = useState<Partial<AppSettings>>({});

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (rawTestApiKey) setTestKeyLocal(rawTestApiKey);
  }, [rawTestApiKey]);

  useEffect(() => {
    if (rawLiveApiKey) setLiveKeyLocal(rawLiveApiKey);
  }, [rawLiveApiKey]);

  const set = (key: keyof AppSettings, value: unknown) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync(localSettings);
      if (testKey !== rawTestApiKey) {
        await setTestApiKey.mutateAsync({ key: testKey });
      }
      if (liveKey !== rawLiveApiKey) {
        await setLiveApiKey.mutateAsync({ key: liveKey });
      }
      showToast('success', 'Settings saved');
    } catch (err) {
      showToast('error', String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleClearTestData = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    try {
      const { deletedCount } = await clearTestData.mutateAsync();
      showToast('success', `Cleared ${deletedCount} test send${deletedCount !== 1 ? 's' : ''}`);
    } catch (err) {
      showToast('error', String(err));
    } finally {
      setConfirmClear(false);
    }
  };

  const handleTestLob = async () => {
    setTestResult(null);
    const result = await testLob.mutateAsync();
    setTestResult(result);
  };

  const handleOpenDb = () => {
    window.api.invoke('app:openDb');
  };

  const isDirty =
    !!settings &&
    (JSON.stringify(localSettings) !== JSON.stringify(settings) ||
      testKey !== (rawTestApiKey ?? '') ||
      liveKey !== (rawLiveApiKey ?? ''));

  const handleExportCsv = () => {
    window.api.invoke('app:exportHistoryCsv');
  };

  const handleOpenMessages = () => {
    window.api.invoke('app:openMessagesWindow');
  };

  const ra = localSettings.returnAddress;

  return (
    <div
      className="absolute inset-0 flex flex-col"
      style={
        { background: 'var(--bg)', zIndex: 20, WebkitAppRegion: 'no-drag' } as React.CSSProperties
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
        <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
          Settings
        </span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
          style={
            isDirty
              ? { background: 'var(--accent)', color: 'white' }
              : { background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
          }
        >
          {saving ? <Spinner size={12} /> : 'Save'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {/* Account */}
          <Section title="Account">
            {/* Mode switch */}
            <div
              className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {localSettings.useSandbox ? '🧪 Test mode' : '🚀 Live mode'}
              </span>
              <button
                onClick={() => set('useSandbox', !localSettings.useSandbox)}
                className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                style={{ background: localSettings.useSandbox ? 'var(--text-tertiary)' : 'var(--accent)' }}
              >
                <span
                  className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                  style={{ transform: localSettings.useSandbox ? 'translateX(2px)' : 'translateX(18px)' }}
                />
              </button>
            </div>
            {localSettings.useSandbox && (
              <p className="text-xs px-1" style={{ color: 'var(--warning, #f59e0b)' }}>
                ⚠ Sandbox mode — no real postcards will be sent
              </p>
            )}
            <Field label="Test API key (test_…)">
              <input
                type="password"
                value={testKey}
                onChange={(e) => setTestKeyLocal(e.target.value)}
                placeholder="test_xxxx…"
                style={inputStyle()}
              />
            </Field>
            <Field label="Live API key (live_…)">
              <input
                type="password"
                value={liveKey}
                onChange={(e) => setLiveKeyLocal(e.target.value)}
                placeholder="live_xxxx…"
                style={inputStyle()}
              />
            </Field>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestLob}
                disabled={testLob.isPending}
                className="px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-50"
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                {testLob.isPending ? <Spinner size={12} /> : 'Test connection'}
              </button>
              {testResult && (
                <div className="flex items-center gap-1 text-xs">
                  {testResult.ok ? (
                    <>
                      <CheckCircleIcon className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                      <span style={{ color: 'var(--success)' }}>Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircleIcon className="w-3.5 h-3.5" style={{ color: 'var(--error)' }} />
                      <span style={{ color: 'var(--error)' }}>{testResult.error ?? 'Failed'}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </Section>

          {/* Return Address */}
          <Section title="Return Address">
            <Field label="Name">
              <input
                type="text"
                value={ra?.name ?? ''}
                onChange={(e) => set('returnAddress', { ...ra, name: e.target.value })}
                style={inputStyle()}
              />
            </Field>
            <Field label="Address line 1">
              <input
                type="text"
                value={ra?.address1 ?? ''}
                onChange={(e) => set('returnAddress', { ...ra, address1: e.target.value })}
                style={inputStyle()}
              />
            </Field>
            <Field label="Address line 2">
              <input
                type="text"
                value={ra?.address2 ?? ''}
                onChange={(e) => set('returnAddress', { ...ra, address2: e.target.value })}
                style={inputStyle()}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="City">
                <input
                  type="text"
                  value={ra?.city ?? ''}
                  onChange={(e) => set('returnAddress', { ...ra, city: e.target.value })}
                  style={inputStyle()}
                />
              </Field>
              <Field label="State">
                <input
                  type="text"
                  maxLength={2}
                  value={ra?.state ?? ''}
                  onChange={(e) =>
                    set('returnAddress', { ...ra, state: e.target.value.toUpperCase() })
                  }
                  style={inputStyle()}
                />
              </Field>
              <Field label="Zip">
                <input
                  type="text"
                  value={ra?.postalCode ?? ''}
                  onChange={(e) => set('returnAddress', { ...ra, postalCode: e.target.value })}
                  style={inputStyle()}
                />
              </Field>
            </div>
          </Section>

          {/* Defaults */}
          <Section title="Defaults">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Postcard size">
                <select
                  value={localSettings.defaultPostcardSize ?? '4x6'}
                  onChange={(e) => set('defaultPostcardSize', e.target.value)}
                  style={inputStyle()}
                >
                  <option value="4x6">4x6</option>
                  <option value="6x9">6x9</option>
                </select>
              </Field>
              <Field label="Low photo threshold">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={localSettings.lowPhotoThreshold ?? 3}
                  onChange={(e) => set('lowPhotoThreshold', Number(e.target.value))}
                  style={inputStyle()}
                />
              </Field>
            </div>
          </Section>

          {/* Scheduler */}
          <Section title="Scheduler">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.pauseAll ?? false}
                onChange={(e) => set('pauseAll', e.target.checked)}
                className="rounded"
              />
              <span style={{ color: 'var(--text-primary)' }}>Pause all sends</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Send window start (hour)">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={localSettings.schedulerWindowStart ?? 9}
                  onChange={(e) => set('schedulerWindowStart', Number(e.target.value))}
                  style={inputStyle()}
                />
              </Field>
              <Field label="Send window end (hour)">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={localSettings.schedulerWindowEnd ?? 17}
                  onChange={(e) => set('schedulerWindowEnd', Number(e.target.value))}
                  style={inputStyle()}
                />
              </Field>
            </div>
            {schedulerStatus && (
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {schedulerStatus.lastRunAt
                  ? `Last run: ${new Date(schedulerStatus.lastRunAt).toLocaleTimeString()}`
                  : 'Not run yet'}
                {schedulerStatus.nextRunAt &&
                  ` · Next: ${new Date(schedulerStatus.nextRunAt).toLocaleTimeString()}`}
              </p>
            )}
          </Section>

          {/* App */}
          <Section title="App">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={localSettings.launchAtLogin ?? false}
                onChange={(e) => set('launchAtLogin', e.target.checked)}
                className="rounded"
              />
              <span style={{ color: 'var(--text-primary)' }}>Launch at login</span>
            </label>
            <button
              onClick={() => window.api.invoke('app:quit')}
              className="w-full py-2 rounded-md text-xs font-medium"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Quit Postorama
            </button>
          </Section>

          {/* Messages */}
          <Section title="Messages">
            <button
              onClick={handleOpenMessages}
              className="w-full py-2 rounded-md text-xs font-medium"
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              Open Message Library…
            </button>
          </Section>

          {/* Data */}
          <Section title="Data">
            <div className="flex gap-2">
              <button
                onClick={handleOpenDb}
                className="flex-1 py-2 rounded-md text-xs font-medium"
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                Open Data Folder
              </button>
              <button
                onClick={handleExportCsv}
                className="flex-1 py-2 rounded-md text-xs font-medium"
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                }}
              >
                Export History CSV
              </button>
            </div>
            <button
              onClick={handleClearTestData}
              disabled={clearTestData.isPending}
              className="w-full py-2 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
              style={{
                background: confirmClear ? 'var(--error, #ef4444)' : 'var(--bg-card)',
                color: confirmClear ? 'white' : 'var(--error, #ef4444)',
                border: '1px solid var(--error, #ef4444)',
              }}
              onBlur={() => setConfirmClear(false)}
            >
              {clearTestData.isPending
                ? 'Clearing…'
                : confirmClear
                  ? 'Click again to confirm'
                  : 'Clear Test Data'}
            </button>
          </Section>
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
