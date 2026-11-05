// Browser-only stand-in for the Electron preload bridge, used to preview the
// interface with fictional data (demo.html). Nothing here talks to a server.
(() => {
  const art = (a, b, c, label = '') => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient><radialGradient id="r" cx=".72" cy=".38" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1150" cy="340" r="420" fill="url(#r)"/><path d="M0 720 Q400 600 800 700 T1600 640 V900 H0Z" fill="#000" opacity=".28"/><path d="M0 800 Q500 700 1000 790 T1600 760 V900 H0Z" fill="#000" opacity=".35"/>${label ? `<text x="800" y="500" font-family="sans-serif" font-size="120" font-weight="700" fill="#fff" fill-opacity=".9" text-anchor="middle">${label}</text>` : ''}</svg>`);
  const films = [
    ['Les Marées d’Ambre', '#3b1d4a', '#b4543a', '#f2b36b', 2023, 118, '7.8', 'Sur une île où la mer se retire chaque été, une cartographe découvre une ville engloutie que personne ne se souvient avoir quittée.'],
    ['Orbite Basse', '#071c35', '#0a3d91', '#59c3ff', 2024, 132, '8.1', 'Coincés dans une station en perdition, cinq techniciens ont quatre-vingt-dix minutes pour choisir qui redescendra sur Terre.'],
    ['Le Dernier Phare', '#0d3d2e', '#2a6e5a', '#d8f0c8', 2022, 104, '7.2', 'Un gardien de phare reçoit chaque nuit des signaux lumineux d’un navire qui a sombré il y a cent ans.'],
    ['Néon Sud', '#551b2c', '#a3245c', '#ff8bd1', 2021, 97, '6.9', 'Une chauffeuse de nuit traverse une métropole écrasée de chaleur avec, sur la banquette arrière, un passager qui ne vieillit pas.'],
    ['Plein Hiver', '#17191f', '#4a5a78', '#e6eefc', 2020, 121, '7.5', 'Dans un village isolé par la neige, les habitants découvrent que le printemps a été annulé par décret.'],
  ];
  const items = films.map(([name, a, b, c, year, runtime, rating, overview], i) => ({ id: `demo${i}0000000000000`, name, overview, year, runtime, rating, backdrop: art(a, b, c) }));
  const continueItems = [
    { name: 'Orbite Basse', subtitle: '2024', progress: 62, image: art('#071c35', '#0a3d91', '#59c3ff') },
    { name: 'Les Cartographes', subtitle: 'Les Cartographes · S1 E4', progress: 35, image: art('#39452a', '#7a8a3a', '#e8e0a0') },
    { name: 'Néon Sud', subtitle: '2021', progress: 81, image: art('#551b2c', '#a3245c', '#ff8bd1') },
    { name: 'Station Polaire', subtitle: 'Station Polaire · S2 E1', progress: 12, image: art('#263345', '#5a7a9a', '#cfe6ff') },
    { name: 'Le Dernier Phare', subtitle: '2022', progress: 48, image: art('#0d3d2e', '#2a6e5a', '#d8f0c8') },
    { name: 'Plein Hiver', subtitle: '2020', progress: 90, image: art('#17191f', '#4a5a78', '#e6eefc') },
  ].map((item, i) => ({ id: `cont${i}0000000000000`, ...item }));
  const recentItems = [
    { name: 'Plein Hiver', subtitle: '2020', image: art('#17191f', '#4a5a78', '#e6eefc') },
    { name: 'La Dernière Marée', subtitle: '2024', image: art('#071c35', '#1aa39a', '#a8ffe8') },
    { name: 'Vent Solaire', subtitle: '2023', image: art('#7a3828', '#e07a3a', '#ffd889') },
    { name: 'Les Cartographes', subtitle: '2022', image: art('#39452a', '#7a8a3a', '#e8e0a0') },
    { name: 'Nuit Blanche', subtitle: '2021', image: art('#3b1d4a', '#a970ff', '#e6d8ff') },
    { name: 'Rive Gauche', subtitle: '2020', image: art('#551b2c', '#e50914', '#ffb3b3') },
  ].map((item, i) => ({ id: `rece${i}0000000000000`, ...item }));
  const games = [['Rally Horizon', '#7a3828', '#e07a3a', '#ffd889'], ['Star Drift', '#071c35', '#3b1d4a', '#a970ff'], ['Pixel Forge', '#064f5e', '#1aa39a', '#a8ffe8'], ['Kart Mania', '#551b2c', '#e50914', '#ffb3b3'], ['Deep Ruins', '#17191f', '#39452a', '#c8d890'], ['Sky Harbor', '#0a3d91', '#4f8cff', '#e6eefc']]
    .map(([name, a, b, c]) => ({ name, id: name, hdr: false, boxart: art(a, b, c, name.split(' ')[0]) }));
  const apps = [
    ['jellyfin', 'Jellyfin', 'assets/icons/jellyfin.svg', '#a855f7'],
    ['youtube', 'YouTube', 'assets/icons/youtube.svg', '#ff244a'], ['spotify', 'Spotify', 'assets/icons/spotify.svg', '#1ed760'],
    ['twitch', 'Twitch', 'assets/icons/twitch.svg', '#a970ff'], ['netflix', 'Netflix', 'assets/icons/netflix.svg', '#e50914'],
    ['homelab', 'Dashboard', 'assets/icons/dashy.png', '#00e5d0'], ['immich', 'Immich', 'assets/icons/immich.png', '#fa2921'],
  ].map(([id, name, icon, color]) => ({ id, name, icon, color, url: 'https://example.com/', native: true, open: id === 'youtube' }));
  apps.push({ id: 'custom-demo', name: 'Ma radio', icon: null, color: '#ff8a3d', url: 'https://example.com/', native: false, open: false });
  const config = { theme: 'dark', background: 'color:#000000', clock24: true, sounds: false, soundVolume: 45, reducedMotion: false, showWeather: true, showClock: true, showSpotify: true, showRecent: true, maxResidentApps: 4, appOrder: apps.map(app => app.id), shortcuts: [], recent: [] };
  const state = { config, apps, activeId: null, nativeMode: false, artMode: false, site: { weatherLabel: 'Paris', moonlight: true } };
  const listeners = { state: [], navigate: [] };
  const params = new URLSearchParams(location.search);
  window.raspy = {
    getState: async () => state,
    saveSettings: async patch => { Object.assign(config, patch); listeners.state.forEach(fn => fn({ ...state })); return state; },
    weather: async () => ({ temperature: 14, code: 2, min: 9, max: 17, offline: false }),
    networkStatus: async () => ({ online: true, lan: true }),
    jellyfinHero: async () => ({ items, continueItems, recentItems, needsLogin: false }),
    moonlightGames: async () => ({ games, needsPairing: false, unavailable: false }),
    stats: async () => ({ hostname: 'raspytv', uptime: 3600, cpu: 'Cortex-A72', ram: { used: 1.4 * 1073741824, total: 4 * 1073741824 }, temperature: 48.3, disk: { free: '18G', used: '41' }, residentApps: 2, residentLimit: 4, electron: '37.2.0', node: '22.16.0' }),
    getAudio: async () => ({ sinks: [{ id: 'hdmi', name: 'HDMI · Téléviseur', detail: '', volume: 45, active: true }, { id: 'bt', name: 'Casque sans fil', detail: 'Bluetooth', volume: 30, active: false }], activeId: 'hdmi', volume: 45 }),
    launch: async () => {}, closeApp: async () => {}, home: async () => {}, playJellyfin: async () => {}, openMoonlight: async () => {}, playMoonlight: async () => {},
    addShortcut: async () => {}, updateShortcut: async () => {}, removeShortcut: async () => {}, fetchIcon: async () => null, systemAction: async () => {},
    setAudioOutput: async () => {}, setSystemVolume: async () => {}, adjustSystemVolume: async () => {}, artMode: () => {},
    onState: fn => listeners.state.push(fn), onNavigate: fn => { listeners.navigate.push(fn); if (params.get('page') === 'settings') setTimeout(() => fn('settings'), 50); },
    onToast: () => {}, onNavVisible: () => {},
  };
})();
