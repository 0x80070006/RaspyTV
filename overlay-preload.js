const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('moonlightOverlay', {
  toggleKeyboard: () => ipcRenderer.invoke('osk:toggle'),
  onState: callback => ipcRenderer.on('osk:state', (_event, visible) => callback(visible))
});
