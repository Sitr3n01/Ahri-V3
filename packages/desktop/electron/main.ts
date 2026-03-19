import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendProcess: ChildProcess | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let backendRestartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 3;

const BACKEND_PORT = 8742;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const IS_DEV = process.env.NODE_ENV !== 'production';
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

// =============================================================================
// Backend Lifecycle
// =============================================================================

function startBackend(): void {
  if (IS_DEV) {
    console.log('[Electron] Dev mode: backend should be started separately');
    return;
  }

  const pythonPath = path.join(ROOT_DIR, 'packages', 'backend', '.venv', 'Scripts', 'python.exe');
  const args = ['-m', 'uvicorn', 'src.main:app', '--port', String(BACKEND_PORT)];

  console.log(`[Electron] Starting backend: ${pythonPath} ${args.join(' ')}`);

  backendProcess = spawn(pythonPath, args, {
    cwd: path.join(ROOT_DIR, 'packages', 'backend'),
    stdio: 'pipe',
  });

  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[Backend] ${data.toString().trim()}`);
  });

  backendProcess.on('exit', (code: number | null) => {
    console.log(`[Backend] Process exited with code ${code}`);
    backendProcess = null;

    // Auto-restart on unexpected exit (not during app quit)
    if (code !== 0 && code !== null && backendRestartAttempts < MAX_RESTART_ATTEMPTS) {
      backendRestartAttempts++;
      console.log(`[Electron] Backend crashed, restarting (attempt ${backendRestartAttempts}/${MAX_RESTART_ATTEMPTS})...`);
      setTimeout(() => startBackend(), 3000);
    }
  });
}

async function waitForBackend(maxRetries = 30): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      if (response.ok) {
        console.log('[Electron] Backend is ready');
        return true;
      }
    } catch {
      // Backend not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error('[Electron] Backend failed to start');
  return false;
}

function stopBackend(): void {
  // Prevent auto-restart during intentional shutdown
  backendRestartAttempts = MAX_RESTART_ATTEMPTS;
  stopHealthMonitor();

  if (backendProcess) {
    console.log('[Electron] Stopping backend...');

    // Windows doesn't support SIGTERM properly — use SIGINT then force kill
    if (process.platform === 'win32') {
      backendProcess.kill('SIGINT');
      // Force kill after 5 seconds if still running
      const pid = backendProcess.pid;
      setTimeout(() => {
        if (backendProcess && backendProcess.pid === pid) {
          try {
            process.kill(pid!, 'SIGKILL');
          } catch { /* already dead */ }
        }
      }, 5000);
    } else {
      backendProcess.kill('SIGTERM');
    }

    backendProcess = null;
  }
}

function startHealthMonitor(): void {
  if (IS_DEV || healthCheckInterval) return;

  healthCheckInterval = setInterval(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      console.warn('[Electron] Backend health check failed');
      if (!backendProcess && backendRestartAttempts < MAX_RESTART_ATTEMPTS) {
        console.log('[Electron] Backend appears dead, attempting restart...');
        startBackend();
      }
    }
  }, 30000); // Every 30 seconds
}

function stopHealthMonitor(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

// =============================================================================
// IPC Handlers - Agent Capabilities
// =============================================================================

/**
 * Validates that a file path is within the allowed data directory.
 * Prevents path traversal attacks via IPC.
 */
function validateDataPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(DATA_DIR)) {
    throw new Error(`Access denied: path must be within ${DATA_DIR}`);
  }
  return resolved;
}

function registerAgentIPC(): void {
  ipcMain.handle('agent:open-file', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid path');
    const resolved = validateDataPath(filePath);
    await shell.openPath(resolved);
    return { success: true };
  });

  ipcMain.handle('agent:read-file', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid path');
    const resolved = validateDataPath(filePath);
    const content = await fs.promises.readFile(resolved, 'utf-8');
    return content;
  });

  ipcMain.handle('agent:write-file', async (_event, { path: filePath, content }: { path: unknown; content: unknown }) => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid path');
    if (typeof content !== 'string') throw new Error('Invalid content');
    const resolved = validateDataPath(filePath);
    await fs.promises.writeFile(resolved, content, 'utf-8');
    return { success: true };
  });

  ipcMain.handle('agent:list-dir', async (_event, dirPath: unknown) => {
    if (typeof dirPath !== 'string' || !dirPath) throw new Error('Invalid path');
    const resolved = validateDataPath(dirPath);
    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  });

  ipcMain.handle('agent:open-url', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !url) throw new Error('Invalid url');
    await shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle('agent:system-info', async () => {
    return {
      platform: process.platform,
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
    };
  });

  ipcMain.handle('agent:clipboard-read', async () => {
    return clipboard.readText();
  });

  ipcMain.handle('agent:clipboard-write', async (_event, text: unknown) => {
    if (typeof text !== 'string') throw new Error('Invalid text');
    clipboard.writeText(text);
    return { success: true };
  });

  ipcMain.handle('agent:get-paths', async () => {
    const rootDir = path.resolve(__dirname, '..', '..', '..');
    return {
      root: rootDir,
      data: path.join(rootDir, 'data'),
      personas: path.join(rootDir, 'data', 'personas'),
    };
  });
}

// =============================================================================
// IPC Handlers - Window Management
// =============================================================================

function registerWindowIPC(): void {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    mainWindow?.close();
  });
}

// =============================================================================
// Window Management
// =============================================================================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1422,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#06040c',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#06040c',
      symbolColor: '#e2e8f0',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Log console messages from renderer to terminal
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelMap = ['LOG', 'WARN', 'ERROR'];
    console.log(`[Renderer ${levelMap[level] || level}] ${message} (${sourceId}:${line})`);
  });

  if (IS_DEV) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (tray) {
      event.preventDefault();
      mainWindow?.hide();
      mainWindow?.setSkipTaskbar(false); // Keep visible in taskbar when minimized to tray
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTrayIcon(): Electron.NativeImage {
  // Generate a simple 16x16 tray icon with persona-like color
  // This creates a small colored circle PNG in memory
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4); // RGBA

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= size / 2 - 1) {
        // Purple gradient for Ahri branding
        canvas[idx] = 168;    // R
        canvas[idx + 1] = 85; // G
        canvas[idx + 2] = 247; // B
        canvas[idx + 3] = 255; // A
      } else {
        canvas[idx + 3] = 0; // Transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Ahri',
      click: () => mainWindow?.show(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Ahri');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

// =============================================================================
// Auto-Persona Daemon (Spotify polling)
// =============================================================================

let autoPersonaInterval: NodeJS.Timeout | null = null;
let isAutoPersonaEnabled = false;
let lastTrackId: string | null = null;

const GENRE_MAP: Record<string, string[]> = {
  kafka: ['metal', 'rock', 'phonk', 'dark', 'industrial', 'grunge', 'alternative', 'punk', 'goth'],
  sparkle: ['k-pop', 'hyperpop', 'dance', 'edm', 'house', 'techno', 'dubstep', 'party', 'electropop'],
  robin: ['acoustic', 'folk', 'indie', 'soul', 'r&b', 'mpb', 'bossa', 'soft', 'jazz', 'ballad'],
  shorekeeper: ['classical', 'piano', 'ambient', 'soundtrack', 'orchestral', 'lo-fi', 'sleep', 'new age'],
  ahri: ['k-pop', 'pop', 'dance-pop', 'r&b', 'soul', 'lo-fi', 'orchestral pop'],
  rakan: ['funk', 'disco', 'dance-pop', 'groove', 'house', 'latin pop', 'nu-disco', 'upbeat'],
  herta: ['classical', 'waltz', 'baroque', 'glitch', 'chiptune', 'electronic', 'idm', 'synth-pop'],
  furina: ['opera', 'musical theatre', 'orchestral pop', 'french pop', 'chanson', 'swing', 'baroque pop'],
  maomao: ['traditional chinese', 'guqin', 'lo-fi', 'ambient', 'folk', 'minimalist', 'instrumental'],
  frieren: ['celtic', 'medieval folk', 'fantasy', 'new age', 'neoclassical', 'acoustic', 'soundtrack'],
  'yae miko': ['traditional japanese', 'future bass', 'electro swing', 'j-rock', 'electronic', 'shamisen'],
  cantarella: ['trip-hop', 'dark cabaret', 'jazz noir', 'dark wave', 'slowcore', 'ambient pop'],
  'carlotta montelli': ['jazz', 'blues', 'tango', 'noir jazz', 'classical crossover', 'soul'],
  cyrene: ['j-pop', 'dream pop', 'glitch pop', 'shoegaze', 'trance', 'kawaii future bass', 'city pop'],
  'march 7th': ['city pop', 'j-pop', 'synthwave', 'indie pop', 'shibuya-kei', 'happy hardcore'],
  cartethyia: ['choral', 'ethereal', 'neoclassical', 'ambient', 'atmospheric', 'religious'],
};

function determinePersonaByGenre(genres: string[]): string {
  const genresStr = genres.join(' ').toLowerCase();

  for (const [persona, keywords] of Object.entries(GENRE_MAP)) {
    for (const keyword of keywords) {
      if (genresStr.includes(keyword)) {
        return persona;
      }
    }
  }

  return 'ahri'; // default
}

async function pollSpotifyAndSwitchPersona(): Promise<void> {
  if (!isAutoPersonaEnabled) return;

  try {
    // Pega token do renderer (via IPC ou fetch storage)
    const accessToken = await mainWindow?.webContents.executeJavaScript(
      'localStorage.getItem("ahri_access_token")'
    ).catch(() => null);

    if (!accessToken) return;

    // Chama backend para sync-persona
    const response = await fetch(`${BACKEND_URL}/spotify/sync-persona`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.switched) {
        console.log(`[Auto-Persona] Switched to ${data.persona}`);

        // Notifica renderer para atualizar UI
        mainWindow?.webContents.send('persona:auto-switched', data.persona);
      }
    }
  } catch (e) {
    // Silently fail - não queremos spammar logs
  }
}

function startAutoPersonaDaemon(): void {
  if (autoPersonaInterval) return;

  console.log('[Auto-Persona] Starting daemon (polling every 10s)');
  isAutoPersonaEnabled = true;

  autoPersonaInterval = setInterval(() => {
    pollSpotifyAndSwitchPersona();
  }, 10000); // 10 segundos
}

function stopAutoPersonaDaemon(): void {
  if (autoPersonaInterval) {
    clearInterval(autoPersonaInterval);
    autoPersonaInterval = null;
    isAutoPersonaEnabled = false;
    console.log('[Auto-Persona] Daemon stopped');
  }
}

// IPC handlers para controlar o daemon
ipcMain.handle('auto-persona:start', () => {
  startAutoPersonaDaemon();
  return { success: true };
});

ipcMain.handle('auto-persona:stop', () => {
  stopAutoPersonaDaemon();
  return { success: true };
});

ipcMain.handle('auto-persona:status', () => {
  return { enabled: isAutoPersonaEnabled };
});

// =============================================================================
// App Lifecycle
// =============================================================================

app.whenReady().then(async () => {
  registerAgentIPC();
  registerWindowIPC();

  startBackend();

  if (!IS_DEV) {
    const ready = await waitForBackend();
    if (!ready) {
      app.quit();
      return;
    }
  }

  createWindow();
  createTray();
  startHealthMonitor();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend();
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  stopAutoPersonaDaemon();
  stopBackend();
  tray?.destroy();
  tray = null;
});
