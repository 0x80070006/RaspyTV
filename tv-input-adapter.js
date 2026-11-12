// Injecté dans chaque application web : navigation à la croix directionnelle entre
// les tuiles, et avance rapide dans les lecteurs vidéo. Le reste du clavier est laissé
// au site. Le script ne doit jamais casser une page : tout y reste optionnel.
(() => {
  if (window.__raspyTv) return true;

  const SEEK_SECONDS = 10;
  const SEEK_REPEAT_MS = 500;
  const OSD_MS = 1200;
  const SEARCH_RANGE = 2;  // Écrans explorés autour de la tuile, pour rester rapide sur le Pi.
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[role=button],[role=link],[role=menuitem],[role=tab],[role=option],[role=checkbox],[role=switch]';
  const NATIVELY_FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]';
  const NATIVELY_ACTIVATED = 'a[href],button,input,select,textarea,summary';
  // Une tuile contient souvent plusieurs liens : on saute de tuile en tuile, pas de lien en lien.
  const TILE = '.card,.listItem,ytd-rich-item-renderer,ytd-video-renderer,ytd-grid-video-renderer,ytd-compact-video-renderer,[data-testid*="card"],[data-testid="tracklist-row"]';
  const DIALOG = 'dialog[open],[role="dialog"],[aria-modal="true"],.dialog.opened';
  const SEARCH = 'input[type=search],input[name=search_query],input[name=q],[data-testid="search-input"],[role=searchbox]';
  const SEARCH_BUTTON = '.headerSearchButton,[aria-label*="search" i],[aria-label*="recherch" i],a[href*="search"]';
  const EDITABLE = 'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]),textarea,[contenteditable=true],[role=textbox]';
  const DIRECTIONS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

  const root = document.documentElement;
  const onHost = domain => location.hostname === domain || location.hostname.endsWith(`.${domain}`);
  const isJellyfin = () => !!(window.ApiClient || document.querySelector('.skinHeader'));
  const viewportArea = () => innerWidth * innerHeight;
  const editable = el => !!el?.closest?.(EDITABLE);

  const style = document.createElement('style');
  style.textContent = 'html.raspy-keynav :focus{outline:3px solid #fff!important;outline-offset:-3px!important;box-shadow:inset 0 0 0 6px rgba(139,123,255,.85)!important}.raspy-seek-osd{position:fixed;left:50%;bottom:9%;transform:translateX(-50%);z-index:2147483647;padding:10px 20px;border-radius:14px;background:rgba(8,11,19,.88);color:#fff;font:700 22px/1.2 system-ui,sans-serif;pointer-events:none}';
  (document.head || root).appendChild(style);

  function playerPageAllows(video) {
    if (onHost('netflix.com')) return location.pathname.startsWith('/watch');
    if (onHost('youtube.com')) return /^\/(watch|live|shorts)/.test(location.pathname);
    if (isJellyfin()) return video.classList.contains('htmlvideoplayer');
    return null;  // Site inconnu : la taille de la vidéo décide seule.
  }

  function activeVideo() {
    let best = null, bestArea = 0;
    for (const video of document.querySelectorAll('video')) {
      const rect = video.getBoundingClientRect();
      const area = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0)) * Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      if (area <= bestArea || getComputedStyle(video).visibility === 'hidden') continue;
      const allowed = playerPageAllows(video);
      if (allowed === false) continue;
      // Sur une page de lecteur connue, une vidéo qui charge reste un lecteur : les flèches ne doivent pas repartir dans la page.
      if (allowed === null && video.readyState === 0) continue;
      const fullscreen = !!document.fullscreenElement?.contains(video);
      // Sur un site inconnu, une vidéo muette en boucle est un décor, pas un lecteur.
      if (allowed === null && !fullscreen && (area < viewportArea() * .5 || (video.loop && video.muted))) continue;
      if (allowed === true && !fullscreen && area < viewportArea() * .15) continue;
      best = video; bestArea = area;
    }
    return best;
  }

  let osdElement = null, osdTimer = null;
  function showOsd(text) {
    osdElement ||= Object.assign(document.createElement('div'), { className: 'raspy-seek-osd' });
    osdElement.textContent = text;
    (document.fullscreenElement || document.body || root).appendChild(osdElement);
    clearTimeout(osdTimer);
    osdTimer = setTimeout(() => osdElement?.remove(), OSD_MS);
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s).padStart(2, '0')}`;
  }

  function seekBy(video, delta) {
    if (!video.isConnected) return stopSeeking();
    if (video.readyState === 0) return showOsd('Chargement de la vidéo…');
    const ranges = video.seekable;
    if (!ranges?.length) return showOsd('Avance impossible sur ce direct');
    const start = ranges.start(0), end = ranges.end(ranges.length - 1);
    const limit = Number.isFinite(video.duration) ? Math.min(end, Math.max(0, video.duration - 1)) : end;
    const target = Math.max(start, Math.min(limit, video.currentTime + delta));
    try { video.currentTime = target; } catch { return; }
    showOsd(`${delta > 0 ? '+' : '−'}${Math.abs(delta)} s  ·  ${formatTime(target)}`);
  }

  let seekKey = null, seekTimer = null;
  function startSeeking(key, video, delta) {
    stopSeeking();
    seekKey = key;
    seekBy(video, delta);
    seekTimer = setInterval(() => seekBy(video, delta), SEEK_REPEAT_MS);
  }
  function stopSeeking() { clearInterval(seekTimer); seekTimer = null; seekKey = null; }

  function isUsable(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.bottom < -innerHeight * SEARCH_RANGE || rect.top > innerHeight * (SEARCH_RANGE + 1)) return false;
    if (el.closest('[aria-hidden="true"],[inert],[hidden]')) return false;
    const css = getComputedStyle(el);
    return css.visibility !== 'hidden' && css.display !== 'none' && css.pointerEvents !== 'none' && Number(css.opacity) > .05;
  }

  function topDialog() {
    const dialogs = [...document.querySelectorAll(DIALOG)].filter(dialog => dialog.getBoundingClientRect().width > 0 && getComputedStyle(dialog).visibility !== 'hidden');
    return dialogs[dialogs.length - 1] || null;
  }

  function candidates() {
    const items = [...(topDialog() || document).querySelectorAll(FOCUSABLE)];
    const usable = items.filter(isUsable);
    // Un conteneur focusable qui englobe d'autres cibles n'est pas une destination utile.
    const containers = new Set();
    for (const el of usable) for (let parent = el.parentElement; parent; parent = parent.parentElement) containers.add(parent);
    return usable.filter(el => !containers.has(el) || el.closest(TILE) === el);
  }

  // Champ de texte atteint à la croix : on s'y arrête sans ouvrir le clavier virtuel, qui cacherait
  // l'écran, et les flèches peuvent en repartir. ✕ l'ouvre ; les flèches servent alors au texte.
  let passingThrough = null;

  function focusOn(el) {
    if (!el.matches(NATIVELY_FOCUSABLE)) el.setAttribute('tabindex', '-1');
    root.classList.add('raspy-keynav');
    window.__raspyNavFocusing = true;
    try { el.focus({ preventScroll: true }); } finally { window.__raspyNavFocusing = false; }
    passingThrough = editable(el) ? el : null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function move(direction) {
    const items = candidates();
    const current = items.includes(document.activeElement) ? document.activeElement : null;
    if (!current) {
      const visible = items.filter(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
      const first = visible.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top + ra.left) - (rb.top + rb.left); })[0];
      if (!first) return false;
      focusOn(first);
      return true;
    }
    const a = current.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    // Tuile sortie de l'écran : le premier appui la montre, sinon la sélection partirait à l'aveugle.
    if (a.bottom <= 0 || a.top >= innerHeight) { focusOn(current); return true; }
    const horizontal = direction === 'left' || direction === 'right';
    const tile = current.closest(TILE);
    let winner = null, score = Infinity;
    for (const item of items) {
      if (item === current || (tile && tile.contains(item))) continue;
      const b = item.getBoundingClientRect(), dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
      const valid = direction === 'left' ? dx < -2 : direction === 'right' ? dx > 2 : direction === 'up' ? dy < -2 : dy > 2;
      if (!valid) continue;
      const main = horizontal ? Math.abs(dx) : Math.abs(dy), cross = horizontal ? Math.abs(dy) : Math.abs(dx);
      // On préfère nettement ce qui est aligné : sinon la tuile voisine perd face à la ligne suivante.
      const aligned = horizontal ? b.bottom > a.top && b.top < a.bottom : b.right > a.left && b.left < a.right;
      const value = main + cross * 2.4 + (aligned ? 0 : innerHeight);
      if (value < score) { score = value; winner = item; }
    }
    if (!winner) return false;
    focusOn(winner);
    return true;
  }

  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };

  addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Enter') {
      const el = document.activeElement;
      if (el && el === passingThrough) { consume(event); passingThrough = null; console.info('__RASPY_OSK_OPEN__'); return; }
      if (!event.repeat && el && el !== document.body && !el.matches(NATIVELY_ACTIVATED) && el.matches(FOCUSABLE)) { consume(event); el.click(); }
      return;
    }
    const direction = DIRECTIONS[event.key];
    if (!direction || (editable(event.target) && event.target !== passingThrough)) return;
    const video = activeVideo();
    if (video) {
      const vertical = direction === 'up' || direction === 'down';
      if (vertical) { consume(event); return; }
      if (onHost('netflix.com')) return;  // Modifier l'heure directement fait planter le lecteur de Netflix : ses touches avancent déjà de 10 s.
      consume(event);
      if (!event.repeat) startSeeking(event.key, video, direction === 'right' ? SEEK_SECONDS : -SEEK_SECONDS);
      return;
    }
    const target = event.target;
    if (target?.matches?.('select') && (direction === 'up' || direction === 'down')) return;
    if (target?.matches?.('input[type=range],[role=slider]')) return;
    if (move(direction)) consume(event);
  }, true);

  addEventListener('keyup', event => {
    if (event.key !== seekKey) return;
    stopSeeking();
    consume(event);
  }, true);

  addEventListener('blur', stopSeeking);
  document.addEventListener('visibilitychange', stopSeeking);
  addEventListener('pagehide', stopSeeking);
  addEventListener('pointermove', () => root.classList.remove('raspy-keynav'), { passive: true });

  let revealOffset = 0;
  function revealControls(video) {
    const rect = video.getBoundingClientRect();
    // Les lecteurs ignorent un mouvement sans déplacement : la position change donc à chaque appel.
    for (let step = 0; step < 2; step++) {
      revealOffset = (revealOffset + 40) % 400;
      const x = rect.left + rect.width / 2 + revealOffset, y = rect.top + rect.height / 2;
      const options = { bubbles: true, clientX: x, clientY: y, screenX: x, screenY: y };
      video.dispatchEvent(new PointerEvent('pointermove', { ...options, pointerType: 'mouse' }));
      video.dispatchEvent(new MouseEvent('mousemove', options));
    }
  }

  window.__raspyTv = {
    // Clavier virtuel fermé par ○ : le focus reste dans le champ, les flèches doivent pouvoir en sortir.
    keyboardClosed() { const el = document.activeElement; if (editable(el)) passingThrough = el; return true; },
    playPause() {
      const media = activeVideo() || [...document.querySelectorAll('video,audio')].find(item => !item.paused);
      if (!media) return false;
      if (media.paused) media.play().catch(() => {}); else media.pause();
      return true;
    },
    // Triangle : les commandes du lecteur pendant une vidéo, sinon la recherche du site.
    context() {
      const video = activeVideo();
      if (video) { revealControls(video); return 'controls'; }
      const field = [...document.querySelectorAll(SEARCH)].find(isUsable);
      if (field) { focusOn(field); passingThrough = null; console.info('__RASPY_OSK_OPEN__'); return 'search'; }
      const button = [...document.querySelectorAll(SEARCH_BUTTON)].find(isUsable);
      if (button) { focusOn(button); button.click(); return 'search'; }
      return false;
    },
  };
  return true;
})();
