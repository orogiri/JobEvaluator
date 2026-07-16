const { app, Tray, Menu, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { pathToFileURL } = require('url');
const { existsSync, readFileSync } = require('fs');

const isDev = !app.isPackaged;
const PORT = process.env.JOBEVAL_PORT || '3002';

// Each installed copy keeps its own SQLite file (and its own API keys, since
// those live in the settings table) under this machine's per-user app data
// folder — never inside the install directory, which is read-only once packaged.
// Opt-in escape hatch: if a "dev-data-link.txt" file exists in that folder
// (never created by the installer — a given machine has to create it deliberately),
// its contents are used as the data directory instead, so this install can point
// straight at a `npm run dev` checkout's server/data.db instead of keeping its own
// copy. Absent on a fresh install (e.g. anyone else's machine), so isolation is
// still the default. Don't run `npm run dev` and this app at the same time when
// linked — sql.js rewrites the whole file on every save, so concurrent writers
// from two processes can clobber each other.
function resolveDataDir() {
  const linkFile = path.join(app.getPath('userData'), 'dev-data-link.txt');
  if (existsSync(linkFile)) {
    const linked = readFileSync(linkFile, 'utf8').trim();
    if (linked && existsSync(linked)) return linked;
  }
  return app.getPath('userData');
}

process.env.JOBEVAL_DATA_DIR = resolveDataDir();
process.env.JOBEVAL_PORT = PORT;

// No window is ever opened — this instance owns the server process, so a
// second launch (e.g. double-clicking the desktop icon again) must not try
// to bind the same port. Instead, hand off to the already-running instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let tray = null;

function iconPath() {
  return isDev
    ? path.join(__dirname, '../build/icon.ico')
    : path.join(process.resourcesPath, 'build/icon.ico');
}

async function startServer() {
  // In dev, `npm run electron:dev` already starts the server separately
  // (with hot reload via nodemon) — only boot it in-process for the packaged app.
  if (isDev) return;
  // The server ships as a real extraResources copy (not inside app.asar) so its
  // own node_modules resolves normally — electron-builder's asar packer only
  // understands the root project's dependency tree, not server/'s separate one.
  const serverIndex = path.join(process.resourcesPath, 'server', 'index.js');
  // Dynamic import() requires a file:// URL on Windows — a raw "C:\..." path
  // throws ERR_UNSUPPORTED_ESM_URL_SCHEME and crashes before the server starts.
  await import(pathToFileURL(serverIndex).href);
}

function appUrl() {
  return isDev
    ? `http://localhost:${process.env.JOBEVAL_CLIENT_PORT || '2888'}`
    : `http://localhost:${PORT}`;
}

function openApp() {
  shell.openExternal(appUrl());
}

function createTray() {
  tray = new Tray(iconPath());
  tray.setToolTip('Job Evaluator');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Job Evaluator', click: openApp },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('click', openApp);
}

app.whenReady().then(async () => {
  await startServer();
  createTray();
  openApp();

  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[electron] update check failed:', err.message);
    });
  }
});

app.on('second-instance', openApp);

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
