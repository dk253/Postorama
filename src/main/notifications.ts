import { Notification } from 'electron';
import type { Recipient } from './photos/discovery';

const APP_TITLE = 'Postorama';

function notify(title: string, body: string): void {
  try {
    new Notification({ title, body, silent: false }).show();
  } catch {
    // Notifications are best-effort
  }
}

export function notifySent(recipient: Recipient): void {
  notify(`${APP_TITLE} — Sent`, `Postcard sent to ${recipient.fullName}`);
}

export function notifyLowPhotos(recipient: Recipient, remaining: number): void {
  notify(
    `${APP_TITLE} — Low Photos`,
    `${recipient.fullName}: ${remaining} unsent photo${remaining === 1 ? '' : 's'} remaining`,
  );
}

export function notifyOutOfPhotos(recipient: Recipient): void {
  notify(`${APP_TITLE} — Out of Photos`, `No unsent photos left for ${recipient.fullName}`);
}

export function notifyError(recipientId: string, message: string): void {
  notify(`${APP_TITLE} — Error`, `${recipientId}: ${message}`);
}
