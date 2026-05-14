/**
 * Type shims for Electron 28+ submodule imports.
 * Electron 28+ requires importing from 'electron/main' in the main process
 * and 'electron/renderer' in the renderer/preload process.
 * The official electron.d.ts declares these modules but they're only found
 * by moduleResolution: "node" (deprecated) or if the electron package has exports.
 */
declare module 'electron/main' {
  export * from 'electron';
}

declare module 'electron/common' {
  export * from 'electron';
}

declare module 'electron/renderer' {
  export { contextBridge, ipcRenderer } from 'electron';
}
