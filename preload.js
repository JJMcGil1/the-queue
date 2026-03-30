const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getItems: (filters) => ipcRenderer.invoke('queue:getItems', filters),
  saveImage: (buffer, originalName) => ipcRenderer.invoke('queue:saveImage', { buffer, originalName }),
  addItem: (item) => ipcRenderer.invoke('queue:addItem', item),
  updateItem: (data) => ipcRenderer.invoke('queue:updateItem', data),
  deleteItem: (id) => ipcRenderer.invoke('queue:deleteItem', id),
  reorderItems: (items) => ipcRenderer.invoke('queue:reorderItems', items),
  toggleWatched: (id) => ipcRenderer.invoke('queue:toggleWatched', id),
});

contextBridge.exposeInMainWorld('updater', {
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  dismissUpdate: () => ipcRenderer.invoke('updater:dismiss'),
  onUpdateAvailable: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('updater:update-available', handler);
    return () => ipcRenderer.removeListener('updater:update-available', handler);
  },
  onDownloadProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('updater:download-progress', handler);
    return () => ipcRenderer.removeListener('updater:download-progress', handler);
  },
  onUpdateDownloaded: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('updater:update-downloaded', handler);
    return () => ipcRenderer.removeListener('updater:update-downloaded', handler);
  },
  onUpdateError: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('updater:error', handler);
    return () => ipcRenderer.removeListener('updater:error', handler);
  },
});

contextBridge.exposeInMainWorld('electron', {
  version: require('./package.json').version,
});
