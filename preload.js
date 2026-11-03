const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('raspy', {
  artMode: (enabled) => ipcRenderer.send('art:mode', enabled),
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  launch: (id) => ipcRenderer.invoke('app:launch', id),
  closeApp: (id) => ipcRenderer.invoke('app:close', id),
  addShortcut: (shortcut) => ipcRenderer.invoke('shortcut:add', shortcut),
  updateShortcut: (shortcut) => ipcRenderer.invoke('shortcut:update', shortcut),
  removeShortcut: (id) => ipcRenderer.invoke('shortcut:remove', id),
  fetchIcon: (url) => ipcRenderer.invoke('icon:fetch', url),
  weather: () => ipcRenderer.invoke('weather:get'),
  stats: () => ipcRenderer.invoke('system:stats'),
  systemAction: (action) => ipcRenderer.invoke('system:action', action),
  home: () => ipcRenderer.invoke('home:show'),
  jellyfinHero: (force = false) => ipcRenderer.invoke('jellyfin:hero', force === true),
  playJellyfin: (id) => ipcRenderer.invoke('jellyfin:play', id),
  networkStatus: () => ipcRenderer.invoke('network:status'),
  getAudio: () => ipcRenderer.invoke('audio:get'),
  setAudioOutput: (id) => ipcRenderer.invoke('audio:output', id),
  setSystemVolume: (value) => ipcRenderer.invoke('audio:volume', value),
  adjustSystemVolume: (delta) => ipcRenderer.invoke('audio:adjust', delta),
  keyboardKey: (payload) => ipcRenderer.send('keyboard:key', payload),
  toggleSystemKeyboard: () => ipcRenderer.invoke('osk:toggle'),
  moonlightGames: () => ipcRenderer.invoke('moonlight:games'),
  openMoonlight: () => ipcRenderer.invoke('moonlight:open'),
  playMoonlight: (name) => ipcRenderer.invoke('moonlight:play', name),
  navHover: (inside) => ipcRenderer.send('nav:hover', inside),
  onNavVisible: (fn) => ipcRenderer.on('nav:visible', (_e, value) => fn(value)),
  onState: (fn) => ipcRenderer.on('state:changed', (_e, value) => fn(value)),
  onNavigate: (fn) => ipcRenderer.on('navigate', (_e, value) => fn(value)),
  onToast: (fn) => ipcRenderer.on('toast', (_e, value) => fn(value))
});

const isEditable = element => !!element?.closest?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable=true],[role=textbox]');
addEventListener('focusin', event => { if (isEditable(event.target)) ipcRenderer.send('keyboard:focus', true); }, true);
addEventListener('focusout', () => setTimeout(() => ipcRenderer.send('keyboard:focus', isEditable(document.activeElement)), 180), true);
