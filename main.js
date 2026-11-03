const { app, BrowserWindow, WebContentsView, ipcMain, globalShortcut, session, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

// A second shell must never create another transparent edge interception layer.
if (!app.requestSingleInstanceLock()) app.exit(0);
process.on('SIGTERM', () => app.quit());
process.on('SIGINT', () => app.quit());
process.on('uncaughtException', error => {
  log(`uncaught exception ${error?.stack || error}`);
  // An unknown main-process state is unsafe to keep alive. The kiosk wrapper
  // restarts only non-zero exits, while normal shutdowns still remain clean.
  setTimeout(() => app.exit(1), 120);
});
process.on('unhandledRejection', error => log(`unhandled rejection ${error?.stack || error}`));

const APP_DIR = __dirname;
const DATA_DIR = path.join(os.homedir(), '.config', 'raspy-tv');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const ICON_DIR = path.join(DATA_DIR, 'icons');
const LOG_DIR = path.join(DATA_DIR, 'logs');
const NAV_STATE_FILE = path.join(DATA_DIR, 'nav-state.json');
const DAILY_HERO_FILE = path.join(DATA_DIR, 'daily-hero.json');
const JELLYFIN_VAULT_FILE = path.join(DATA_DIR, 'jellyfin-session.bin');
const CACHE_STAMP_FILE = path.join(DATA_DIR, 'cache-maintenance.json');
const NAV_SOCKET = path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() || 1000}`, 'raspytv-nav.sock');
const MOONLIGHT_BIN = '/usr/bin/moonlight-qt';
const SITE_FILE = path.join(DATA_DIR, 'site.json');
// Network addresses and location live outside the repository, in ~/.config/raspy-tv/site.json
// (see site.example.json). An empty URL hides the matching tile.
const SITE_DEFAULTS = { jellyfinUrl: 'http://jellyfin.local:8096', jellyfinRemoteUrl: '', lumoPath: '/web/cinematic/index.html#home', moonlightHost: '', dashboardUrl: '', immichUrl: '', weatherLatitude: 48.8566, weatherLongitude: 2.3522, weatherLabel: 'Paris', timezone: 'Europe/Paris' };
function loadSite() { try { return { ...SITE_DEFAULTS, ...JSON.parse(fs.readFileSync(SITE_FILE, 'utf8')) }; } catch { return { ...SITE_DEFAULTS }; } }
const SITE = loadSite();
const JELLYFIN = new URL(SITE.jellyfinUrl).origin;
const JELLYFIN_HOSTS = new Set([SITE.jellyfinUrl, SITE.jellyfinRemoteUrl].filter(Boolean).map(url => new URL(url).hostname.toLowerCase()));
const MOONLIGHT_HOST = SITE.moonlightHost;
const DEFAULT_APPS = [
  { id: 'jellyfin', name: 'Lumo', url: `${JELLYFIN}${SITE.lumoPath}`, icon: 'assets/icons/lumo.png', color: '#d3a13a', description: 'Ta médiathèque' },
  { id: 'jellyfin-web', name: 'Jellyfin', url: `${SITE.jellyfinRemoteUrl ? new URL(SITE.jellyfinRemoteUrl).origin : JELLYFIN}/web/#/home`, icon: 'assets/icons/jellyfin.svg', color: '#a855f7', description: 'Interface Jellyfin officielle' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com/', icon: 'assets/icons/youtube.svg', color: '#ff244a', description: 'Vidéos et musique' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com/', icon: 'assets/icons/spotify.svg', color: '#1ed760', description: 'Musique et podcasts' },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv/', icon: 'assets/icons/twitch.svg', color: '#a970ff', description: 'Live et gaming' },
  { id: 'netflix', name: 'Netflix', url: 'https://www.netflix.com/', icon: 'assets/icons/netflix.svg', color: '#e50914', description: 'Films et séries' },
  { id: 'homelab', name: 'Dashboard', url: SITE.dashboardUrl, icon: 'assets/icons/dashy.png', color: '#00e5d0', description: 'Dashboard du lab' },
  { id: 'immich', name: 'Immich', url: SITE.immichUrl, icon: 'assets/icons/immich.png', color: '#fa2921', description: 'Photos et vidéos' }
].filter(app => validUrl(app.url));
const DEFAULTS = { theme: 'dark', background: 'color:#000000', clock24: true, sounds: true, soundVolume: 45, reducedMotion: false, showWeather: true, showClock: true, showSpotify: true, showRecent: true, maxRecent: 4, maxResidentApps: 4, navDelay: 850, appOrder: DEFAULT_APPS.map(a => a.id), shortcuts: [], recent: [], restoreApps: false };
let artMode = false;
let mainWindow, splashWindow, navWindow, keyboardView, keyboardTarget, loadingView, moonlightOverlay, squeekboardProcess, layerNavProcess, navControlServer, quitting = false, activeId = null, config, views = new Map(), navShown = false, navTimer, navInputTimer, keyboardShown = false, keyboardHideTimer, systemKeyboardVisible = false, heroCache = null, heroCacheAt = 0, heroCacheDay = '', jellyfinAuthHeader = '', jellyfinVault = null, nativeProcess = null, moonlightCache = null, moonlightCacheAt = 0, moonlightRequest = null, systemVolume = null, loadingTimer = null, loadingShownAt = 0;
const viewLastUsed = new Map();
const adapterCssKeys = new WeakMap();
const configuredSessions = new Set();

