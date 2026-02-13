/// <reference types="vite/client" />

interface AhriAPI {
  platform: string;
  isElectron: boolean;
  agent: {
    openFile: (path: string) => Promise<void>;
    readFile: (path: string) => Promise<string>;
    listDir: (path: string) => Promise<string[]>;
    openUrl: (url: string) => Promise<void>;
    getSystemInfo: () => Promise<Record<string, unknown>>;
    readClipboard: () => Promise<string>;
    writeClipboard: (text: string) => Promise<void>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  autoPersona: {
    start: () => Promise<{ success: boolean }>;
    stop: () => Promise<{ success: boolean }>;
    status: () => Promise<{ enabled: boolean }>;
    onPersonaSwitched: (callback: (persona: string) => void) => void;
  };
}

declare global {
  interface Window {
    ahri?: AhriAPI;
  }
}

export {};
