const { app, ipcMain, BrowserWindow } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const REPO_OWNER = 'JJMcGil1';
const REPO_NAME = 'the-queue';
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY = 5 * 1000; // 5 seconds
const DOWNLOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const API_TIMEOUT = 30 * 1000; // 30 seconds
const DOWNLOAD_DIR = path.join(require('os').tmpdir(), 'queue-update');

let updateCheckTimer = null;
let currentUpdate = null;
let downloadedFilePath = null;

function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

function sendToRenderer(channel, data) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('API request timed out')), API_TIMEOUT);
    const handler = (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        const mod = res.headers.location.startsWith('https') ? https : http;
        mod.get(res.headers.location, { headers: { 'User-Agent': 'Queue-Updater' } }, handler).on('error', (e) => { clearTimeout(timer); reject(e); });
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    };
    https.get(url, { headers: { 'User-Agent': 'Queue-Updater' } }, handler).on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.dirname(dest))) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
    }
    const timer = setTimeout(() => reject(new Error('Download timed out')), DOWNLOAD_TIMEOUT);
    const handler = (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        clearTimeout(timer);
        const newTimer = setTimeout(() => reject(new Error('Download timed out')), DOWNLOAD_TIMEOUT);
        const mod = res.headers.location.startsWith('https') ? https : http;
        mod.get(res.headers.location, { headers: { 'User-Agent': 'Queue-Updater' } }, (r) => {
          clearTimeout(newTimer);
          handleDownload(r, dest, onProgress, resolve, reject);
        }).on('error', (e) => { clearTimeout(newTimer); reject(e); });
        return;
      }
      clearTimeout(timer);
      handleDownload(res, dest, onProgress, resolve, reject);
    };
    https.get(url, { headers: { 'User-Agent': 'Queue-Updater' } }, handler).on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function handleDownload(res, dest, onProgress, resolve, reject) {
  const total = parseInt(res.headers['content-length'], 10) || 0;
  let transferred = 0;
  const file = fs.createWriteStream(dest);
  res.on('data', (chunk) => {
    transferred += chunk.length;
    if (total > 0 && onProgress) {
      onProgress({ percent: Math.round((transferred / total) * 100), transferred, total });
    }
  });
  res.pipe(file);
  file.on('finish', () => { file.close(); resolve(dest); });
  file.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
  res.on('error', (e) => { fs.unlink(dest, () => {}); reject(e); });
}

function computeSHA256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function checkForUpdates() {
  try {
    const currentVersion = app.getVersion();
    const releaseUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
    const release = await fetchJSON(releaseUrl);

    const latestVersion = release.tag_name.replace(/^v/, '');
    if (compareVersions(latestVersion, currentVersion) <= 0) {
      return { upToDate: true };
    }

    // Find latest.json asset
    const latestJsonAsset = release.assets.find(a => a.name === 'latest.json');
    let latestJson = null;
    if (latestJsonAsset) {
      latestJson = await fetchJSON(latestJsonAsset.browser_download_url);
    }

    // Determine the correct DMG for this architecture
    const arch = process.arch; // 'arm64' or 'x64'
    const dmgName = arch === 'arm64'
      ? `Queue-${latestVersion}-arm64.dmg`
      : `Queue-${latestVersion}.dmg`;

    const dmgAsset = release.assets.find(a => a.name === dmgName);
    if (!dmgAsset) {
      throw new Error(`No DMG found for architecture ${arch}: ${dmgName}`);
    }

    currentUpdate = {
      version: latestVersion,
      dmgUrl: dmgAsset.browser_download_url,
      dmgName: dmgAsset.name,
      releaseNotes: release.body || 'Bug fixes and improvements.',
      latestJson,
    };

    sendToRenderer('updater:update-available', {
      version: latestVersion,
      releaseNotes: currentUpdate.releaseNotes,
    });

    return { updateAvailable: true, version: latestVersion };
  } catch (err) {
    console.error('[AutoUpdater] Check failed:', err.message);
    return { error: err.message };
  }
}

async function downloadUpdate() {
  if (!currentUpdate) {
    sendToRenderer('updater:error', { message: 'No update available to download' });
    return;
  }

  try {
    const dest = path.join(DOWNLOAD_DIR, currentUpdate.dmgName);

    // Clean previous downloads
    if (fs.existsSync(DOWNLOAD_DIR)) {
      fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

    await downloadFile(currentUpdate.dmgUrl, dest, (progress) => {
      sendToRenderer('updater:download-progress', progress);
    });

    // Verify SHA256 if latest.json is available
    if (currentUpdate.latestJson && currentUpdate.latestJson.platforms) {
      const platform = process.arch === 'arm64' ? 'macArm64' : 'mac';
      const expected = currentUpdate.latestJson.platforms[platform];
      if (expected && expected.sha256) {
        const actual = await computeSHA256(dest);
        if (actual !== expected.sha256) {
          fs.unlinkSync(dest);
          throw new Error('SHA256 verification failed');
        }
      }
    }

    downloadedFilePath = dest;
    sendToRenderer('updater:update-downloaded', { version: currentUpdate.version });
  } catch (err) {
    console.error('[AutoUpdater] Download failed:', err.message);
    sendToRenderer('updater:error', { message: err.message });
  }
}

async function installUpdate() {
  if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
    sendToRenderer('updater:error', { message: 'No downloaded update to install' });
    return;
  }

  try {
    const dmgPath = downloadedFilePath;

    // Mount the DMG
    const mountOutput = execSync(`hdiutil attach "${dmgPath}" -nobrowse -noautoopen`, { encoding: 'utf-8' });
    const mountMatch = mountOutput.match(/\/Volumes\/.+/);
    if (!mountMatch) throw new Error('Failed to mount DMG');

    const mountPoint = mountMatch[0].trim();
    const appName = 'Queue.app';
    const sourceApp = path.join(mountPoint, appName);
    const destApp = path.join('/Applications', appName);

    if (!fs.existsSync(sourceApp)) {
      throw new Error(`${appName} not found in DMG`);
    }

    // Remove old app and copy new one
    if (fs.existsSync(destApp)) {
      execSync(`rm -rf "${destApp}"`);
    }
    execSync(`cp -R "${sourceApp}" "${destApp}"`);

    // Strip quarantine flag (unsigned builds)
    execSync(`xattr -cr "${destApp}"`);

    // Unmount
    try { execSync(`hdiutil detach "${mountPoint}" -quiet`); } catch (_) {}

    // Clean up downloads
    try { fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true }); } catch (_) {}

    // Relaunch from the new app
    app.relaunch({ execPath: path.join(destApp, 'Contents', 'MacOS', 'Queue') });
    app.exit(0);
  } catch (err) {
    console.error('[AutoUpdater] Install failed:', err.message);
    sendToRenderer('updater:error', { message: `Install failed: ${err.message}` });
  }
}

function registerIpcHandlers() {
  ipcMain.handle('updater:check', async () => {
    return await checkForUpdates();
  });

  ipcMain.handle('updater:download', async () => {
    await downloadUpdate();
  });

  ipcMain.handle('updater:install', async () => {
    await installUpdate();
  });

  ipcMain.handle('updater:dismiss', () => {
    currentUpdate = null;
  });
}

function startAutoUpdater() {
  registerIpcHandlers();

  // Don't auto-check in dev
  if (!app.isPackaged) return;

  setTimeout(() => {
    checkForUpdates();
    updateCheckTimer = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
  }, STARTUP_DELAY);
}

function stopAutoUpdater() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}

module.exports = { startAutoUpdater, stopAutoUpdater };
