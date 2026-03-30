const { app, BrowserWindow, ipcMain, protocol, net, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { initDatabase, getDb } = require('./database');
const { startAutoUpdater, stopAutoUpdater } = require('./auto-updater');

// Set the app name so macOS dock/menu shows "Queue" instead of "Electron"
app.setName('Queue');

let mainWindow;
let imagesDir;

function getImagesDir() {
  if (!imagesDir) {
    // Use fixed path so app name changes don't lose images
    imagesDir = path.join(app.getPath('appData'), 'the-queue', 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
  }
  return imagesDir;
}

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 19 },
    backgroundColor: '#08070D',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  // Set the dock icon on macOS
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

// Register custom protocol to serve local images
protocol.registerSchemesAsPrivileged([
  { scheme: 'queue-image', privileges: { bypassCSP: true, stream: true, supportFetchAPI: true } }
]);

app.whenReady().then(() => {
  // Register protocol handler to serve images from userData/images
  protocol.handle('queue-image', (request) => {
    const filename = decodeURIComponent(request.url.replace('queue-image://', ''));
    const filePath = path.join(getImagesDir(), filename);
    return net.fetch('file://' + filePath);
  });

  initDatabase();
  registerIpcHandlers();
  startAutoUpdater();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopAutoUpdater();
    app.quit();
  }
});

function registerIpcHandlers() {
  const db = getDb();

  // Get all items, optionally filtered by search
  ipcMain.handle('queue:getItems', (_event, filters = {}) => {
    let query = 'SELECT * FROM queue_items WHERE 1=1';
    const params = [];

    if (filters.search) {
      query += ' AND title LIKE ?';
      params.push(`%${filters.search}%`);
    }

    query += ' ORDER BY sort_order ASC';
    return db.prepare(query).all(...params);
  });

  // Save an uploaded image and return the filename
  ipcMain.handle('queue:saveImage', (_event, { buffer, originalName }) => {
    const ext = path.extname(originalName) || '.jpg';
    const filename = crypto.randomUUID() + ext;
    const filePath = path.join(getImagesDir(), filename);
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return filename;
  });

  // Add a new item (sort_order = max + 1 so it goes to the end)
  ipcMain.handle('queue:addItem', (_event, item) => {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM queue_items').get().m;
    const stmt = db.prepare('INSERT INTO queue_items (title, image_url, url, platform, sort_order) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(item.title, item.image_url || null, item.url || null, item.platform || null, max + 1);
    return { id: result.lastInsertRowid, ...item };
  });

  // Reorder items — receives an array of { id, sort_order }
  ipcMain.handle('queue:reorderItems', (_event, items) => {
    const stmt = db.prepare('UPDATE queue_items SET sort_order = ? WHERE id = ?');
    const reorder = db.transaction((list) => {
      for (const item of list) {
        stmt.run(item.sort_order, item.id);
      }
    });
    reorder(items);
    return { success: true };
  });

  // Toggle watched status
  ipcMain.handle('queue:toggleWatched', (_event, id) => {
    db.prepare('UPDATE queue_items SET watched = CASE WHEN watched = 0 THEN 1 ELSE 0 END WHERE id = ?').run(id);
    return db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id);
  });

  // Update an item (title and/or image)
  ipcMain.handle('queue:updateItem', (_event, { id, title, image_url, url, platform, removeOldImage }) => {
    // If we're replacing the image, clean up the old file
    if (removeOldImage) {
      const old = db.prepare('SELECT image_url FROM queue_items WHERE id = ?').get(id);
      if (old && old.image_url && !old.image_url.startsWith('http')) {
        const filePath = path.join(getImagesDir(), old.image_url);
        try { fs.unlinkSync(filePath); } catch (_) {}
      }
    }
    db.prepare('UPDATE queue_items SET title = ?, image_url = ?, url = COALESCE(?, url), platform = COALESCE(?, platform) WHERE id = ?').run(title, image_url || null, url || null, platform || null, id);
    return db.prepare('SELECT * FROM queue_items WHERE id = ?').get(id);
  });

  // Delete an item (also clean up image file)
  ipcMain.handle('queue:deleteItem', (_event, id) => {
    const item = db.prepare('SELECT image_url FROM queue_items WHERE id = ?').get(id);
    if (item && item.image_url) {
      const filePath = path.join(getImagesDir(), item.image_url);
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
    db.prepare('DELETE FROM queue_items WHERE id = ?').run(id);
    return { success: true };
  });
}
