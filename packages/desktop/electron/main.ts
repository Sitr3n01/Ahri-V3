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

const BACKEND_PORT = 8742;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const IS_DEV = process.env.NODE_ENV !== 'production';

// =============================================================================
// Backend Lifecycle
// =============================================================================

function startBackend(): void {
  if (IS_DEV) {
    console.log('[Electron] Dev mode: backend should be started separately');
    return;
  }

  const rootDir = path.resolve(__dirname, '..', '..', '..');
  const pythonPath = path.join(rootDir, 'packages', 'backend', '.venv', 'Scripts', 'python.exe');
  const args = ['-m', 'uvicorn', 'src.main:app', '--port', String(BACKEND_PORT)];

  console.log(`[Electron] Starting backend: ${pythonPath} ${args.join(' ')}`);

  backendProcess = spawn(pythonPath, args, {
    cwd: path.join(rootDir, 'packages', 'backend'),
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
  if (backendProcess) {
    console.log('[Electron] Stopping backend...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// =============================================================================
// IPC Handlers - Agent Capabilities
// =============================================================================

function registerAgentIPC(): void {
  ipcMain.handle('agent:open-file', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid path');
    await shell.openPath(filePath);
    return { success: true };
  });

  ipcMain.handle('agent:read-file', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath) throw new Error('Invalid path');
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return content;
  });

  ipcMain.handle('agent:list-dir', async (_event, dirPath: unknown) => {
    if (typeof dirPath !== 'string' || !dirPath) throw new Error('Invalid path');
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
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
    frame: false, // Removemos o frame nativo padrão para customizar
    titleBarStyle: 'hidden', // Esconde a barra de título padrão mas mantém controles
    titleBarOverlay: {
      color: '#0a0a0a', // Fundo escuro igual ao app
      symbolColor: '#ffffff', // Ícones brancos
      height: 32 // Altura um pouco maior para conforto
    },
    backgroundColor: '#0a0a0a',
    show: false,
    autoHideMenuBar: true, // Remove a barra de menu (File, Edit, etc)
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
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  // TODO: Usar ícone real quando disponível
  const icon = nativeImage.createEmpty();
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
