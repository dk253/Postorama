import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import type { Message } from '../shared/ipc-types';

function getMessagesPath(): string {
  return path.join(app.getPath('userData'), 'messages.json');
}

function getDefaultMessagesPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'messages.default.json');
  }
  return path.join(__dirname, '..', '..', 'resources', 'messages.default.json');
}

export function loadMessages(): Message[] {
  const messagesPath = getMessagesPath();

  // On first run, copy defaults
  if (!existsSync(messagesPath)) {
    const defaultPath = getDefaultMessagesPath();
    if (existsSync(defaultPath)) {
      copyFileSync(defaultPath, messagesPath);
    } else {
      // Write built-in fallback
      const fallback: Message[] = [
        {
          id: 'default-1',
          text: 'Thinking of you and sending a little love your way.',
          type: 'warm',
        },
        {
          id: 'default-2',
          text: 'Just wanted to brighten your day with a hello!',
          type: 'cheerful',
        },
        { id: 'default-3', text: 'Life is better with people like you in it.', type: 'warm' },
        {
          id: 'default-4',
          text: 'Wishing you sunshine, good coffee, and easy days.',
          type: 'cheerful',
        },
        {
          id: 'default-5',
          text: 'Sending this from wherever I am to wherever you are.',
          type: 'reflective',
        },
      ];
      writeFileSync(messagesPath, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
  }

  try {
    const raw = JSON.parse(readFileSync(messagesPath, 'utf-8')) as unknown;
    if (!Array.isArray(raw)) throw new Error('messages.json must be an array');
    return raw as Message[];
  } catch (err) {
    throw new Error(`Failed to load messages.json: ${String(err)}`);
  }
}

export function saveMessages(messages: Message[]): void {
  const messagesPath = getMessagesPath();
  writeFileSync(messagesPath, JSON.stringify(messages, null, 2), 'utf-8');
}
