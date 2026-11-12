const { app, BrowserWindow, WebContentsView, ipcMain, globalShortcut, session, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { parseCookiesTxt, toElectronCookie } = require('./cookie-import');

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
// Adresses du réseau et position météo : hors du dépôt, dans ~/.config/raspy-tv/site.json (modèle : site.example.json).
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const SITE_DEFAULTS = { jellyfinUrl: 'http://jellyfin.local:8096', moonlightHost: '', dashboardUrl: '', immichUrl: '', weatherLatitude: 48.8566, weatherLongitude: 2.3522, weatherLabel: '', timezone: 'Europe/Paris' };
function loadSite() { try { return { ...SITE_DEFAULTS, ...JSON.parse(fs.readFileSync(SITE_FILE, 'utf8')) }; } catch { return { ...SITE_DEFAULTS }; } }
const SITE = loadSite();
const JELLYFIN = new URL(SITE.jellyfinUrl).origin;
// Noms sous lesquels le même serveur Jellyfin peut répondre (adresse locale, nom Tailscale…).
const JELLYFIN_HOSTS = new Set([new URL(SITE.jellyfinUrl).hostname, ...(Array.isArray(SITE.jellyfinExtraHosts) ? SITE.jellyfinExtraHosts : [])].map(host => String(host).toLowerCase()));
const MOONLIGHT_HOST = SITE.moonlightHost;
const DEFAULT_APPS = [
  { id: 'jellyfin', name: 'Jellyfin', url: `${JELLYFIN}/web/#/home`, icon: 'assets/icons/jellyfin.svg', color: '#a855f7', description: 'Ta médiathèque', media: true },
  // NouTube : YouTube et YouTube Music sans publicité. Une seule session Google pour les deux,
  // et la musique continue pendant qu'on navigue ailleurs dans RaspyTV.
  { id: 'youtube', name: 'NouTube', url: 'https://www.youtube.com/', icon: 'assets/icons/noutube.png', color: '#ff244a', description: 'YouTube sans publicité', partition: 'youtube', noutube: true, media: true },
  { id: 'youtube-music', name: 'NouTube Music', url: 'https://music.youtube.com/', icon: 'assets/icons/noutube.png', color: '#ff2d55', description: 'YouTube Music sans publicité', partition: 'youtube', noutube: true, background: true, media: true },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv/', icon: 'assets/icons/twitch.svg', color: '#a970ff', description: 'Live et gaming', media: true },
  { id: 'homelab', name: 'Dashboard', url: SITE.dashboardUrl, icon: 'assets/icons/dashy.png', color: '#00e5d0', description: 'Dashboard du lab' },
  { id: 'immich', name: 'Immich', url: SITE.immichUrl, icon: 'assets/icons/immich.png', color: '#fa2921', description: 'Photos et vidéos', media: true }
].filter(app => app.url);
const NOUTUBE_SETTINGS = { blockAds: true, hideShorts: true, sponsorBlock: true };
// Le navigateur intégré s'annonce comme un Chrome ordinaire : Google refuse la connexion
// aux navigateurs qu'il identifie comme « intégrés », dont ceux qui se déclarent Electron.
const CHROME_USER_AGENT = `Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;
const DEFAULTS = { theme: 'dark', background: 'color:#000000', clock24: true, sounds: true, soundVolume: 45, reducedMotion: false, showWeather: true, showClock: true, showRecent: true, maxRecent: 4, maxResidentApps: 4, navDelay: 850, appOrder: DEFAULT_APPS.map(a => a.id), shortcuts: [], recent: [], restoreApps: false };
let artMode = false;
let mainWindow, splashWindow, navWindow, keyboardView, keyboardTarget, loadingView, moonlightOverlay, squeekboardProcess, layerNavProcess, navControlServer, quitting = false, activeId = null, config, views = new Map(), navShown = false, navTimer, navInputTimer, keyboardShown = false, keyboardHideTimer, systemKeyboardVisible = false, heroCache = null, heroCacheAt = 0, heroCacheDay = '', jellyfinAuthHeader = '', jellyfinVault = null, nativeProcess = null, moonlightCache = null, moonlightCacheAt = 0, moonlightRequest = null, systemVolume = null, loadingTimer = null, loadingShownAt = 0;
const viewLastUsed = new Map();
const adapterCssKeys = new WeakMap();
const viewLoads = new WeakMap();
const configuredSessions = new Set();
// Commandes de la manette : d'où l'on vient, pour revenir au second appui sur PS ou Options.
let shellPage = 'home', tvReturnHome = null, tvReturnSettings = null, navPeekOpen = false, tvAdapterSource = null, noutubeSource = null;
const historyBaseIndex = new WeakMap();
const noutubeContents = new WeakSet();
const PANEL_STATE_FILE = path.join(DATA_DIR, 'panel-state.json');
const LAYER_SOCKET = path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() || 1000}`, 'raspytv-layer.sock');
let systemMuted = false, audioWatcher = null, audioWatchTimer = null, lastAudioKey = '', panelOpen = false, panelTimer = null, panelSource = null, panelArt = { url: '', file: '' }, bluetoothCache = { at: 0, list: [] };
// Vues dont le vrai contenu a fini de charger (et pas seulement une page technique intermédiaire).
const contentReady = new WeakSet();

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
function safeConfig(raw) { const source = raw && typeof raw === 'object' ? raw : {}; const residentLimit = Number(source.maxResidentApps); return { ...DEFAULTS, ...source, maxResidentApps: Number.isInteger(residentLimit) ? Math.min(6, Math.max(2, residentLimit)) : DEFAULTS.maxResidentApps, shortcuts: Array.isArray(source.shortcuts) ? source.shortcuts.filter(validShortcut) : [], recent: Array.isArray(source.recent) ? source.recent.filter(x => typeof x === 'string').slice(0, 12) : [], appOrder: withNewDefaultApps(Array.isArray(source.appOrder) ? source.appOrder.filter(x => typeof x === 'string') : DEFAULTS.appOrder) }; }
// Une app native ajoutée par une mise à jour se range juste après sa voisine d'origine, pas en fin de liste.
function withNewDefaultApps(order) { const result = [...order]; DEFAULT_APPS.forEach((app, index) => { if (result.includes(app.id)) return; const previous = DEFAULT_APPS.slice(0, index).reverse().find(item => result.includes(item.id)); result.splice(previous ? result.indexOf(previous.id) + 1 : 0, 0, app.id); }); return result; }
function atomicWrite(file, data, mode = 0o600) { const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, data, { mode }); fs.renameSync(temporary, file); try { fs.chmodSync(file, mode); } catch {} }
function loadConfig() { ensureDirs(); try { const loaded = safeConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))); try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {} return loaded; } catch (error) { log(`config recovery ${error.message}`); const defaults = { ...DEFAULTS }; atomicWrite(CONFIG_FILE, JSON.stringify(defaults, null, 2)); return defaults; } }
function saveConfig() { try { atomicWrite(CONFIG_FILE, JSON.stringify(config, null, 2)); emitState(); } catch (error) { log(`config save failure ${error.message}`); sendToast('Impossible d’enregistrer les paramètres.'); } }
function validUrl(value) { try { const u = new URL(value); return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && !u.username && !u.password; } catch { return false; } }
function validShortcut(item) { return item && typeof item.id === 'string' && typeof item.name === 'string' && item.name.length > 0 && item.name.length < 61 && validUrl(item.url); }
function validIcon(value) { if (typeof value !== 'string' || value.length > 2048) return false; if (value.startsWith('file://')) { const file = path.resolve(value.slice(7)); return file.startsWith(ICON_DIR + path.sep); } return /^assets\/icons\/[\w.-]+$/.test(value) || validUrl(value); }
// Un raccourci ne reçoit que ses champs : il ne peut pas se donner les droits d'une app native (NouTube, arrière-plan).
function allApps() { return [...DEFAULT_APPS.map(app => ({ ...app, native: true })), ...config.shortcuts.map(({ id, name, url, icon, color, description }) => ({ id, name, url, icon, color, description, native: false }))]; }
function appById(id) { return allApps().find(app => app.id === id) || null; }
// Session YouTube exportée d'un navigateur : déposée ici, importée puis effacée (elle donne accès au compte).
const YOUTUBE_SESSION_IMPORT = path.join(DATA_DIR, 'import', 'youtube-cookies.txt');
async function importYouTubeSession() {
  let text;
  try { text = fs.readFileSync(YOUTUBE_SESSION_IMPORT, 'utf8'); } catch { return null; }
  const forget = () => { try { fs.writeFileSync(YOUTUBE_SESSION_IMPORT, ''); fs.rmSync(YOUTUBE_SESSION_IMPORT, { force: true }); } catch (error) { log(`youtube session file cleanup failure ${error.message}`); } };
  try {
    const cookies = parseCookiesTxt(text);
    const target = session.fromPartition('persist:raspy-tv-youtube');
    let imported = 0;
    for (const cookie of cookies) {
      try { await target.cookies.set(toElectronCookie(cookie)); imported++; }
      catch (error) { log(`youtube cookie refused ${cookie.domain} ${cookie.name}: ${error.message}`); }
    }
    await target.cookies.flushStore();
    log(`youtube session imported: ${imported}/${cookies.length} cookies`);
    for (const [id, view] of views) if (appById(id)?.noutube && !view.webContents.isDestroyed()) view.webContents.reloadIgnoringCache();
    sendToast(imported ? 'Session YouTube importée : NouTube est connecté.' : 'Aucun cookie YouTube valable dans le fichier importé.');
    return { imported, total: cookies.length };
  } finally { forget(); }
}
function loadNoutubeSource() {
  if (noutubeSource === null) {
    try { noutubeSource = fs.readFileSync(path.join(APP_DIR, 'noutube', 'noutube-content.js'), 'utf8'); }
    catch (error) { noutubeSource = ''; log(`noutube script unavailable ${error.message}`); }
  }
  return noutubeSource;
}
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
  // Caches régénérables seulement : cookies, sessions et préférences des sites sont conservés.
  Promise.all([serviceSession.clearCache(), serviceSession.clearStorageData({ storages: ['cachestorage', 'shadercache'] })]).then(() => { stamps[id] = Date.now(); atomicWrite(CACHE_STAMP_FILE, JSON.stringify(stamps)); log(`cache cleared ${id}`); }).catch(error => log(`cache cleanup failure ${id} ${error.message}`));
}
function state() { return { config, apps: allApps().map(a => ({ ...a, open: views.has(a.id) })), activeId, nativeMode: !!nativeProcess, artMode, site: { weatherLabel: SITE.weatherLabel } }; }
function layerNavState() { return { activeId, nativeMode: !!nativeProcess, artMode, systemVolume, systemMuted, apps: allApps().map(app => ({ id: app.id, name: app.name, native: app.native, icon: app.icon?.startsWith('assets/') ? path.join(APP_DIR, app.icon) : app.icon?.startsWith('file://') ? app.icon.slice(7) : '', color: app.color || '#4f8cff' })) }; }
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
// Une app d'arrière-plan (NouTube Music) continue de jouer quand on la quitte.
function pauseActiveMedia() { if (activeId && !appById(activeId)?.background) pauseViewMedia(views.get(activeId)); }
// ... mais se tait dès qu'une autre source de son prend la main (vidéo, jeu).
function pauseBackgroundMedia(exceptId = null) { for (const [id, view] of views) if (id !== exceptId && appById(id)?.background) pauseViewMedia(view); }
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
  // tracked launcher and prevents its audio continuing behind Jellyfin/home.
  execFile('/usr/bin/pkill', ['-TERM', '-x', 'moonlight-qt'], error => {
    if (error && error.code !== 1) log(`moonlight cleanup failure ${error.message}`);
  });
  hideMoonlightOverlay();
}
function showHome() { if (!mainWindow || mainWindow.isDestroyed()) return; const refreshJellyfin = activeId === 'jellyfin'; showLoading('Accueil RaspyTV'); stopNativeMoonlight(); hideKeyboard(); pauseActiveMedia(); activeId = null; if (refreshJellyfin) { heroCache = null; heroCacheAt = 0; } hideAllViews(); restoreShellFullscreen(); mainWindow.webContents.focus(); emitState(); hideLoadingSoon(120); }
function leaveNativeForApp() { stopNativeMoonlight(); restoreShellFullscreen(); }

