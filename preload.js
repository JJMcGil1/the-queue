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
