import { BrowserWindow } from 'electron';
import { discoverRecipients } from './photos/discovery';
import { getRecipientSettings } from './db/queries';
import { processRecipient } from './runner';
import { getSettings } from './settings';
import type { SchedulerStatus } from '../shared/ipc-types';

const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let _timer: ReturnType<typeof setInterval> | null = null;
let _lastRunAt: string | null = null;
let _nextRunAt: string | null = null;
let _activeRecipientCount = 0;
let _running = false;

function isWithinSendWindow(start: number, end: number): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= start && hour < end;
}

function isDue(lastSentAt: string | null, frequencyDays: number): boolean {
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt).getTime();
  const now = Date.now();
  const daysElapsed = (now - last) / (1000 * 60 * 60 * 24);
  return daysElapsed >= frequencyDays;
}

async function tick(): Promise<void> {
  const settings = getSettings();
  if (settings.pauseAll) return;

  if (!isWithinSendWindow(settings.schedulerWindowStart, settings.schedulerWindowEnd)) return;

  _lastRunAt = new Date().toISOString();
  _nextRunAt = new Date(Date.now() + TICK_INTERVAL_MS).toISOString();

  let recipients;
  try {
    recipients = await discoverRecipients();
  } catch {
    return;
  }

  const active = recipients.filter((r) => {
    const s = getRecipientSettings(r.id);
    return s.active;
  });

  _activeRecipientCount = active.length;

  for (const recipient of active) {
    const recipientSettings = getRecipientSettings(recipient.id);
    if (!recipientSettings.active) continue;

    // Lazy import to avoid circular
    const { getLastSentDate } = await import('./db/queries');
    const lastSent = getLastSentDate(recipient.id);
    if (!isDue(lastSent, recipientSettings.frequency_days)) continue;

    try {
      await processRecipient(recipient, recipientSettings);
    } catch (err) {
      console.error('Scheduler error for', recipient.id, err);
    }
  }

  // Notify renderer to refresh
  broadcastTick();
}

function broadcastTick(): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('scheduler:tick');
  });
}

export function startScheduler(): void {
  if (_timer) return;
  _nextRunAt = new Date(Date.now() + TICK_INTERVAL_MS).toISOString();
  _timer = setInterval(() => {
    tick().catch(console.error);
  }, TICK_INTERVAL_MS);
}

export function stopScheduler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

export function getSchedulerStatus(): SchedulerStatus {
  const settings = getSettings();
  return {
    running: _timer !== null,
    lastRunAt: _lastRunAt,
    nextRunAt: _nextRunAt,
    activeRecipientCount: _activeRecipientCount,
    pauseAll: settings.pauseAll,
  };
}
