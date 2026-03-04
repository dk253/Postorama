import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
  on: (channel: string, cb: (data: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: unknown) => cb(data);
    ipcRenderer.on(channel, listener);
    // Return cleanup function
    return () => ipcRenderer.removeListener(channel, listener);
  },
});

declare global {
  interface Window {
    api: {
      invoke: (channel: string, data?: unknown) => Promise<unknown>;
      on: (channel: string, cb: (data: unknown) => void) => () => void;
    };
  }
}
