/**
 * File logger for the main process.
 * Writes timestamped entries to ~/Library/Logs/Postorama/main.log and patches
 * console.log/info/warn/error so all existing logging lands in the file.
 */

import { appendFileSync, mkdirSync, existsSync, statSync, renameSync } from 'fs';
import path from 'path';
import { app } from 'electron';

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB — rotate when exceeded

let logPath: string | null = null;

function getLogPath(): string {
  if (!logPath) {
    const dir = app.getPath('logs');
    mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, 'main.log');
  }
  return logPath;
}

function rotatIfNeeded(file: string): void {
  try {
    if (existsSync(file) && statSync(file).size > MAX_LOG_BYTES) {
      renameSync(file, file + '.old');
    }
  } catch {
    // ignore rotation errors
  }
}

function write(level: string, args: unknown[]): void {
  try {
    const file = getLogPath();
    rotatIfNeeded(file);
    const ts = new Date().toISOString();
    const msg = args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 0)))
      .join(' ');
    appendFileSync(file, `${ts} [${level}] ${msg}\n`, 'utf-8');
  } catch {
    // never let logging crash the app
  }
}

const _origLog = console.log.bind(console);
const _origInfo = console.info.bind(console);
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);

export function initLogger(): void {
  console.log = (...args: unknown[]) => {
    _origLog(...args);
    write('LOG', args);
  };
  console.info = (...args: unknown[]) => {
    _origInfo(...args);
    write('INFO', args);
  };
  console.warn = (...args: unknown[]) => {
    _origWarn(...args);
    write('WARN', args);
  };
  console.error = (...args: unknown[]) => {
    _origError(...args);
    write('ERROR', args);
  };

  process.on('uncaughtException', (err) => {
    write('UNCAUGHT', [err.stack ?? String(err)]);
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? (reason.stack ?? String(reason)) : String(reason);
    write('UNHANDLED_REJECTION', [msg]);
  });

  write('INFO', [`Postorama starting — log: ${getLogPath()}`]);
}

export function getLogFilePath(): string {
  return getLogPath();
}
