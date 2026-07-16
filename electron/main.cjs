const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

const isDev = !app.isPackaged;
const PORT = process.env.JOBEVAL_PORT || '3002';

// Each installed copy keeps its own SQLite file (and its own API keys, since
// those live in the settings table) under this machine's per-user app data
// folder — never inside the install directory, which is read-only once packaged.
process.env.JOBEVAL_DATA_DIR = app.getPath('userData');
process.env.JOBEVAL_PORT = PORT;

let mainWindow;

async function startServer() {
  // In dev, `npm run electron:dev` already starts the server separately
  // (with hot reload via nodemon) — only boot it in-process for the packaged app.
  if (isDev) return;
  await import(path.join(__dirname, '../server/index.js'));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = isDev
    ? `http://localhost:${process.env.JOBEVAL_CLIENT_PORT || '2888'}`
    : `http://localhost:${PORT}`;
  mainWindow.loadURL(url);

  mainWindow.webContents.on('did-finish-load', () => console.log('[electron] window loaded:', url));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => console.error('[electron] load failed:', code, desc));
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

autoUpdater.on('update-downloaded', async () => {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Update ready',
    message: 'A new version of Job Evaluator has been downloaded.',
    detail: 'Restart now to finish installing it?',
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
  });
  if (response === 0) autoUpdater.quitAndInstall();
});
