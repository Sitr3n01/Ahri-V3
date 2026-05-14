import { contextBridge, ipcRenderer } from 'electron/renderer';
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
        openFile: (path) => ipcRenderer.invoke('agent:open-file', path),
        readFile: (path) => ipcRenderer.invoke('agent:read-file', path),
        writeFile: (path, content) => ipcRenderer.invoke('agent:write-file', { path, content }),
        deleteFile: (path) => ipcRenderer.invoke('agent:delete-file', path),
        listDir: (path) => ipcRenderer.invoke('agent:list-dir', path),
        openUrl: (url) => ipcRenderer.invoke('agent:open-url', url),
        getSystemInfo: () => ipcRenderer.invoke('agent:system-info'),
        readClipboard: () => ipcRenderer.invoke('agent:clipboard-read'),
        writeClipboard: (text) => ipcRenderer.invoke('agent:clipboard-write', text),
        getPaths: () => ipcRenderer.invoke('agent:get-paths'),
        // Agent Mode v2 — directory, terminal, editor
        selectDirectory: () => ipcRenderer.invoke('agent:select-directory'),
        getRecentDirs: () => ipcRenderer.invoke('agent:get-recent-dirs'),
        addRecentDir: (dir) => ipcRenderer.invoke('agent:add-recent-dir', dir),
        openTerminal: (dir) => ipcRenderer.invoke('agent:open-terminal', dir),
        openEditor: (dir) => ipcRenderer.invoke('agent:open-editor', dir),
    },
    // Window management
    window: {
        minimize: () => ipcRenderer.invoke('window:minimize'),
        maximize: () => ipcRenderer.invoke('window:maximize'),
        close: () => ipcRenderer.invoke('window:close'),
        setTheme: (theme) => ipcRenderer.invoke('window:set-theme', theme),
    },
    // Auto-Persona daemon
    autoPersona: {
        start: () => ipcRenderer.invoke('auto-persona:start'),
        stop: () => ipcRenderer.invoke('auto-persona:stop'),
        status: () => ipcRenderer.invoke('auto-persona:status'),
        onPersonaSwitched: (callback) => {
            ipcRenderer.on('persona:auto-switched', (_event, persona) => callback(persona));
        },
    },
    // Settings (hardware acceleration, GPU info)
    settings: {
        getHwAccel: () => ipcRenderer.invoke('settings:get-hw-accel'),
        setHwAccel: (enabled) => ipcRenderer.invoke('settings:set-hw-accel', enabled),
        restartApp: () => ipcRenderer.invoke('settings:restart-app'),
        getGpuInfo: () => ipcRenderer.invoke('settings:get-gpu-info'),
    },
});
