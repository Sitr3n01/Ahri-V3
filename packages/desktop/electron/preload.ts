import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - ponte segura entre o processo main (Node.js) e o renderer (React).
 * Expõe APIs específicas via contextBridge ao invés de dar acesso total ao Node.
 */
contextBridge.exposeInMainWorld('ahri', {
  // System
  platform: process.platform,
  isElectron: true,

  // Agent IPC (para capabilities que precisam de acesso ao sistema)
  agent: {
    openFile: (path: string) => ipcRenderer.invoke('agent:open-file', path),
    readFile: (path: string) => ipcRenderer.invoke('agent:read-file', path),
    listDir: (path: string) => ipcRenderer.invoke('agent:list-dir', path),
    openUrl: (url: string) => ipcRenderer.invoke('agent:open-url', url),
    getSystemInfo: () => ipcRenderer.invoke('agent:system-info'),
    readClipboard: () => ipcRenderer.invoke('agent:clipboard-read'),
    writeClipboard: (text: string) => ipcRenderer.invoke('agent:clipboard-write', text),
  },

  // Window management
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // Auto-Persona daemon
  autoPersona: {
    start: () => ipcRenderer.invoke('auto-persona:start'),
    stop: () => ipcRenderer.invoke('auto-persona:stop'),
    status: () => ipcRenderer.invoke('auto-persona:status'),
    onPersonaSwitched: (callback: (persona: string) => void) => {
      ipcRenderer.on('persona:auto-switched', (_event, persona) => callback(persona));
    },
  },
});