function parseCsvLine(line) {
  const values = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; } else value += char; }
  values.push(value.trim()); return values;
}
function moonlightGames() {
  if (moonlightCache && Date.now() - moonlightCacheAt < 600_000) return Promise.resolve(moonlightCache);
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
function positionMoonlightOverlay() { if (!moonlightOverlay || moonlightOverlay.isDestroyed()) return; const display = screen.getPrimaryDisplay().bounds; moonlightOverlay.setBounds({ x: display.x, y: display.y + Math.round((display.height - 104) / 2), width: 48, height: 104 }); }
function showMoonlightOverlay() { raiseNav(); positionNav(); emitState(); }
function hideMoonlightOverlay() { setSystemKeyboard(false).catch(() => {}); if (moonlightOverlay && !moonlightOverlay.isDestroyed()) moonlightOverlay.hide(); }
function createMoonlightOverlay() { moonlightOverlay = new BrowserWindow({ show: false, width: 48, height: 104, frame: false, transparent: true, resizable: false, movable: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, autoHideMenuBar: true, webPreferences: { preload: path.join(APP_DIR, 'overlay-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } }); moonlightOverlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); moonlightOverlay.loadFile(path.join(APP_DIR, 'moonlight-overlay.html')); positionMoonlightOverlay(); }
function launchNativeMoonlight(gameName = '') {
  tvReturnHome = tvReturnSettings = null;
  pauseBackgroundMedia();
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
    // La musique d'arrière-plan n'est jamais fermée pour faire de la place.
    const candidate = [...views.keys()].filter(id => id !== keepId && id !== activeId && !appById(id)?.background).sort((a, b) => (viewLastUsed.get(a) || 0) - (viewLastUsed.get(b) || 0))[0];
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
  await view.webContents.executeJavaScript(`(()=>{if(window.__raspyTvInputAdapter)return true;window.__raspyTvInputAdapter=true;const noHoverFocus=event=>{if(window.ApiClient||document.querySelector('.skinHeader'))event.stopImmediatePropagation()};addEventListener('pointerenter',noHoverFocus,true);addEventListener('mouseenter',noHoverFocus,true);let timer,focusTimer;const root=document.documentElement,hide=()=>root.classList.add('raspy-cursor-hidden'),show=()=>{root.classList.remove('raspy-cursor-hidden');clearTimeout(timer);timer=setTimeout(hide,8000)},editable=el=>!!el?.closest?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable=true],[role=textbox]');addEventListener('pointermove',show,{passive:true});addEventListener('pointerdown',show,{passive:true});addEventListener('wheel',show,{passive:true});addEventListener('keydown',hide,{passive:true});addEventListener('touchstart',hide,{passive:true});addEventListener('focusin',event=>{clearTimeout(focusTimer);if(editable(event.target)&&!window.__raspyNavFocusing)console.info('__RASPY_OSK_OPEN__')},true);addEventListener('focusout',()=>{clearTimeout(focusTimer);focusTimer=setTimeout(()=>{if(!editable(document.activeElement))console.info('__RASPY_OSK_CLOSE__')},180)},true);hide();return true})()`, true).catch(() => {});
  const tvAdapter = loadTvAdapter();
  if (tvAdapter && !view.webContents.isDestroyed()) await view.webContents.executeJavaScript(tvAdapter, true).catch(error => log(`tv adapter failure ${service?.id} ${error.message}`));
}
function loadTvAdapter() {
  if (tvAdapterSource === null) {
    try { tvAdapterSource = fs.readFileSync(path.join(APP_DIR, 'tv-input-adapter.js'), 'utf8'); }
    catch (error) { tvAdapterSource = ''; log(`tv adapter unavailable ${error.message}`); }
  }
  return tvAdapterSource;
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
  const jellyfin = service.id === 'jellyfin';
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
  } finally {
    // Tout ce qui précède cette entrée est interne (page de restauration de session, par exemple) :
    // le bouton Retour ne doit jamais y ramener.
    if (!view.webContents.isDestroyed()) historyBaseIndex.set(view.webContents, view.webContents.navigationHistory.getActiveIndex());
    contentReady.add(view);
    if (activeId === service.id) hideLoadingSoon(100);
  }
}
function createServiceView(service) {
  const partition = `persist:raspy-tv-${service.partition || service.id}`;
  const serviceSession = session.fromPartition(partition);
  const jellyfin = service.id === 'jellyfin';
  if (jellyfin) keepJellyfinSession(serviceSession);
  if (service.noutube) serviceSession.setUserAgent(CHROME_USER_AGENT);
  maintainSessionCache(serviceSession, service.partition || service.id);
  serviceSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'fullscreen'));
  serviceSession.setPermissionCheckHandler((_webContents, permission) => permission === 'fullscreen');
  const view = new WebContentsView({ webPreferences: { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: !service.background, ...(service.noutube ? { preload: path.join(APP_DIR, 'noutube-preload.js') } : {}) } });
  if (service.noutube) noutubeContents.add(view.webContents);
  view.setBackgroundColor('#070910');
  mainWindow.contentView.addChildView(view);
  raiseNav();
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || (input.key !== 'Escape' && input.key !== 'Home')) return;
    event.preventDefault();
    if (service.id === 'jellyfin' && input.key === 'Escape') {
      view.webContents.executeJavaScript(`(()=>{if(!location.hash.startsWith('#/video')&&!document.querySelector('video.htmlvideoplayer'))return false;history.back();return true})()`, true)
        .then(closed => { if (!closed) showHome(); })
        .catch(showHome);
      return;
    }
    showHome();
  });
  view.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => { if (!isMainFrame || code === -3) return; hideLoadingSoon(); sendToast(`${service.name} : chargement impossible (${description}).`); log(`load failure ${service.id} ${code} ${url}`); setTimeout(() => { if (activeId === service.id) showHome(); }, 900); });
  view.webContents.on('render-process-gone', (_event, details) => { if (quitting || details.reason === 'clean-exit') return; log(`renderer gone ${service.id} ${details.reason}`); sendToast(`${service.name} a été relancée après une erreur.`); if (activeId === service.id) showHome(); closeService(service.id, { silent: true, reason: details.reason }); });
  view.webContents.on('unresponsive', () => { log(`renderer unresponsive ${service.id}`); sendToast(`${service.name} ne répond plus. Retour à l’accueil.`); if (activeId === service.id) showHome(); });
  view.webContents.on('dom-ready', () => { applyWebAppAdapter(view, service); if (jellyfin) setTimeout(() => captureJellyfinStorage(view, service), 1800); });
  view.webContents.on('did-finish-load', () => { if (contentReady.has(view)) hideLoadingSoon(); if (jellyfin) setTimeout(() => captureJellyfinStorage(view, service), 2500); });
  if (jellyfin) view.webContents.on('did-navigate-in-page', () => setTimeout(() => captureJellyfinStorage(view, service), 1200));
  view.webContents.on('console-message', (_event, level, message) => { const text = typeof level === 'object' ? level.message : message; if (text === '__RASPY_OSK_OPEN__') showKeyboard(view.webContents); else if (text === '__RASPY_OSK_CLOSE__') hideKeyboardSoon(view.webContents); });
  view.webContents.on('will-navigate', (event, url) => { if (!validUrl(url)) event.preventDefault(); });
  viewLoads.set(view, loadServiceContent(view, service));
  return view;
}
function launch(serviceId) { const service = allApps().find(a => a.id === serviceId); if (!service) throw new Error('Application inconnue'); tvReturnHome = tvReturnSettings = null; if (service.media && !service.background) pauseBackgroundMedia(service.id); showLoading(service.name); leaveNativeForApp(); hideKeyboard(); if (activeId && activeId !== serviceId) pauseActiveMedia(); let view = views.get(service.id); if (!view) { evictInactiveViews(service.id); view = createServiceView(service); views.set(service.id, view); log(`opened ${service.id}`); } hideAllViews(); view.webContents.setAudioMuted(false); view.setBounds(viewBounds()); showLoading(service.name); raiseNav(); activeId = service.id; viewLastUsed.set(service.id, Date.now()); config.recent = [service.id, ...config.recent.filter(x => x !== service.id)].slice(0, 12); saveConfig(); view.webContents.focus(); if (contentReady.has(view) && !view.webContents.isLoading()) hideLoadingSoon(100); else setTimeout(() => { if (activeId === service.id) hideLoadingSoon(); }, 15000); }
const JELLYFIN_ORIGIN = JELLYFIN;
async function jellyfinHeroDirect() {
  if (!jellyfinVault) return null;
  const valid = await validateJellyfinCandidate(jellyfinVault, JELLYFIN_ORIGIN);
  if (!valid) return null;  // Jeton refusé : la voie par la page Jellyfin prend le relais.
  const authorization = `MediaBrowser Client="RaspyTV", Device="Raspberry Pi", DeviceId="raspytv-home", Version="2.3.0", Token="${valid.token}"`;
  const headers = { Authorization: authorization, 'X-Emby-Token': valid.token };
  const get = async (...paths) => {
    for (const route of paths) {
      const response = await fetch(JELLYFIN_ORIGIN + route, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (response.ok) return response.json();
    }
    return null;
  };
  const user = encodeURIComponent(valid.userId), query = `UserId=${user}`;
  const fields = 'Overview,ProductionYear,RunTimeTicks,CommunityRating,UserData,ParentIndexNumber,IndexNumber,SeriesName';
  const images = '&ImageTypeLimit=1&EnableImageTypes=Backdrop,Primary';
  const [movies, resume, added] = await Promise.all([
    get(`/Items?${query}&Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&SortOrder=Ascending&Limit=200&Fields=${fields}${images}`, `/Users/${user}/Items?Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&SortOrder=Ascending&Limit=200&Fields=${fields}${images}`),
    get(`/UserItems/Resume?${query}&MediaTypes=Video&Limit=12&Fields=${fields}${images},Thumb`, `/Users/${user}/Items/Resume?MediaTypes=Video&Limit=12&Fields=${fields}${images},Thumb`),
    get(`/Items?${query}&Recursive=true&IncludeItemTypes=Movie&SortBy=DateCreated,SortName&SortOrder=Descending&Limit=20&Fields=${fields}${images}`),
  ]);
  if (!movies) throw new Error('médiathèque inaccessible');
  const image = (item, type, width) => `${JELLYFIN_ORIGIN}/Items/${item.Id}/Images/${type}${type === 'Backdrop' ? '/0' : ''}?maxWidth=${width}&quality=76`;
  const percent = item => Math.max(0, Math.min(100, Number(item.UserData?.PlayedPercentage || 0)));
  const items = (movies.Items || []).filter(item => item.BackdropImageTags?.length).map(item => ({ id: item.Id, name: item.Name, overview: item.Overview || '', year: item.ProductionYear || '', rating: item.CommunityRating ? Number(item.CommunityRating).toFixed(1) : '', runtime: item.RunTimeTicks ? Math.round(item.RunTimeTicks / 600000000) : '', backdrop: image(item, 'Backdrop', 1400) }));
  const continueItems = (resume?.Items || []).slice(0, 8).map(item => ({ id: item.Id, name: item.Name, subtitle: item.Type === 'Episode' ? [item.SeriesName, `S${item.ParentIndexNumber || 0} E${item.IndexNumber || 0}`].filter(Boolean).join(' · ') : (item.ProductionYear || 'Film'), progress: percent(item), image: item.BackdropImageTags?.length ? image(item, 'Backdrop', 640) : item.ImageTags?.Primary ? image(item, 'Primary', 500) : '' }));
  const recentItems = (added?.Items || []).map(item => ({ id: item.Id, name: item.Name, subtitle: item.ProductionYear || 'Film', progress: percent(item), image: item.BackdropImageTags?.length ? image(item, 'Backdrop', 640) : item.ImageTags?.Primary ? image(item, 'Primary', 500) : '' }));
  return { items, continueItems, recentItems, needsLogin: false, authorization };
}
async function jellyfinHero(force = false) {
  const today = localDayKey();
  const cacheTtl = heroCache?.items?.length ? 15 * 60 * 1000 : heroCache?.needsLogin ? 10 * 60 * 1000 : 60 * 1000;
  if (!force && heroCache && heroCacheDay === today && Date.now() - heroCacheAt < cacheTtl) return heroCache;
  // Voie directe : le processus principal a déjà le jeton, inutile d'ouvrir une fenêtre cachée.
  const direct = await jellyfinHeroDirect().catch(error => { log(`jellyfin hero direct failure ${error.message}`); return null; });
  if (direct) {
    jellyfinAuthHeader = direct.authorization;
    delete direct.authorization;
    if (direct.items.length) { const daily = dailyHeroSelection(direct.items); direct.items = daily.items; heroCacheDay = daily.day; } else heroCacheDay = today;
    heroCache = direct; heroCacheAt = Date.now(); return direct;
  }
  const helper = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:raspy-tv-jellyfin', contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    maintainSessionCache(helper.webContents.session, 'jellyfin');
    // Load a tiny same-origin JSON page: localStorage stays accessible without booting the full web client.
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
      const addedResponse=await fetch('/Items?'+query+'&Recursive=true&IncludeItemTypes=Movie&SortBy=DateCreated,SortName&SortOrder=Descending&Limit=20&Fields='+fields+'&ImageTypeLimit=1&EnableImageTypes=Backdrop,Primary',{headers,cache:'no-store'}),added=addedResponse.ok?await addedResponse.json():{Items:[]};
      const recentItems=(added.Items||[]).map(x=>({id:x.Id,name:x.Name,subtitle:x.ProductionYear||'Film',progress:Math.max(0,Math.min(100,Number(x.UserData?.PlayedPercentage||0))),image:x.BackdropImageTags?.length?image(x,'Backdrop',640):x.ImageTags?.Primary?image(x,'Primary',500):''}));
      return{items,continueItems,recentItems,needsLogin:false,authorization,session:{token:selected.token,userId:selected.userId}}
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
  await viewLoads.get(view);
  if (view.webContents.isDestroyed()) return false;
  const serverId = jellyfinVault?.serverId ? `&serverId=${encodeURIComponent(jellyfinVault.serverId)}` : '';
  const route = `#/details?id=${String(itemId)}${serverId}`;
  // Jellyfin has no autoplay route: open the item page, then press its play button, which also handles resume.
  view.webContents.executeJavaScript(`(()=>{location.hash=${JSON.stringify(route)};const route=location.hash,started=Date.now();return new Promise(done=>{const attempt=()=>{if(location.hash!==route)return done(false);const button=[...document.querySelectorAll('.itemDetailPage:not(.hide) .btnPlay')].find(item=>item.offsetParent&&!item.classList.contains('hide'));if(button){button.click();return done(true)}if(Date.now()-started>15000)return done(false);setTimeout(attempt,200)};setTimeout(attempt,500)})})()`, true).catch(error => log(`jellyfin play failure ${error.message}`));
  return true;
}
function closeService(serviceId, options = {}) { const view = views.get(serviceId); if (!view) return; mainWindow.contentView.removeChildView(view); view.webContents.close(); views.delete(serviceId); viewLastUsed.delete(serviceId); if (activeId === serviceId) showHome(); log(`closed ${serviceId}${options.reason ? ` (${options.reason})` : ''}`); if (!options.silent) emitState(); }
function sendToast(text) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('toast', text); }
function createNav() {
  navWindow = new BrowserWindow({ show: false, width: 20, height: 600, frame: false, type: 'toolbar', transparent: true, resizable: false, movable: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, autoHideMenuBar: true, webPreferences: { preload: path.join(APP_DIR, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  navWindow.setAlwaysOnTop(true, 'screen-saver', 1); navWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); positionNav();
  navWindow.webContents.loadFile(path.join(APP_DIR, 'nav.html'));
  navWindow.webContents.once('did-finish-load', () => { emitState(); navWindow.show(); });
}
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
// Nature d'une sortie, d'après son bus réel : un casque USB n'est pas un casque Bluetooth.
function sinkKind(sink) {
  const props = sink.properties || {}, bus = String(props['device.bus'] || ''), name = String(sink.name || '');
  const headset = /^(headset|headphone)$/.test(String(props['device.form_factor'] || ''));
  if (bus === 'bluetooth' || name.startsWith('bluez_')) return { kind: 'bluetooth', headset: true, detail: 'Bluetooth' };
  if (bus === 'usb' || /usb/i.test(name)) return { kind: 'usb', headset, detail: 'USB' };
  if (/hdmi/i.test(name)) return { kind: 'hdmi', headset: false, detail: 'HDMI' };
  return { kind: 'internal', headset, detail: 'Intégrée' };
}
async function audioState() {
  try {
    const [raw, defaultSink] = await Promise.all([execChecked(['pactl', '--format=json', 'list', 'sinks']), execChecked(['pactl', 'get-default-sink'])]);
    const sinks = JSON.parse(raw).map(sink => { const channel = Object.values(sink.volume || {})[0] || {}; return { id: sink.name, name: sink.description || sink.properties?.['node.nick'] || sink.name, ...sinkKind(sink), volume: Math.max(0, Math.min(100, parseInt(channel.value_percent, 10) || 0)), muted: !!sink.mute, active: sink.name === defaultSink.trim() }; });
    const active = sinks.find(sink => sink.active) || sinks[0] || null;
    return { sinks, activeId: active?.id || '', volume: active?.volume || 0, muted: active?.muted || false };
  } catch (error) { log(`audio state unavailable: ${error.message}`); return { sinks: [], activeId: '', volume: 0, unavailable: true }; }
}
async function setAudioOutput(id) { if (id.startsWith('bt:')) id = await connectBluetoothAudio(id.slice(3).toUpperCase()); const current = await audioState(); if (!current.sinks.some(sink => sink.id === id)) throw new Error('Sortie audio indisponible'); await execChecked(['pactl', 'set-default-sink', id]); const inputs = (await exec(['pactl', 'list', 'short', 'sink-inputs'])).split(/\r?\n/).map(line => line.split(/\s+/)[0]).filter(Boolean); await Promise.all(inputs.map(input => execChecked(['pactl', 'move-sink-input', input, id]).catch(() => ''))); return audioState(); }
async function setSystemVolume(value) { const volume = Math.max(0, Math.min(100, Math.round(Number(value) || 0))); await execChecked(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', `${volume}%`]); if (volume > 0) await execChecked(['pactl', 'set-sink-mute', '@DEFAULT_SINK@', '0']); return audioState(); }
// --- Sorties audio : les appareils Bluetooth jumelés mais déconnectés sont proposés, pour s'y connecter.
const BLUETOOTH_ADDRESS = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/i;
function execLong(args, timeout) { return new Promise((resolve, reject) => execFile(args[0], args.slice(1), { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim())) : resolve(String(stdout || '')))); }
async function bluetoothAudioDevices() {
  if (Date.now() - bluetoothCache.at < 10_000) return bluetoothCache.list;
  const listing = await exec(['bluetoothctl', 'devices', 'Paired']);
  const devices = [...listing.matchAll(/^Device ([0-9A-F:]{17}) (.+)$/gim)].map(match => ({ mac: match[1].toUpperCase(), name: match[2].trim().slice(0, 80) })).slice(0, 12);
  const list = [];
  for (const device of devices) {
    const info = await exec(['bluetoothctl', 'info', device.mac]);
    // Casques et enceintes : icône audio, ou service « Audio Sink » (0000110b).
    if (/Icon: audio-/i.test(info) || /0000110b-/i.test(info)) list.push({ id: `bt:${device.mac}`, mac: device.mac, name: device.name, connected: /Connected: yes/i.test(info) });
  }
  bluetoothCache = { at: Date.now(), list };
  return list;
}
function sinkMatchesDevice(sink, mac) { return sink.id.toUpperCase().includes(mac.replace(/:/g, '_')); }
async function audioOutputs() {
  const state = await audioState();
  const devices = await bluetoothAudioDevices().catch(() => []);
  return { ...state, bluetooth: devices.filter(device => !state.sinks.some(sink => sinkMatchesDevice(sink, device.mac))) };
}
async function connectBluetoothAudio(mac) {
  if (!BLUETOOTH_ADDRESS.test(mac)) throw new Error('Appareil Bluetooth invalide');
  try { await execLong(['bluetoothctl', '--timeout', '15', 'connect', mac], 20_000); }
  catch { throw new Error('Connexion impossible : allume l’appareil et rapproche-le du Raspberry Pi.'); }
  bluetoothCache.at = 0;
  // La sortie audio apparaît quelques secondes après la connexion.
  for (let attempt = 0; attempt < 20; attempt++) {
    const sink = (await audioState()).sinks.find(item => sinkMatchesDevice(item, mac));
    if (sink) return sink.id;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('L’appareil est connecté mais ne propose pas de sortie audio.');
}
// pactl subscribe signale chaque changement : nouveau casque, sortie, volume, quelle qu'en soit l'origine.
function watchAudio() {
  if (quitting || audioWatcher) return;
  audioWatcher = spawn('pactl', ['subscribe'], { stdio: ['ignore', 'pipe', 'ignore'] });
  let buffer = '';
  audioWatcher.stdout.on('data', chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    if (lines.some(line => /on (sink|server|card) /.test(line))) { clearTimeout(audioWatchTimer); audioWatchTimer = setTimeout(refreshAudio, 250); }
  });
  audioWatcher.once('error', error => log(`audio watch failure ${error.message}`));
  audioWatcher.once('exit', () => { audioWatcher = null; if (!quitting) setTimeout(watchAudio, 3000); });
}
async function refreshAudio() {
  const state = await audioState();
  if (state.unavailable) return;
  const outputs = JSON.stringify(state.sinks.map(sink => [sink.id, sink.active]));
  const key = JSON.stringify([outputs, state.volume, state.muted]);
  if (key === lastAudioKey) return;
  const outputsChanged = !lastAudioKey || JSON.parse(lastAudioKey)[0] !== outputs;
  lastAudioKey = key;
  if (outputsChanged) bluetoothCache.at = 0;
  systemVolume = state.volume; systemMuted = state.muted;
  writeLayerNavState();
  if (outputsChanged && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('audio:changed');
  if (panelOpen) writePanelState().catch(() => {});
}

// --- Lecture en cours, pour le panneau de la manette. NouTube Music passe en premier s'il joue.
const MEDIA_PROBE = `(()=>{const s=navigator.mediaSession,m=s&&s.metadata,els=[...document.querySelectorAll('video,audio')].filter(e=>e.duration>0||!e.paused),el=els.find(e=>!e.paused)||els.sort((a,b)=>(b.duration||0)-(a.duration||0))[0];if(!m&&!el)return null;const art=m&&m.artwork&&m.artwork.length?[...m.artwork].sort((a,b)=>parseInt(b.sizes||'0',10)-parseInt(a.sizes||'0',10))[0].src:'';return{title:m?String(m.title||''):'',artist:m?String(m.artist||''):'',artwork:String(art||''),position:el?el.currentTime:0,duration:el&&isFinite(el.duration)?el.duration:0,playing:!!el&&!el.paused}})()`;
function probeMedia(view) {
  if (!view || view.webContents.isDestroyed()) return Promise.resolve(null);
  return Promise.race([view.webContents.executeJavaScript(MEDIA_PROBE, true).catch(() => null), new Promise(resolve => setTimeout(() => resolve(null), 1500))]);
}
async function mediaSource() {
  const order = [...views].filter(([id]) => appById(id)?.background);
  if (activeId && views.has(activeId) && !order.some(([id]) => id === activeId)) order.push([activeId, views.get(activeId)]);
  let paused = null;
  for (const [id, view] of order) {
    const info = await probeMedia(view);
    if (!info || !(info.title || info.duration)) continue;
    if (info.playing) return { id, view, info };
    paused ||= { id, view, info };
  }
  return paused;
}
async function cacheArtwork(url) {
  if (!/^https:\/\//.test(url || '')) return '';
  if (panelArt.url === url && fs.existsSync(panelArt.file)) return panelArt.file;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/')) return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) return '';
    const file = path.join(DATA_DIR, `panel-art-${crypto.createHash('sha1').update(url).digest('hex').slice(0, 12)}`);
    atomicWrite(file, bytes);
    if (panelArt.file && panelArt.file !== file) fs.rmSync(panelArt.file, { force: true });
    panelArt = { url, file };
    return file;
  } catch { return ''; }
}
async function writePanelState() {
  const [source, audio] = await Promise.all([mediaSource(), audioOutputs()]);
  panelSource = source?.id || null;
  const media = source ? { app: appById(source.id)?.name || '', title: source.info.title, artist: source.info.artist, artwork: await cacheArtwork(source.info.artwork), position: Math.max(0, Number(source.info.position) || 0), duration: Math.max(0, Number(source.info.duration) || 0), playing: !!source.info.playing } : null;
  atomicWrite(PANEL_STATE_FILE, JSON.stringify({ media, audio: { volume: audio.volume, muted: audio.muted, outputs: audio.sinks.map(({ id, name, detail, kind, headset, active }) => ({ id, name, detail, kind, headset, active })), bluetooth: audio.bluetooth.map(({ id, name }) => ({ id, name })) }, updatedAt: Date.now() }));
}
function startPanelUpdates() {
  clearInterval(panelTimer);
  let busy = false;
  const update = async () => { if (busy) return; busy = true; try { await writePanelState(); } catch (error) { log(`panel state failure ${error.message}`); } finally { busy = false; } };
  update();
  panelTimer = setInterval(update, 1000);
}
function stopPanelUpdates() { clearInterval(panelTimer); panelTimer = null; }
const MEDIA_OPS = new Set(['toggle', 'next', 'previous', 'seek']);
async function mediaCommand(op, value) {
  if (!MEDIA_OPS.has(op)) return;
  const view = (panelSource && views.get(panelSource)) || (await mediaSource())?.view;
  if (!view || view.webContents.isDestroyed()) {
    if (op !== 'seek') playerctl({ toggle: 'play-pause', next: 'next', previous: 'previous' }[op]);
    return;
  }
  if (op === 'toggle') view.webContents.setAudioMuted(false);
  const seconds = Math.max(0, Number(value) || 0);
  const outcome = await view.webContents.executeJavaScript(`(()=>{const op=${JSON.stringify(op)},value=${seconds},els=[...document.querySelectorAll('video,audio')],el=els.find(e=>!e.paused)||els.find(e=>e.duration>0),click=list=>{for(const q of list){const b=document.querySelector(q);if(b){b.click();return true}}return false};if(op==='toggle'){if(el){el.paused?el.play().catch(()=>{}):el.pause();return true}return click(['.play-pause-button','.ytp-play-button'])}if(op==='next'||op==='previous'){const name=op==='next'?'nexttrack':'previoustrack',handler=(window.__raspyMediaHandlers||{})[name];if(op==='previous'&&el&&el.currentTime>3)el.currentTime=0;if(typeof handler==='function'){try{handler({action:name});return 'handler'}catch(e){}}if(click(op==='next'?['ytmusic-player-bar .next-button','.ytp-next-button']:['ytmusic-player-bar .previous-button','.ytp-prev-button']))return 'button';if(op==='previous'&&el){el.currentTime=0;return 'restart'}return false}if(op==='seek'&&el&&isFinite(el.duration)){el.currentTime=Math.min(Math.max(0,el.duration-1),value);return true}return false})()`, true).catch(() => false);
  if (op === 'next' || op === 'previous') log(`media ${op}: ${outcome || 'introuvable'}`);
  if (panelOpen) writePanelState().catch(() => {});
}
function sendLayer(command) {
  const client = net.createConnection(LAYER_SOCKET);
  client.on('error', () => {});
  client.end(JSON.stringify(command));
}
async function changeSystemVolume(delta) { const current = await audioState(); return setSystemVolume(current.volume + Math.max(-20, Math.min(20, Number(delta) || 0))); }
async function stats() { const temp = await exec(['cat', '/sys/class/thermal/thermal_zone0/temp']); const disk = (await exec(['df', '-h', '--output=avail,pcent', '/'])).split('\n').pop() || ''; const match = disk.match(/(\S+)\s+(\d+)%/); return { hostname: os.hostname(), uptime: Math.floor(os.uptime()), cpu: os.cpus()[0]?.model || 'Raspberry Pi', ram: { used: os.totalmem() - os.freemem(), total: os.totalmem() }, temperature: Number(temp) ? Number(temp) / 1000 : null, disk: match ? { free: match[1], used: match[2] } : null, residentApps: views.size, residentLimit: config.maxResidentApps, electron: process.versions.electron, node: process.versions.node }; }
async function fetchIcon(target) { if (!validUrl(target)) throw new Error('URL non autorisée'); const u = new URL(target); const id = crypto.randomUUID(); const fallback = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`; try { const html = await (await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(6000) })).text(); const candidates = [...html.matchAll(/<link[^>]+(?:rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'])[^>]*href=["']([^"']+)["']/gi)].map(x => x[1]); const source = candidates[0] ? new URL(candidates[0], u.href).href : fallback; const iconUrl = validUrl(source) ? source : fallback; const response = await fetch(iconUrl, { signal: AbortSignal.timeout(6000) }); if (!response.ok) throw new Error('icône'); const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 1024 * 1024) throw new Error('icône trop lourde'); const mime = response.headers.get('content-type') || ''; const ext = mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'ico'; const filename = `${id}.${ext}`; fs.writeFileSync(path.join(ICON_DIR, filename), bytes); return `file://${path.join(ICON_DIR, filename)}`; } catch { return null; } }

function tvCurrentPlace() {
  if (activeId && views.has(activeId)) return { kind: 'app', id: activeId };
  return { kind: shellPage === 'settings' ? 'settings' : 'home' };
}
function tvShowShell(target) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  hideKeyboard();
  if (activeId || nativeProcess) showHome();
  shellPage = target;
  mainWindow.webContents.send('navigate', target);
  mainWindow.webContents.focus();
}
function tvRestore(place) {
  if (place?.kind === 'app' && allApps().some(item => item.id === place.id)) return launch(place.id);
  tvShowShell(place?.kind === 'settings' ? 'settings' : 'home');
}
function toggleNavPeek() {
  if (artMode || !layerNavProcess || layerNavProcess.killed) return;
  layerNavProcess.kill('SIGHUP');
}
function closeNavPeek() {
  if (!navPeekOpen) return;
  navPeekOpen = false;
  toggleNavPeek();
}
function tvHomePress() {
  closeNavPeek();
  if (activeId || shellPage === 'settings') {
    const from = tvCurrentPlace();
    tvShowShell('home');
    tvReturnHome = from;
    return;
  }
  const target = tvReturnHome;
  tvReturnHome = null;
  if (target) tvRestore(target);
}
function tvSettingsPress() {
  closeNavPeek();
  if (!activeId && shellPage === 'settings') {
    const target = tvReturnSettings;
    tvReturnSettings = null;
    return tvRestore(target || { kind: 'home' });
  }
  const from = tvCurrentPlace();
  tvShowShell('settings');
  tvReturnSettings = from;
}
async function tvBack() {
  if (navPeekOpen) return closeNavPeek();
  if (keyboardShown) {
    const target = keyboardTarget;
    hideKeyboard();
    if (target && !target.isDestroyed()) target.executeJavaScript('window.__raspyTv?.keyboardClosed?.()', true).catch(() => {});
    return;
  }
  if (nativeProcess || !mainWindow || mainWindow.isDestroyed()) return;
  const view = activeId && views.get(activeId);
  if (!view || view.webContents.isDestroyed()) { mainWindow.webContents.send('tv-back'); return; }
  const contents = view.webContents;
  const leftFullscreen = await contents.executeJavaScript(`(()=>{if(!document.fullscreenElement)return false;document.exitFullscreen().catch(()=>{});return true})()`, true).catch(() => false);
  if (leftFullscreen || contents.isDestroyed()) return;
  const history = contents.navigationHistory;
  if (history.canGoBack() && history.getActiveIndex() > (historyBaseIndex.get(contents) ?? 0)) { history.goBack(); return; }
  tvReturnHome = null;
  tvShowShell('home');
}
function playerctl(command) {
  execFile('playerctl', [command], { timeout: 3000 }, error => { if (error && error.code !== 1) log(`playerctl ${command} failure ${error.message}`); });
}
async function tvPlayPause() {
  const playPause = async view => !!view && !view.webContents.isDestroyed()
    && await view.webContents.executeJavaScript('window.__raspyTv?.playPause?.()===true', true).catch(() => false);
  if (await playPause(activeId && views.get(activeId))) return;
  // Depuis l'accueil, □ pilote la musique qui joue en arrière-plan.
  for (const [id, view] of views) {
    if (id !== activeId && appById(id)?.background && await playPause(view)) { view.webContents.setAudioMuted(false); return; }
  }
  playerctl('play-pause');
}
function tvContext() {
  const view = activeId && views.get(activeId);
  if (view && !view.webContents.isDestroyed()) view.webContents.executeJavaScript('window.__raspyTv?.context?.()', true).catch(() => {});
}
function focusCurrentPlace() {
  if (nativeProcess || !mainWindow || mainWindow.isDestroyed()) return;
  const view = activeId && views.get(activeId);
  if (view && !view.webContents.isDestroyed()) view.webContents.focus(); else mainWindow.webContents.focus();
}
function handleLayerNavCommand(command) {
  if (!command || typeof command !== 'object') return;
  // Avant l'ouverture, l'état est préparé (0,7 s au plus) : la lecture en cours s'affiche d'emblée.
  if (command.action === 'tv-state') return void writePanelState().catch(error => log(`panel state failure ${error.message}`));
  if (command.action === 'tv-panel') { if (panelOpen) return sendLayer({ op: 'panel' }); return void Promise.race([writePanelState().catch(() => {}), new Promise(resolve => setTimeout(resolve, 700))]).then(() => sendLayer({ op: 'panel' })); }
  if (command.action === 'tv-panel-state') { panelOpen = command.open === true; if (panelOpen) startPanelUpdates(); else { stopPanelUpdates(); focusCurrentPlace(); } return; }
  if (command.action === 'media' && typeof command.op === 'string') return void mediaCommand(command.op, command.value).catch(error => log(`media command failure ${error.message}`));
  if (command.action === 'volume-set' && Number.isFinite(Number(command.value))) return void setSystemVolume(command.value).then(result => { systemVolume = result.volume; systemMuted = result.muted; writeLayerNavState(); if (panelOpen) writePanelState().catch(() => {}); }).catch(error => log(`volume set failure ${error.message}`));
  if (command.action === 'audio-output' && typeof command.id === 'string' && command.id.length <= 300) return void setAudioOutput(command.id).then(() => { if (panelOpen) writePanelState().catch(() => {}); }).catch(error => { sendToast(error.message || 'Sortie audio indisponible'); log(`audio output failure ${error.message}`); });
  // Alimentation demandée depuis le panneau, après confirmation : seules ces deux commandes existent.
  if (command.action === 'system-power' && (command.op === 'reboot' || command.op === 'poweroff')) { log(`system power ${command.op} requested from panel`); return void execChecked(['sudo', '-n', 'systemctl', command.op]).catch(error => { log(`system power ${command.op} failure ${error.message}`); sendToast(/password|mot de passe|not allowed|sudoers/i.test(error.message) ? 'Droits administrateur requis pour cette action.' : 'Action système impossible.'); }); }
  if (command.action === 'nav-peek') { navPeekOpen = command.open === true; if (!navPeekOpen) focusCurrentPlace(); return; }
  if (command.action === 'tv-home') return tvHomePress();
  if (command.action === 'tv-settings') return tvSettingsPress();
  if (command.action === 'tv-back') return void tvBack().catch(error => log(`tv back failure ${error.message}`));
  if (command.action === 'tv-play-pause') return void tvPlayPause().catch(error => log(`tv play failure ${error.message}`));
  if (command.action === 'tv-context') return tvContext();
  if (command.action === 'tv-nav-peek') return toggleNavPeek();
  if (command.action === 'noutube-import-session') return void importYouTubeSession().catch(error => log(`youtube session import failure ${error.message}`));
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
  layerNavProcess = spawn('/usr/bin/python3', [path.join(APP_DIR, 'layer-nav.py'), NAV_SOCKET, NAV_STATE_FILE, LAYER_SOCKET, PANEL_STATE_FILE], { env: process.env, stdio: ['ignore', 'ignore', 'pipe'] });
  layerNavProcess.stderr.on('data', data => log(`layer nav: ${String(data).trim()}`));
  layerNavProcess.once('error', error => log(`layer nav launch failure ${error.message}`));
  layerNavProcess.once('exit', () => { layerNavProcess = null; navPeekOpen = false; if (panelOpen) { panelOpen = false; stopPanelUpdates(); } if (!quitting) setTimeout(spawnLayerNav, 1500); });
}
function startLayerNav() {
  try { fs.unlinkSync(NAV_SOCKET); } catch {}
  navControlServer = net.createServer(socket => { let raw = ''; socket.on('data', chunk => { if (raw.length < 4096) raw += chunk; }); socket.on('error', () => {}); socket.on('end', () => { try { handleLayerNavCommand(JSON.parse(raw)); } catch (error) { log(`nav command failure ${error.message}`); } }); });
  navControlServer.on('error', error => log(`layer nav socket failure ${error.message}`));
  navControlServer.listen(NAV_SOCKET, () => { try { fs.chmodSync(NAV_SOCKET, 0o600); } catch {} spawnLayerNav(); });
  writeLayerNavState();
}

app.whenReady().then(() => { config = loadConfig(); jellyfinVault = loadJellyfinVault(); createWindow(); watchAudio(); importYouTubeSession().catch(error => log(`youtube session import failure ${error.message}`)); audioState().then(result => { if (!result.unavailable) { systemVolume = result.volume; writeLayerNavState(); } }).catch(() => {}); globalShortcut.register('Control+Alt+H', showHome); globalShortcut.register('Control+Alt+Shift+Q', () => app.quit()); app.on('activate', () => mainWindow.show()); });
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
// L'arrêt ferme les vues une à une : leurs événements de fermeture ne doivent plus rien déclencher.
app.on('before-quit', () => { quitting = true; audioWatcher?.kill(); stopPanelUpdates(); });
app.on('window-all-closed', () => app.quit()); app.on('will-quit', () => { quitting = true; globalShortcut.unregisterAll(); stopNativeMoonlight(); for (const serviceSession of configuredSessions) { try { serviceSession.flushStorageData(); } catch {} } if (layerNavProcess && !layerNavProcess.killed) layerNavProcess.kill('SIGTERM'); navControlServer?.close(); try { fs.unlinkSync(NAV_SOCKET); } catch {} });
ipcMain.handle('state:get', event => { requireShellSender(event); return state(); });
ipcMain.handle('home:show', event => { requireShellSender(event); return showHome(); });
// Le script NouTube n'est remis qu'aux vues NouTube : aucune autre page ne peut le demander.
function isYouTubeUrl(value) { try { const { protocol, hostname } = new URL(value); return protocol === 'https:' && (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')); } catch { return false; } }
ipcMain.on('noutube:boot', event => {
  const allowed = noutubeContents.has(event.sender) && event.senderFrame === event.sender.mainFrame && isYouTubeUrl(event.senderFrame.url);
  event.returnValue = allowed ? { source: loadNoutubeSource(), settings: NOUTUBE_SETTINGS } : null;
});
ipcMain.on('noutube:status', (event, status) => {
  if (!noutubeContents.has(event.sender)) return;
  const host = String(status?.host || '').slice(0, 60);
  log(status?.active === true ? `noutube actif ${host}` : `noutube INACTIF ${host}`);
});
ipcMain.handle('tv:settings', event => { requireMainSender(event); return tvSettingsPress(); });
ipcMain.on('shell:page', (event, value) => { if (event.sender === mainWindow?.webContents && (value === 'home' || value === 'settings')) shellPage = value; });
ipcMain.handle('app:launch', (event, id) => { requireShellSender(event); return launch(id); });
ipcMain.handle('app:close', (event, id) => { requireMainSender(event); return closeService(id); });
ipcMain.handle('weather:get', event => { requireMainSender(event); return weather(); });
ipcMain.handle('system:stats', event => { requireMainSender(event); return stats(); });
ipcMain.handle('settings:save', (event, patch) => { requireMainSender(event); if (!patch || typeof patch !== 'object') throw new Error('Réglages invalides'); config = safeConfig({ ...config, ...patch }); saveConfig(); return state(); });
ipcMain.handle('jellyfin:hero', (event, force) => { requireMainSender(event); return jellyfinHero(force === true); });
ipcMain.handle('jellyfin:play', (event, id) => { requireMainSender(event); return playJellyfin(id); });
ipcMain.handle('network:status', event => { requireMainSender(event); return networkStatus(); });
ipcMain.handle('audio:get', event => { requireShellSender(event); return audioOutputs(); });
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