function ensureDirs() { [DATA_DIR, ICON_DIR, LOG_DIR].forEach(dir => { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch {} }); }
function log(message) {
  try {
    ensureDirs();
    const file = path.join(LOG_DIR, 'raspy-tv.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 2 * 1024 * 1024) {
      try { fs.rmSync(`${file}.1`, { force: true }); } catch {}
      fs.renameSync(file, `${file}.1`);
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${String(message).slice(0, 4000)}\n`, { mode: 0o600 });
  } catch {}
}
function safeConfig(raw) { const source = raw && typeof raw === 'object' ? raw : {}; const residentLimit = Number(source.maxResidentApps); return { ...DEFAULTS, ...source, maxResidentApps: Number.isInteger(residentLimit) ? Math.min(6, Math.max(2, residentLimit)) : DEFAULTS.maxResidentApps, shortcuts: Array.isArray(source.shortcuts) ? source.shortcuts.filter(validShortcut) : [], recent: Array.isArray(source.recent) ? source.recent.filter(x => typeof x === 'string').slice(0, 12) : [], appOrder: Array.isArray(source.appOrder) ? source.appOrder.filter(x => typeof x === 'string') : DEFAULTS.appOrder }; }
function atomicWrite(file, data, mode = 0o600) { const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, data, { mode }); fs.renameSync(temporary, file); try { fs.chmodSync(file, mode); } catch {} }
function loadConfig() { ensureDirs(); try { const loaded = safeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {} return loaded; } catch (error) { log(`config recovery ${error.message}`); const defaults = { ...DEFAULTS }; atomicWrite(CONFIG_FILE, JSON.stringify(defaults, null, 2)); return defaults; } }
function saveConfig() { try { atomicWrite(CONFIG_FILE, JSON.stringify(config, null, 2)); emitState(); } catch (error) { log(`config save failure ${error.message}`); sendToast('Impossible d’enregistrer les paramètres.'); } }
function validUrl(value) { try { const u = new URL(value); return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && !u.username && !u.password; } catch { return false; } }
function validShortcut(item) { return item && typeof item.id === 'string' && typeof item.name === 'string' && item.name.length > 0 && item.name.length < 61 && validUrl(item.url); }
function validIcon(value) { if (typeof value !== 'string' || value.length > 2048) return false; if (value.startsWith('file://')) { const file = path.resolve(value.slice(7)); return file.startsWith(ICON_DIR + path.sep); } return /^assets\/icons\/[\w.-]+$/.test(value) || validUrl(value); }
function allApps() { return [...DEFAULT_APPS.map(app => ({ ...app, native: true })), ...config.shortcuts.map(app => ({ ...app, native: false }))]; }
function localDayKey(date = new Date()) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SITE.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const get = type => parts.find(part => part.type === type)?.value || ''; return `${get('year')}-${get('month')}-${get('day')}`; }
function shuffled(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
function dailyHeroSelection(items, count = 7) {
  const day = localDayKey();
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(DAILY_HERO_FILE, 'utf8')); } catch {}
  const byId = new Map(items.map(item => [item.id, item]));
  if (saved?.day === day && Array.isArray(saved.ids)) {
    const selected = saved.ids.map(id => byId.get(id)).filter(Boolean);
    if (selected.length >= Math.min(count, items.length)) return { day, items: selected.slice(0, count) };
  }
  const previous = new Set(Array.isArray(saved?.ids) ? saved.ids : []);
  const fresh = items.filter(item => !previous.has(item.id));
  const pool = fresh.length >= Math.min(count, items.length) ? fresh : items;
  const selected = shuffled(pool).slice(0, count);
  try { fs.writeFileSync(DAILY_HERO_FILE, JSON.stringify({ day, ids: selected.map(item => item.id) }, null, 2), { mode: 0o600 }); } catch {}
  return { day, items: selected };
}
function loadJellyfinVault() {
  try {
    const raw = fs.readFileSync(JELLYFIN_VAULT_FILE);
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
    const value = JSON.parse(text);
    if (!value || typeof value.token !== 'string' || typeof value.userId !== 'string') return null;
    return value;
  } catch { return null; }
}
function saveJellyfinVault(value) {
  if (!value?.token || !value?.userId) return;
  const normalized = { token: String(value.token), userId: String(value.userId), serverId: String(value.serverId || ''), serverName: String(value.serverName || 'Jellyfin'), savedAt: Date.now() };
  if (jellyfinVault?.token === normalized.token && jellyfinVault?.userId === normalized.userId && jellyfinVault?.serverId === normalized.serverId) return;
  try {
    const text = JSON.stringify(normalized);
    const bytes = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
    atomicWrite(JELLYFIN_VAULT_FILE, bytes);
    jellyfinVault = normalized;
    log(`jellyfin session saved (${safeStorage.isEncryptionAvailable() ? 'encrypted' : 'protected-file'})`);
  } catch (error) { log(`jellyfin session save failure ${error.message}`); }
}
function jellyfinCandidateList(raw) {
  const candidates = [];
  const add = (token, userId, serverId = '', serverName = '') => {
    token = String(token || '').replace(/[^A-Za-z0-9._~-]/g, '');
    userId = String(userId || '').replace(/[^A-Fa-f0-9]/g, '');
    if (token && userId && !candidates.some(item => item.token === token && item.userId === userId)) candidates.push({ token, userId, serverId: String(serverId || ''), serverName: String(serverName || '') });
  };
  try { const own = typeof raw?.cinematic === 'string' ? JSON.parse(raw.cinematic) : raw?.cinematic; add(own?.token || own?.accessToken || own?.AccessToken, own?.userId || own?.UserId, own?.serverId || own?.ServerId, own?.serverName || own?.ServerName); } catch {}
  try { const credentials = typeof raw?.jellyfin === 'string' ? JSON.parse(raw.jellyfin) : raw?.jellyfin; for (const server of credentials?.Servers || credentials?.servers || []) add(server.AccessToken || server.accessToken, server.UserId || server.userId, server.Id || server.id, server.Name || server.name); add(credentials?.AccessToken || credentials?.accessToken, credentials?.UserId || credentials?.userId); } catch {}
  return candidates;
}
async function validateJellyfinCandidate(candidate, origin) {
  if (!candidate?.token || !candidate?.userId) return null;
  try {
    const headers = { 'X-Emby-Token': candidate.token, Authorization: `MediaBrowser Client="RaspyTV", Device="Raspberry Pi", DeviceId="raspytv-home", Version="2.3.0", Token="${candidate.token}"` };
    const [userResponse, infoResponse] = await Promise.all([
      fetch(`${origin}/Users/${encodeURIComponent(candidate.userId)}`, { headers, cache: 'no-store', signal: AbortSignal.timeout(5000) }),
      fetch(`${origin}/System/Info/Public`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }),
    ]);
    if (!userResponse.ok) return null;
    const info = infoResponse.ok ? await infoResponse.json() : {};
    return { ...candidate, serverId: candidate.serverId || info.Id || '', serverName: candidate.serverName || info.ServerName || 'Jellyfin' };
  } catch { return null; }
}
async function restoreJellyfinStorage(webContents, origin) {
  if (!jellyfinVault) return false;
  const valid = await validateJellyfinCandidate(jellyfinVault, origin);
  if (!valid || webContents.isDestroyed()) return false;
  const server = { DateLastAccessed: Date.now(), LastConnectionMode: 2, ManualAddress: origin, manualAddressOnly: false, LocalAddress: JELLYFIN, Address: origin, Name: valid.serverName, Id: valid.serverId, UserId: valid.userId, AccessToken: valid.token };
  await webContents.executeJavaScript(`(()=>{localStorage.setItem('jellyfin_credentials',${JSON.stringify(JSON.stringify({ Servers: [server] }))});localStorage.setItem('cinematic_credentials',${JSON.stringify(JSON.stringify({ token: valid.token, userId: valid.userId, serverId: valid.serverId, serverName: valid.serverName }))});return true})()`, true);
  return true;
}
async function captureJellyfinStorage(view, service) {
  if (!view || view.webContents.isDestroyed()) return;
  const origin = new URL(service.url).origin;
  try {
    const raw = await view.webContents.executeJavaScript(`(()=>({cinematic:localStorage.getItem('cinematic_credentials'),jellyfin:localStorage.getItem('jellyfin_credentials')}))()`, true);
    const candidates = jellyfinCandidateList(raw);
    for (const candidate of candidates) {
      const valid = await validateJellyfinCandidate(candidate, origin);
      if (valid) { saveJellyfinVault(valid); return; }
    }
  } catch (error) { if (!/destroyed|navigation|frame/i.test(error.message)) log(`jellyfin session capture failure ${error.message}`); }
}
function maintainSessionCache(serviceSession, id) {
  let stamps = {};
  try { stamps = JSON.parse(fs.readFileSync(CACHE_STAMP_FILE, 'utf8')); } catch {}
  if (Date.now() - Number(stamps[id] || 0) < 3 * 86400000) return;
  serviceSession.clearCache().then(() => { stamps[id] = Date.now(); atomicWrite(CACHE_STAMP_FILE, JSON.stringify(stamps)); log(`cache cleared ${id}`); }).catch(error => log(`cache cleanup failure ${id} ${error.message}`));
}
function state() { return { config, apps: allApps().map(a => ({ ...a, open: views.has(a.id) })), activeId, nativeMode: !!nativeProcess, artMode, site: { weatherLabel: SITE.weatherLabel, moonlight: !!MOONLIGHT_HOST } }; }
function layerNavState() { return { activeId, nativeMode: !!nativeProcess, artMode, systemVolume, apps: allApps().map(app => ({ id: app.id, name: app.name, native: app.native, icon: app.icon?.startsWith('assets/') ? path.join(APP_DIR, app.icon) : app.icon?.startsWith('file://') ? app.icon.slice(7) : '', color: app.color || '#4f8cff' })) }; }
function writeLayerNavState() { try { fs.writeFileSync(NAV_STATE_FILE, JSON.stringify(layerNavState()), { mode: 0o600 }); } catch {} }
function emitState() { writeLayerNavState(); if (!mainWindow || mainWindow.isDestroyed()) return; mainWindow.webContents.send('state:changed', state()); if (navWindow && !navWindow.isDestroyed() && !navWindow.webContents.isDestroyed()) navWindow.webContents.send('state:changed', state()); }
function isShellSender(sender) { return sender === mainWindow?.webContents || sender === navWindow?.webContents; }
function requireMainSender(event) { if (event.sender !== mainWindow?.webContents) throw new Error('Émetteur IPC non autorisé'); }
function requireShellSender(event) { if (!isShellSender(event.sender)) throw new Error('Émetteur IPC non autorisé'); }
function viewBounds() { const { width, height } = mainWindow.getContentBounds(); return { x: 0, y: 0, width, height }; }
function hideAllViews() { for (const view of views.values()) view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); }
function showLoading(label = 'Chargement') {
  if (!loadingView || !mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(loadingTimer);
  loadingShownAt = Date.now();
  loadingView.webContents.executeJavaScript(`document.querySelector('[data-label]').textContent=${JSON.stringify(String(label).slice(0, 80))}`, true).catch(() => {});
  try { mainWindow.contentView.removeChildView(loadingView); } catch {}
  mainWindow.contentView.addChildView(loadingView);
  loadingView.setBounds(viewBounds());
}
function hideLoadingSoon(delay = 0) {
  if (!loadingView) return;
  clearTimeout(loadingTimer);
  const remaining = Math.max(0, 360 - (Date.now() - loadingShownAt), delay);
  loadingTimer = setTimeout(() => loadingView?.setBounds({ x: 0, y: 0, width: 0, height: 0 }), remaining);
}
function pauseViewMedia(view) {
  if (!view || view.webContents.isDestroyed()) return;
  // Muting is synchronous, so no audio can leak while the page receives the pause command.
  view.webContents.setAudioMuted(true);
  view.webContents.executeJavaScript(`(()=>{const pauseDocument=doc=>{doc.querySelectorAll('video,audio').forEach(media=>{try{media.pause()}catch{}});doc.querySelectorAll('iframe').forEach(frame=>{try{if(frame.contentDocument)pauseDocument(frame.contentDocument)}catch{}})};pauseDocument(document);try{navigator.mediaSession.playbackState='paused'}catch{};return true})()`, true).catch(() => {});
}
function pauseActiveMedia() { if (activeId) pauseViewMedia(views.get(activeId)); }
function restoreShellFullscreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  mainWindow.setKiosk(true);
  mainWindow.setFullScreen(true);
  mainWindow.focus();
}
function restoreFromNative() { hideMoonlightOverlay(); if (!mainWindow || mainWindow.isDestroyed()) return; restoreShellFullscreen(); activeId = null; hideAllViews(); mainWindow.webContents.focus(); emitState(); }
function stopNativeMoonlight() {
  const child = nativeProcess;
  nativeProcess = null;
  if (child && !child.killed) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch {} }
  }
  // Also stop an orphaned Qt client. This covers a stream that outlived its
  // tracked launcher and prevents its audio continuing behind Lumo/home.
  execFile('/usr/bin/pkill', ['-TERM', '-x', 'moonlight-qt'], error => {
    if (error && error.code !== 1) log(`moonlight cleanup failure ${error.message}`);
  });
  hideMoonlightOverlay();
}
function showHome() { const refreshJellyfin = activeId === 'jellyfin' || activeId === 'jellyfin-web'; showLoading('Accueil RaspyTV'); stopNativeMoonlight(); hideKeyboard(); pauseActiveMedia(); activeId = null; if (refreshJellyfin) { heroCache = null; heroCacheAt = 0; } hideAllViews(); restoreShellFullscreen(); mainWindow.webContents.focus(); emitState(); hideLoadingSoon(120); }
function leaveNativeForApp() { stopNativeMoonlight(); restoreShellFullscreen(); }

function parseCsvLine(line) {
  const values = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; } else value += char; }
  values.push(value.trim()); return values;
}
function moonlightGames() {
  if (!MOONLIGHT_HOST) return Promise.resolve({ games: [], needsPairing: false, unavailable: true });
  if (moonlightCache && Date.now() - moonlightCacheAt < 60_000) return Promise.resolve(moonlightCache);
  if (moonlightRequest) return moonlightRequest;
  moonlightRequest = new Promise(resolve => execFile(MOONLIGHT_BIN, ['list', '--csv', MOONLIGHT_HOST], { timeout: 5_000, maxBuffer: 1024 * 1024, env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } }, (error, stdout, stderr) => {
    const message = String(stderr || error?.message || '');
    const rows = String(stdout || '').split(/\r?\n/).filter(Boolean).slice(1).map(parseCsvLine);
    const games = rows.filter(row => row[0] && row[4] !== 'true').map(row => ({ name: row[0], id: row[1], hdr: row[2] === 'true', boxart: /^(file:|https?:)/.test(row[6] || '') ? row[6] : '' }));
    if (games.length) { log(`moonlight games loaded: ${games.length}`); return resolve({ games, needsPairing: false, unavailable: false }); }
    if (error) { log(`moonlight list unavailable: ${message.split('\n')[0] || 'unknown error'}`); return resolve({ games: [], needsPairing: /not been paired|pair before/i.test(message), unavailable: !/not been paired|pair before/i.test(message) }); }
    resolve({ games, needsPairing: false, unavailable: false });
  })).then(result => { moonlightCache = result; moonlightCacheAt = Date.now(); return result; }).finally(() => { moonlightRequest = null; });
  return moonlightRequest;
}
function ensureSqueekboard() { return new Promise(resolve => execFile('/usr/bin/pgrep', ['-x', 'squeekboard'], error => { if (!error) return resolve(); squeekboardProcess = spawn('/usr/bin/squeekboard', [], { env: process.env, stdio: 'ignore' }); squeekboardProcess.once('error', err => log(`squeekboard launch failure ${err.message}`)); setTimeout(resolve, 650); })); }
async function setSystemKeyboard(visible) { systemKeyboardVisible = !!visible; await ensureSqueekboard(); return new Promise(resolve => execFile('/usr/bin/busctl', ['--user', 'call', 'sm.puri.OSK0', '/sm/puri/OSK0', 'sm.puri.OSK0', 'SetVisible', 'b', systemKeyboardVisible ? 'true' : 'false'], { timeout: 2500 }, error => { if (error) { log(`squeekboard toggle failure ${error.message}`); systemKeyboardVisible = false; } moonlightOverlay?.webContents.send('osk:state', systemKeyboardVisible); resolve(systemKeyboardVisible); })); }
function showMoonlightOverlay() { raiseNav(); positionNav(); emitState(); }
function hideMoonlightOverlay() { setSystemKeyboard(false).catch(() => {}); if (moonlightOverlay && !moonlightOverlay.isDestroyed()) moonlightOverlay.hide(); }
function launchNativeMoonlight(gameName = '') {
  if (nativeProcess && !nativeProcess.killed) { sendToast('Moonlight est déjà ouvert.'); return false; }
  const start = async () => {
    try {
      await new Promise((resolve, reject) => execFile('/usr/bin/python3', [path.join(APP_DIR, 'moonlight-kiosk-setup.py')], { timeout: 8000 }, error => error ? reject(error) : resolve()));
    } catch (error) {
      log(`moonlight kiosk setup failure ${error.message}`);
      sendToast('Impossible de préparer Moonlight. Relance RaspyTV.');
      return false;
    }
    if (nativeProcess && !nativeProcess.killed) return false;
    const args = gameName ? ['--display-mode', 'windowed', '--absolute-mouse', '--resolution', '1920x1080', 'stream', MOONLIGHT_HOST, gameName] : [];
    // Keep the Wayland surface mapped: hide/show during native streaming can
    // crash Electron on the Pi when returning home (SIGTRAP).
    pauseActiveMedia(); mainWindow.setKiosk(false); mainWindow.setFullScreen(false); mainWindow.maximize(); showMoonlightOverlay();
    // SDL's automatic click capture can retain the pointer while switching
    // from the Qt game picker to the stream, blocking the Wayland edge panel.
    nativeProcess = spawn(MOONLIGHT_BIN, args, { detached: true, env: { ...process.env, SDL_MOUSE_AUTO_CAPTURE: '0', SDL_VIDEO_X11_NET_WM_BYPASS_COMPOSITOR: '0' }, stdio: 'ignore' });
    const child = nativeProcess;
    setTimeout(() => { if (nativeProcess === child) showMoonlightOverlay(); }, 1600);
    child.once('error', error => { if (nativeProcess !== child) return; nativeProcess = null; log(`moonlight launch failure ${error.message}`); restoreFromNative(); sendToast('Impossible de lancer Moonlight.'); });
    child.once('exit', () => { if (nativeProcess !== child) return; nativeProcess = null; restoreFromNative(); });
    return true;
  };
  if (!gameName) return start();
  return moonlightGames().then(data => { if (!data.games.some(game => game.name === gameName)) throw new Error('Jeu Moonlight introuvable'); return start(); });
}
function evictInactiveViews(keepId) {
  const limit = config.maxResidentApps;
  while (views.size >= limit) {
    const candidate = [...views.keys()].filter(id => id !== keepId && id !== activeId).sort((a, b) => (viewLastUsed.get(a) || 0) - (viewLastUsed.get(b) || 0))[0];
    if (!candidate) return;
    closeService(candidate, { silent: true, reason: 'memory-limit' });
  }
}
async function applyWebAppAdapter(view, service) {
  if (!view || view.webContents.isDestroyed()) return;
  const previous = adapterCssKeys.get(view.webContents);
  if (previous) await view.webContents.removeInsertedCSS(previous).catch(() => {});
  const dashyCss = service?.id === 'homelab' ? `*,*::before,*::after{backdrop-filter:none!important;transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}html{scroll-behavior:auto!important}video,[class*="animated-background"],[class*="particle"]{display:none!important}` : '';
  const css = `html,body{overscroll-behavior:none!important}html{scrollbar-width:none!important}*{scrollbar-width:none!important}::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}html.raspy-cursor-hidden,html.raspy-cursor-hidden *{cursor:none!important}${dashyCss}`;
  const key = await view.webContents.insertCSS(css, { cssOrigin: 'user' }).catch(() => null);
  if (key) adapterCssKeys.set(view.webContents, key);
  await view.webContents.executeJavaScript(`(()=>{if(window.__raspyTvInputAdapter)return true;window.__raspyTvInputAdapter=true;let timer,focusTimer;const root=document.documentElement,hide=()=>root.classList.add('raspy-cursor-hidden'),show=()=>{root.classList.remove('raspy-cursor-hidden');clearTimeout(timer);timer=setTimeout(hide,1800)},editable=el=>!!el?.closest?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable=true],[role=textbox]');addEventListener('pointermove',show,{passive:true});addEventListener('pointerdown',show,{passive:true});addEventListener('wheel',show,{passive:true});addEventListener('keydown',hide,{passive:true});addEventListener('touchstart',hide,{passive:true});addEventListener('focusin',event=>{clearTimeout(focusTimer);if(editable(event.target))console.info('__RASPY_OSK_OPEN__')},true);addEventListener('focusout',()=>{clearTimeout(focusTimer);focusTimer=setTimeout(()=>{if(!editable(document.activeElement))console.info('__RASPY_OSK_CLOSE__')},180)},true);hide();return true})()`, true).catch(() => {});
}
function persistentCookieDetails(cookie) {
  const host = String(cookie.domain || '').replace(/^\./, '');
  if (!host) return null;
  return {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || '/',
    secure: !!cookie.secure,
    httpOnly: !!cookie.httpOnly,
    ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
    expirationDate: Math.floor(Date.now() / 1000) + 31536000,
  };
}
function keepJellyfinSession(serviceSession) {
  if (configuredSessions.has(serviceSession)) return;
  configuredSessions.add(serviceSession);
  let promoting = false;
  const promote = async cookie => {
    if (!cookie?.session || !JELLYFIN_HOSTS.has(String(cookie.domain || '').replace(/^\./, '').toLowerCase())) return;
    const details = persistentCookieDetails(cookie);
    if (!details) return;
    try { promoting = true; await serviceSession.cookies.set(details); await serviceSession.flushStorageData(); }
    catch (error) { log(`jellyfin cookie persistence failure ${error.message}`); }
    finally { promoting = false; }
  };
  serviceSession.cookies.on('changed', (_event, cookie, _cause, removed) => { if (!removed && !promoting) promote(cookie); });
  serviceSession.cookies.get({}).then(cookies => Promise.all(cookies.map(promote))).catch(error => log(`jellyfin cookie scan failure ${error.message}`));
}
async function loadServiceContent(view, service) {
  const jellyfin = service.id === 'jellyfin' || service.id === 'jellyfin-web';
  const origin = new URL(service.url).origin;
  try {
    if (jellyfin && jellyfinVault) {
      await view.webContents.loadURL(`${origin}/System/Info/Public`);
      await restoreJellyfinStorage(view.webContents, origin);
      showLoading(service.name);
    }
    await view.webContents.loadURL(service.url);
  } catch (error) {
    if (error?.code !== 'ERR_ABORTED' && !/-3\b/.test(String(error?.message))) {
      log(`load failure ${service.id} ${error.message}`);
      sendToast(`${service.name} ne répond pas. Vérifie la connexion.`);
    }
    hideLoadingSoon();
  }
}
function createServiceView(service) {
  const partition = `persist:raspy-tv-${service.id}`;
  const serviceSession = session.fromPartition(partition);
  const jellyfin = service.id === 'jellyfin' || service.id === 'jellyfin-web';
  if (jellyfin) keepJellyfinSession(serviceSession);
  maintainSessionCache(serviceSession, service.id);
  serviceSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'fullscreen'));
  serviceSession.setPermissionCheckHandler((_webContents, permission) => permission === 'fullscreen');
  const view = new WebContentsView({ webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: true } });
  mainWindow.contentView.addChildView(view);
  raiseNav();
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || (input.key !== 'Escape' && input.key !== 'Home')) return;
    event.preventDefault();
    if (service.id === 'jellyfin' && input.key === 'Escape') {
      view.webContents.executeJavaScript(`typeof window.__cinematicClosePlayer==='function'&&window.__cinematicClosePlayer(true)`, true)
        .then(closed => { if (!closed) showHome(); })
        .catch(showHome);
      return;
    }
    showHome();
  });
  view.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => { if (!isMainFrame || code === -3) return; hideLoadingSoon(); sendToast(`${service.name} : chargement impossible (${description}).`); log(`load failure ${service.id} ${code} ${url}`); setTimeout(() => { if (activeId === service.id) showHome(); }, 900); });
  view.webContents.on('render-process-gone', (_event, details) => { log(`renderer gone ${service.id} ${details.reason}`); sendToast(`${service.name} a été relancée après une erreur.`); if (activeId === service.id) showHome(); closeService(service.id, { silent: true, reason: details.reason }); });
  view.webContents.on('unresponsive', () => { log(`renderer unresponsive ${service.id}`); sendToast(`${service.name} ne répond plus. Retour à l’accueil.`); if (activeId === service.id) showHome(); });
  view.webContents.on('dom-ready', () => { applyWebAppAdapter(view, service); if (jellyfin) setTimeout(() => captureJellyfinStorage(view, service), 1800); });
  view.webContents.on('did-finish-load', () => { hideLoadingSoon(); if (jellyfin) setTimeout(() => captureJellyfinStorage(view, service), 2500); });
  if (jellyfin) view.webContents.on('did-navigate-in-page', () => setTimeout(() => captureJellyfinStorage(view, service), 1200));
  view.webContents.on('console-message', (_event, level, message) => { const text = typeof level === 'object' ? level.message : message; if (text === '__RASPY_OSK_OPEN__') showKeyboard(view.webContents); else if (text === '__RASPY_OSK_CLOSE__') hideKeyboardSoon(view.webContents); });
  view.webContents.on('will-navigate', (event, url) => { if (!validUrl(url)) event.preventDefault(); });
  loadServiceContent(view, service);
  return view;
}
function launch(serviceId) { const service = allApps().find(a => a.id === serviceId); if (!service) throw new Error('Application inconnue'); showLoading(service.name); leaveNativeForApp(); hideKeyboard(); if (activeId && activeId !== serviceId) pauseActiveMedia(); let view = views.get(service.id); if (!view) { evictInactiveViews(service.id); view = createServiceView(service); views.set(service.id, view); log(`opened ${service.id}`); } hideAllViews(); view.webContents.setAudioMuted(false); view.setBounds(viewBounds()); showLoading(service.name); raiseNav(); activeId = service.id; viewLastUsed.set(service.id, Date.now()); config.recent = [service.id, ...config.recent.filter(x => x !== service.id)].slice(0, 12); saveConfig(); view.webContents.focus(); if (!view.webContents.isLoading()) hideLoadingSoon(100); }
async function jellyfinHero(force = false) {
  const today = localDayKey();
  const cacheTtl = heroCache?.items?.length ? 15 * 60 * 1000 : heroCache?.needsLogin ? 10 * 60 * 1000 : 60 * 1000;
  if (!force && heroCache && heroCacheDay === today && Date.now() - heroCacheAt < cacheTtl) return heroCache;
  const helper = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:raspy-tv-jellyfin', contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    maintainSessionCache(helper.webContents.session, 'jellyfin');
    // Load a tiny same-origin JSON page: localStorage stays accessible without booting the full Cinematic client.
    await helper.loadURL(`${JELLYFIN}/System/Info/Public`);
    await restoreJellyfinStorage(helper.webContents, JELLYFIN).catch(() => false);
    const result = await helper.webContents.executeJavaScript(`(async()=>{try{
      const parse=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}},own=parse('cinematic_credentials'),jf=parse('jellyfin_credentials'),candidates=[],add=(token,userId)=>{token=String(token||'').replace(/[^A-Za-z0-9._~-]/g,'');userId=String(userId||'').replace(/[^A-Fa-f0-9]/g,'');if(token&&userId&&!candidates.some(x=>x.token===token&&x.userId===userId))candidates.push({token,userId})};
      add(own?.token||own?.accessToken||own?.AccessToken,own?.userId||own?.UserId);for(const server of jf?.Servers||jf?.servers||[])add(server.AccessToken||server.accessToken,server.UserId||server.userId);add(jf?.AccessToken||jf?.accessToken,jf?.UserId||jf?.userId);
      if(!candidates.length)return{items:[],continueItems:[],needsLogin:true,error:'credentials'};
      let selected=null,headers=null,authorization='';for(const candidate of candidates){authorization='MediaBrowser Client="RaspyTV", Device="Raspberry Pi", DeviceId="raspytv-home", Version="2.2.0", Token="'+candidate.token+'"';const probeHeaders={Authorization:authorization,'X-Emby-Token':candidate.token};try{const probe=await fetch('/Users/'+encodeURIComponent(candidate.userId),{headers:probeHeaders,cache:'no-store'});if(probe.ok){selected=candidate;headers=probeHeaders;break}}catch{}}
      if(!selected)return{items:[],continueItems:[],needsLogin:true,error:'authentication'};
      const userId=selected.userId,fields='Overview,ProductionYear,RunTimeTicks,CommunityRating,UserData,ParentIndexNumber,IndexNumber,SeriesName',query='UserId='+encodeURIComponent(userId);
      let recentResponse=await fetch('/Items?'+query+'&Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&SortOrder=Ascending&Limit=200&Fields='+fields+'&ImageTypeLimit=1&EnableImageTypes=Backdrop,Primary',{headers,cache:'no-store'});
      if(!recentResponse.ok)recentResponse=await fetch('/Users/'+encodeURIComponent(userId)+'/Items?Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&SortOrder=Ascending&Limit=200&Fields='+fields+'&ImageTypeLimit=1&EnableImageTypes=Backdrop,Primary',{headers,cache:'no-store'});
      let resumeResponse=await fetch('/UserItems/Resume?'+query+'&MediaTypes=Video&Limit=12&Fields='+fields+'&ImageTypeLimit=1&EnableImageTypes=Backdrop,Primary,Thumb',{headers,cache:'no-store'});
      if(!resumeResponse.ok)resumeResponse=await fetch('/Users/'+encodeURIComponent(userId)+'/Items/Resume?MediaTypes=Video&Limit=12&Fields='+fields+'&ImageTypeLimit=1&EnableImageTypes=Backdrop,Primary,Thumb',{headers,cache:'no-store'});
      if(!recentResponse.ok)throw new Error(String(recentResponse.status));
      const recent=await recentResponse.json(),resume=resumeResponse.ok?await resumeResponse.json():{Items:[]},image=(x,type,width)=>location.origin+'/Items/'+x.Id+'/Images/'+type+(type==='Backdrop'?'/0':'')+'?maxWidth='+width+'&quality=76';
      const items=(recent.Items||[]).filter(x=>x.BackdropImageTags?.length).map(x=>({id:x.Id,name:x.Name,overview:x.Overview||'',year:x.ProductionYear||'',rating:x.CommunityRating?Number(x.CommunityRating).toFixed(1):'',runtime:x.RunTimeTicks?Math.round(x.RunTimeTicks/600000000):'',backdrop:image(x,'Backdrop',1400)}));
      const continueItems=(resume.Items||[]).slice(0,8).map(x=>({id:x.Id,name:x.Name,subtitle:x.Type==='Episode'?[x.SeriesName,'S'+(x.ParentIndexNumber||0)+' E'+(x.IndexNumber||0)].filter(Boolean).join(' · '):(x.ProductionYear||'Film'),progress:Math.max(0,Math.min(100,Number(x.UserData?.PlayedPercentage||0))),image:x.BackdropImageTags?.length?image(x,'Backdrop',640):x.ImageTags?.Primary?image(x,'Primary',500):''}));
      return{items,continueItems,needsLogin:false,authorization,session:{token:selected.token,userId:selected.userId}}
    }catch(error){return{items:[],continueItems:[],error:error.message}}})()`, true);
    if (result.authorization) jellyfinAuthHeader = result.authorization;
    if (result.session) { const valid = await validateJellyfinCandidate(result.session, JELLYFIN); if (valid) saveJellyfinVault(valid); }
    delete result.authorization;
    delete result.session;
    if (result.error) log(`jellyfin hero unavailable: ${result.error}`);
    if (result.items?.length) { const daily = dailyHeroSelection(result.items); result.items = daily.items; heroCacheDay = daily.day; } else heroCacheDay = today;
    heroCache = result; heroCacheAt = Date.now(); return result;
  } finally { if (!helper.isDestroyed()) helper.destroy(); }
}
async function playJellyfin(itemId) {
  if (!/^[a-f0-9]{16,64}$/i.test(String(itemId || ''))) throw new Error('Identifiant Jellyfin invalide');
  launch('jellyfin'); const view = views.get('jellyfin');
  const trigger = () => view.webContents.executeJavaScript(`typeof play==='function'&&play(${JSON.stringify(String(itemId))})`, true).catch(() => {});
  const current = view.webContents.getURL();
  if (current.includes(SITE.lumoPath.split('#')[0])) trigger(); else { await view.webContents.loadURL(`${JELLYFIN}${SITE.lumoPath}`); trigger(); }
  return true;
}
function closeService(serviceId, options = {}) { const view = views.get(serviceId); if (!view) return; mainWindow.contentView.removeChildView(view); view.webContents.close(); views.delete(serviceId); viewLastUsed.delete(serviceId); if (activeId === serviceId) showHome(); log(`closed ${serviceId}${options.reason ? ` (${options.reason})` : ''}`); if (!options.silent) emitState(); }
function sendToast(text) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toast', text); }
function keyboardBounds() { const { width, height } = mainWindow.getContentBounds(); const keyboardHeight = Math.min(330, Math.max(250, Math.round(height * .3))); return { x: 0, y: height - keyboardHeight, width, height: keyboardHeight }; }
function positionKeyboard() { if (keyboardShown && keyboardView) keyboardView.setBounds(keyboardBounds()); }
function showKeyboard(target) { if (!keyboardView || !target || target.isDestroyed()) return; clearTimeout(keyboardHideTimer); keyboardTarget = target; keyboardShown = true; keyboardView.setBounds(keyboardBounds()); try { mainWindow.contentView.removeChildView(keyboardView); mainWindow.contentView.addChildView(keyboardView); } catch {} keyboardView.webContents.send('keyboard:visible', true); }
function hideKeyboard() { clearTimeout(keyboardHideTimer); keyboardShown = false; keyboardTarget = null; if (keyboardView) { keyboardView.webContents.send('keyboard:visible', false); keyboardView.setBounds({ x: 0, y: 0, width: 0, height: 0 }); } }
function hideKeyboardSoon(target) { clearTimeout(keyboardHideTimer); keyboardHideTimer = setTimeout(() => { if (!target || keyboardTarget === target) hideKeyboard(); }, 240); }
function createKeyboard() { keyboardView = new WebContentsView({ webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } }); keyboardView.setBackgroundColor('#00000000'); mainWindow.contentView.addChildView(keyboardView); keyboardView.setBounds({ x: 0, y: 0, width: 0, height: 0 }); keyboardView.webContents.loadFile(path.join(APP_DIR, 'keyboard.html')); }
function createLoadingView() { loadingView = new WebContentsView({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } }); loadingView.setBackgroundColor('#070910'); mainWindow.contentView.addChildView(loadingView); loadingView.setBounds({ x: 0, y: 0, width: 0, height: 0 }); loadingView.webContents.loadFile(path.join(APP_DIR, 'loading.html')).catch(error => log(`loading screen failure ${error.message}`)); }
function raiseNav() { if (!navWindow || navWindow.isDestroyed() || artMode) return; navWindow.setAlwaysOnTop(true, 'screen-saver', 1); navWindow.show(); }
function positionNav() { if (!navWindow || navWindow.isDestroyed()) return; if (artMode) return navWindow.hide(); const bounds = screen.getPrimaryDisplay().bounds; navWindow.setBounds({ x: bounds.x, y: bounds.y, width: navShown ? 76 : 20, height: bounds.height }); if (!navWindow.isVisible()) navWindow.show(); }
function setNavVisible(visible) { if (!navWindow || navWindow.isDestroyed() || navWindow.webContents.isDestroyed()) return; navWindow.webContents.send('nav:visible', visible); }
function showNav() { if (artMode) return; clearTimeout(navTimer); clearTimeout(navInputTimer); if (navShown) return; navShown = true; positionNav(); setNavVisible(true); }
function hideNavSoon() { clearTimeout(navTimer); navTimer = setTimeout(() => { navShown = false; setNavVisible(false); clearTimeout(navInputTimer); navInputTimer = setTimeout(() => { if (!navShown) positionNav(); }, 220); }, 800); }
async function weather() { const cache = path.join(DATA_DIR, 'weather.json'); try { const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(SITE.weatherLatitude)}&longitude=${encodeURIComponent(SITE.weatherLongitude)}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(SITE.timezone)}`); if (!response.ok) throw new Error('HTTP'); const data = await response.json(); const result = { temperature: Math.round(data.current.temperature_2m), code: data.current.weather_code, min: Math.round(data.daily.temperature_2m_min[0]), max: Math.round(data.daily.temperature_2m_max[0]), offline: false }; fs.writeFileSync(cache, JSON.stringify(result)); return result; } catch { try { return { ...JSON.parse(fs.readFileSync(cache, 'utf8')), offline: true }; } catch { return { unavailable: true, offline: true }; } } }
async function networkStatus() {
  const lan = Object.values(os.networkInterfaces()).flat().some(address => address && !address.internal && address.family === 'IPv4');
  try {
    const response = await fetch('https://connectivitycheck.gstatic.com/generate_204', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    return { online: response.status === 204 || response.ok, lan };
  } catch { return { online: false, lan }; }
}
function exec(args) { return new Promise(resolve => execFile(args[0], args.slice(1), { timeout: 3000, maxBuffer: 4 * 1024 * 1024 }, (_err, stdout) => resolve(String(stdout || '').trim()))); }
function execChecked(args) { return new Promise((resolve, reject) => execFile(args[0], args.slice(1), { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve(String(stdout || '').trim()))); }
async function audioState() {
  try {
    const [raw, defaultSink] = await Promise.all([execChecked(['pactl', '--format=json', 'list', 'sinks']), execChecked(['pactl', 'get-default-sink'])]);
    const sinks = JSON.parse(raw).map(sink => { const channel = Object.values(sink.volume || {})[0] || {}; return { id: sink.name, name: sink.description || sink.properties?.['node.nick'] || sink.name, detail: sink.properties?.['device.form_factor'] === 'headset' || sink.name.startsWith('bluez_') ? 'Bluetooth' : sink.properties?.['device.form_factor'] === 'internal' ? 'Intégrée' : '', volume: Math.max(0, Math.min(100, parseInt(channel.value_percent, 10) || 0)), muted: !!sink.mute, active: sink.name === defaultSink.trim() }; });
    const active = sinks.find(sink => sink.active) || sinks[0] || null;
    return { sinks, activeId: active?.id || '', volume: active?.volume || 0, muted: active?.muted || false };
  } catch (error) { log(`audio state unavailable: ${error.message}`); return { sinks: [], activeId: '', volume: 0, unavailable: true }; }
}
async function setAudioOutput(id) { const current = await audioState(); if (!current.sinks.some(sink => sink.id === id)) throw new Error('Sortie audio indisponible'); await execChecked(['pactl', 'set-default-sink', id]); const inputs = (await exec(['pactl', 'list', 'short', 'sink-inputs'])).split(/\r?\n/).map(line => line.split(/\s+/)[0]).filter(Boolean); await Promise.all(inputs.map(input => execChecked(['pactl', 'move-sink-input', input, id]).catch(() => ''))); return audioState(); }
async function setSystemVolume(value) { const volume = Math.max(0, Math.min(100, Math.round(Number(value) || 0))); await execChecked(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', `${volume}%`]); if (volume > 0) await execChecked(['pactl', 'set-sink-mute', '@DEFAULT_SINK@', '0']); return audioState(); }
async function changeSystemVolume(delta) { const current = await audioState(); return setSystemVolume(current.volume + Math.max(-20, Math.min(20, Number(delta) || 0))); }
async function stats() { const temp = await exec(['cat', '/sys/class/thermal/thermal_zone0/temp']); const disk = await exec(['df', '-h', '/']); const match = disk.match(/\S+\s+\S+\s+\S+\s+(\S+)\s+(\S+)%/); return { hostname: os.hostname(), uptime: Math.floor(os.uptime()), cpu: os.cpus()[0]?.model || 'Raspberry Pi', ram: { used: os.totalmem() - os.freemem(), total: os.totalmem() }, temperature: Number(temp) ? Number(temp) / 1000 : null, disk: match ? { free: match[1], used: match[2] } : null, residentApps: views.size, residentLimit: config.maxResidentApps, electron: process.versions.electron, node: process.versions.node }; }
async function fetchIcon(target) { if (!validUrl(target)) throw new Error('URL non autorisée'); const u = new URL(target); const id = crypto.randomUUID(); const fallback = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`; try { const html = await (await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(6000) })).text(); const candidates = [...html.matchAll(/<link[^>]+(?:rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'])[^>]*href=["']([^"']+)["']/gi)].map(x => x[1]); const source = candidates[0] ? new URL(candidates[0], u.href).href : fallback; const iconUrl = validUrl(source) ? source : fallback; const response = await fetch(iconUrl, { signal: AbortSignal.timeout(6000) }); if (!response.ok) throw new Error('icône'); const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 1024 * 1024) throw new Error('icône trop lourde'); const mime = response.headers.get('content-type') || ''; const ext = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'ico'; const filename = `${id}.${ext}`; fs.writeFileSync(path.join(ICON_DIR, filename), bytes); return `file://${path.join(ICON_DIR, filename)}`; } catch { return null; } }

function handleLayerNavCommand(command) {
  if (!command || typeof command !== 'object') return;
  if (command.action === 'home') return showHome();
  if (command.action === 'settings') { showHome(); mainWindow.webContents.send('navigate', 'settings'); return; }
  if (command.action === 'moonlight') { if (!nativeProcess) launchNativeMoonlight(); return; }
  if (command.action === 'moonlight-game' && typeof command.name === 'string' && command.name.length <= 200) {
    if (!nativeProcess) launchNativeMoonlight(command.name).catch(error => log(`moonlight game launch failure ${error.message}`));
    return;
  }
  if (command.action === 'keyboard') { if (nativeProcess) setSystemKeyboard(!systemKeyboardVisible).catch(() => {}); return; }
  if (command.action === 'volume' && Number.isFinite(Number(command.delta))) {
    changeSystemVolume(Number(command.delta)).then(result => { systemVolume = result.volume; writeLayerNavState(); }).catch(error => log(`volume change failure ${error.message}`));
    return;
  }
  if (command.action === 'launch' && typeof command.id === 'string' && allApps().some(app => app.id === command.id)) launch(command.id);
}
function spawnLayerNav() {
  if (quitting || layerNavProcess) return;
  layerNavProcess = spawn('/usr/bin/python3', [path.join(APP_DIR, 'layer-nav.py'), NAV_SOCKET, NAV_STATE_FILE], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
  layerNavProcess.stderr.on('data', data => log(`layer nav: ${String(data).trim()}`));
  layerNavProcess.once('error', error => log(`layer nav launch failure ${error.message}`));
  layerNavProcess.once('exit', () => { layerNavProcess = null; if (!quitting) setTimeout(spawnLayerNav, 1500); });
}
function startLayerNav() {
  try { fs.unlinkSync(NAV_SOCKET); } catch {}
  navControlServer = net.createServer(socket => { let raw = ''; socket.on('data', chunk => { if (raw.length < 4096) raw += chunk; }); socket.on('end', () => { try { handleLayerNavCommand(JSON.parse(raw)); } catch {} }); });
  navControlServer.on('error', error => log(`layer nav socket failure ${error.message}`));
  navControlServer.listen(NAV_SOCKET, () => { try { fs.chmodSync(NAV_SOCKET, 0o600); } catch {} spawnLayerNav(); });
  writeLayerNavState();
}

app.whenReady().then(() => { config = loadConfig(); jellyfinVault = loadJellyfinVault(); createWindow(); audioState().then(result => { if (!result.unavailable) { systemVolume = result.volume; writeLayerNavState(); } }).catch(() => {}); globalShortcut.register('Control+Alt+H', showHome); globalShortcut.register('Control+Alt+Shift+Q', () => app.quit()); app.on('activate', () => mainWindow.show()); });
process.on('SIGUSR2', () => { if (layerNavProcess && !layerNavProcess.killed) layerNavProcess.kill('SIGUSR1'); });
function createWindow() {
  splashWindow = new BrowserWindow({ fullscreen: true, frame: false, alwaysOnTop: true, backgroundColor: '#03050b', autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const splashStartedAt = Date.now();
  splashWindow.loadFile(path.join(APP_DIR, 'splash.html'));
  mainWindow = new BrowserWindow({ show: false, fullscreen: true, kiosk: true, frame: false, autoHideMenuBar: true, backgroundColor: '#03050b', paintWhenInitiallyHidden: true, webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
  const reveal = () => { if (!mainWindow || mainWindow.isDestroyed()) return; const remaining = 2000 - (Date.now() - splashStartedAt); if (remaining > 0) { setTimeout(reveal, remaining); return; } mainWindow.show(); mainWindow.focus(); if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy(); splashWindow = null; };
  const revealFallback = setTimeout(reveal, 6000);
  mainWindow.once('ready-to-show', () => setTimeout(reveal, 280));
  mainWindow.once('closed', () => clearTimeout(revealFallback));
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders({ urls: [`${JELLYFIN}/Items/*/Images/*`] }, (details, callback) => { if (jellyfinAuthHeader) details.requestHeaders.Authorization = jellyfinAuthHeader; callback({ requestHeaders: details.requestHeaders }); });
  mainWindow.loadFile('index.html');
  mainWindow.on('resize', () => { positionNav(); positionKeyboard(); if (activeId && views.get(activeId)) views.get(activeId).setBounds(viewBounds()); if (loadingView?.getBounds().width) loadingView.setBounds(viewBounds()); });
  mainWindow.webContents.on('before-input-event', (event, input) => { if (input.key === 'Home') { event.preventDefault(); showHome(); } if (input.key === 'Escape' && activeId) { event.preventDefault(); showHome(); } });
  createKeyboard(); createLoadingView(); startLayerNav();
}
app.on('window-all-closed', () => app.quit()); app.on('will-quit', () => { quitting = true; globalShortcut.unregisterAll(); stopNativeMoonlight(); for (const serviceSession of configuredSessions) { try { serviceSession.flushStorageData(); } catch {} } if (layerNavProcess && !layerNavProcess.killed) layerNavProcess.kill('SIGTERM'); navControlServer?.close(); try { fs.unlinkSync(NAV_SOCKET); } catch {} });
ipcMain.handle('state:get', event => { requireShellSender(event); return state(); });
ipcMain.handle('home:show', event => { requireShellSender(event); return showHome(); });
ipcMain.handle('app:launch', (event, id) => { requireShellSender(event); return launch(id); });
ipcMain.handle('app:close', (event, id) => { requireMainSender(event); return closeService(id); });
ipcMain.handle('weather:get', event => { requireMainSender(event); return weather(); });
ipcMain.handle('system:stats', event => { requireMainSender(event); return stats(); });
ipcMain.handle('settings:save', (event, patch) => { requireMainSender(event); if (!patch || typeof patch !== 'object') throw new Error('Réglages invalides'); config = safeConfig({ ...config, ...patch }); saveConfig(); return state(); });
ipcMain.handle('jellyfin:hero', (event, force) => { requireMainSender(event); return jellyfinHero(force === true); });
ipcMain.handle('jellyfin:play', (event, id) => { requireMainSender(event); return playJellyfin(id); });
ipcMain.handle('network:status', event => { requireMainSender(event); return networkStatus(); });
ipcMain.handle('audio:get', event => { requireShellSender(event); return audioState(); });
ipcMain.handle('audio:output', (event, id) => { requireMainSender(event); if (typeof id !== 'string' || id.length > 300) throw new Error('Sortie audio invalide'); return setAudioOutput(id); });
ipcMain.handle('audio:volume', async (event, value) => { requireShellSender(event); const result = await setSystemVolume(value); systemVolume = result.volume; writeLayerNavState(); return result; });
ipcMain.handle('audio:adjust', async (event, delta) => { requireShellSender(event); const result = await changeSystemVolume(delta); systemVolume = result.volume; writeLayerNavState(); return result; });
ipcMain.on('keyboard:focus', (event, editable) => { if (event.sender !== mainWindow?.webContents) return; editable ? showKeyboard(event.sender) : hideKeyboardSoon(event.sender); });
ipcMain.on('keyboard:key', (event, payload) => { if (event.sender !== keyboardView?.webContents) return; if (payload?.action === 'close') return hideKeyboard(); const target = keyboardTarget; if (!target || target.isDestroyed()) return hideKeyboard(); target.focus(); if (typeof payload?.text === 'string' && payload.text.length <= 4) return target.insertText(payload.text); const keyCode = { backspace: 'Backspace', enter: 'Enter', tab: 'Tab', left: 'Left', right: 'Right', up: 'Up', down: 'Down', escape: 'Escape', delete: 'Delete' }[payload?.key]; if (!keyCode) return; target.sendInputEvent({ type: 'keyDown', keyCode }); target.sendInputEvent({ type: 'keyUp', keyCode }); });
ipcMain.handle('osk:toggle', event => { if (event.sender !== moonlightOverlay?.webContents && event.sender !== navWindow?.webContents) throw new Error('Émetteur IPC non autorisé'); return setSystemKeyboard(!systemKeyboardVisible); });
ipcMain.handle('moonlight:games', event => { requireMainSender(event); return moonlightGames(); });
ipcMain.handle('moonlight:open', event => { requireShellSender(event); return launchNativeMoonlight(); });
ipcMain.handle('moonlight:play', (event, name) => { requireMainSender(event); if (typeof name !== 'string' || name.length > 200) throw new Error('Jeu Moonlight invalide'); return launchNativeMoonlight(name); });
ipcMain.on('nav:hover', (event, inside) => { if (event.sender === navWindow?.webContents) inside ? showNav() : hideNavSoon(); });
ipcMain.handle('shortcut:add', async (event, raw) => { requireMainSender(event); const item = { id: `custom-${crypto.randomUUID()}`, name: String(raw?.name || '').trim(), url: String(raw?.url || '').trim(), icon: validIcon(raw?.icon) ? raw.icon : null, color: '#4f8cff', description: 'Raccourci personnalisé' }; if (!validShortcut(item)) throw new Error('Nom ou URL invalide'); if (!item.icon) item.icon = await fetchIcon(item.url); config.shortcuts.push(item); config.appOrder.push(item.id); saveConfig(); return item; });
ipcMain.handle('shortcut:update', (event, raw) => { requireMainSender(event); const index = config.shortcuts.findIndex(x => x.id === raw?.id); if (index < 0) throw new Error('Raccourci introuvable'); const next = { ...config.shortcuts[index], name: String(raw.name || '').trim(), url: String(raw.url || '').trim(), icon: validIcon(raw.icon) ? raw.icon : config.shortcuts[index].icon }; if (!validShortcut(next)) throw new Error('Nom ou URL invalide'); config.shortcuts[index] = next; saveConfig(); return next; });
ipcMain.handle('shortcut:remove', (event, id) => { requireMainSender(event); const index = config.shortcuts.findIndex(item => item.id === id); if (index < 0) throw new Error('Seules les applications personnalisées peuvent être supprimées'); closeService(id); config.shortcuts.splice(index, 1); config.appOrder = config.appOrder.filter(x => x !== id); config.recent = config.recent.filter(x => x !== id); saveConfig(); return true; });
ipcMain.handle('icon:fetch', (event, url) => { requireMainSender(event); return fetchIcon(url); });
ipcMain.handle('system:action', async (event, action) => { requireMainSender(event); if (!['reboot', 'poweroff'].includes(action)) throw new Error('Action invalide'); try { await execChecked(['sudo', '-n', 'systemctl', action]); } catch (error) { log(`system action ${action} failure ${error.message}`); throw new Error(/password|mot de passe|not allowed|sudoers/i.test(error.message) ? 'Droits administrateur requis : configure sudo pour cette action.' : 'Action système impossible.'); } return true; });
ipcMain.on('art:mode', (event, enabled) => { if (event.sender !== mainWindow.webContents) return; artMode = !!enabled; clearTimeout(navTimer); clearTimeout(navInputTimer); navShown = false; setNavVisible(false); positionNav(); emitState(); });
