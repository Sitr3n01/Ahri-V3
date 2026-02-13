"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
/**
 * Preload script - ponte segura entre o processo main (Node.js) e o renderer (React).
 * Expõe APIs específicas via contextBridge ao invés de dar acesso total ao Node.
 */
electron_1.contextBridge.exposeInMainWorld('ahri', {
    // System
    platform: process.platform,
    isElectron: true,
    // Agent IPC (para capabilities que precisam de acesso ao sistema)
    agent: {
        openFile: (path) => electron_1.ipcRenderer.invoke('agent:open-file', path),
        readFile: (path) => electron_1.ipcRenderer.invoke('agent:read-file', path),
        listDir: (path) => electron_1.ipcRenderer.invoke('agent:list-dir', path),
        openUrl: (url) => electron_1.ipcRenderer.invoke('agent:open-url', url),
        getSystemInfo: () => electron_1.ipcRenderer.invoke('agent:system-info'),
        readClipboard: () => electron_1.ipcRenderer.invoke('agent:clipboard-read'),
        writeClipboard: (text) => electron_1.ipcRenderer.invoke('agent:clipboard-write', text),
    },
    // Window management
    window: {
        minimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
        maximize: () => electron_1.ipcRenderer.invoke('window:maximize'),
        close: () => electron_1.ipcRenderer.invoke('window:close'),
    },
    // Auto-Persona daemon
    autoPersona: {
        start: () => electron_1.ipcRenderer.invoke('auto-persona:start'),
        stop: () => electron_1.ipcRenderer.invoke('auto-persona:stop'),
        status: () => electron_1.ipcRenderer.invoke('auto-persona:status'),
        onPersonaSwitched: (callback) => {
            electron_1.ipcRenderer.on('persona:auto-switched', (_event, persona) => callback(persona));
        },
    },
});
