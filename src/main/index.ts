import { app, BrowserWindow, nativeImage, Menu, shell, dialog } from 'electron';

// Must be set before app is ready so macOS attributes notifications correctly
app.name = 'Postorama';
import path from 'path';
import { pathToFileURL } from 'url';
import { menubar } from 'menubar';
import { registerIpcHandlers } from './ipc/handlers';
import { startScheduler, stopScheduler } from './scheduler';
import { getDb, closeDb } from './db/index';
import { initLogger, getLogFilePath } from './logger';

// Initialise logging before anything else so all errors are captured
initLogger();

// Prevent multiple instances
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Ensure SQLite is initialised early
app.whenReady().then(() => {
  getDb();
});

let messagesWindow: BrowserWindow | null = null;

function getIconPath(name: string): string {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '..', '..', 'assets');
  return path.join(base, name);
}

function getRendererPath(): string {
  // app.getAppPath() returns the path to the asar (or app dir in dev), which
  // contains dist/. process.resourcesPath is the parent of the asar and does NOT
  // contain dist/ — using it here would produce a path that doesn't exist.
  const filePath = path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
  return pathToFileURL(filePath).href;
}

function createMessagesWindow(): void {
  if (messagesWindow) {
    messagesWindow.focus();
    return;
  }

  messagesWindow = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'Message Library',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  const rendererUrl = getRendererPath() + '?window=messages';
  messagesWindow.loadURL(rendererUrl);

  messagesWindow.once('ready-to-show', () => {
    messagesWindow?.show();
  });

  messagesWindow.on('closed', () => {
    messagesWindow = null;
  });
}

app.whenReady().then(() => {
  // Register all IPC handlers before creating any windows
  registerIpcHandlers();

  // Additional IPC for opening messages window
  const { ipcMain } = require('electron') as typeof import('electron');
  ipcMain.handle('app:openMessagesWindow', () => createMessagesWindow());
  ipcMain.handle('app:quit', () => app.quit());

  const iconPath = getIconPath('menubar-idle.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  trayIcon.setTemplateImage(true);

  const mb = menubar({
    index: getRendererPath(),
    icon: trayIcon,
    browserWindow: {
      width: 380,
      height: 580,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
      show: false,
    },
    preloadWindow: true,
  });

  mb.on('ready', () => {
    startScheduler();
    console.warn('Postorama is ready');

    // Right-click context menu on tray icon
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Postorama', click: () => mb.showWindow() },
      { type: 'separator' },
      {
        label: 'About Postorama',
        click: () => {
          dialog.showMessageBox({
            type: 'info',
            title: 'About Postorama',
            message: 'Postorama',
            detail: `Version ${app.getVersion()}\n\nSends real postcards from your photo library via Lob.\n\nCopyright © 2026 Dave Kearney`,
            buttons: ['OK'],
          });
        },
      },
      { label: 'View Log File', click: () => shell.openPath(getLogFilePath()) },
      { type: 'separator' },
      { label: 'Quit Postorama', click: () => app.quit() },
    ]);
    mb.tray.on('right-click', () => mb.tray.popUpContextMenu(contextMenu));
  });

  mb.on('after-create-window', () => {
    // Show window after it's ready
    mb.window?.once('ready-to-show', () => {
      // menubar handles show/hide on tray click
    });
  });

  // Expose tray icon state changes
  mb.on('after-show', () => {
    mb.window?.webContents.send('popover:shown');
  });

  app.on('before-quit', () => {
    stopScheduler();
    closeDb();
  });

  // macOS: don't quit when all windows close (menubar app)
  app.on('window-all-closed', () => {
    // Keep running in menubar
  });

  app.on('activate', () => {
    // No-op for menubar apps
  });

  // Handle second instance focus
  app.on('second-instance', () => {
    mb.showWindow();
  });
});
