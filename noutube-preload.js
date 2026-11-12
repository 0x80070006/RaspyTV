// Preload des applications NouTube : exécute le script de NouTube dans la page avant les
// scripts de YouTube, pour que le filtrage des publicités s'applique dès le premier affichage.
//
// Une balise <script> serait bloquée par la politique de sécurité de YouTube (Trusted Types) :
// le script est donc transmis comme une fonction, qu'Electron exécute directement dans la page.
// Il ne concerne que YouTube : les pages de connexion Google, par exemple, n'en reçoivent rien.
const { contextBridge, ipcRenderer } = require('electron');

const host = location.hostname;
if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
  let active = false;
  try {
    const boot = ipcRenderer.sendSync('noutube:boot', host);
    if (boot && typeof boot.source === 'string' && boot.source) {
      // YouTube et YouTube Music déclarent leurs commandes « titre précédent / suivant » au système
      // (navigator.mediaSession). On les note au passage : c'est le moyen le plus fiable de les déclencher.
      const prelude = "try { const session = navigator.mediaSession; if (session && !window.__raspyMediaHandlers) { const handlers = window.__raspyMediaHandlers = {}; const declare = session.setActionHandler.bind(session); session.setActionHandler = (action, handler) => { handlers[action] = handler; return declare(action, handler); }; } } catch (e) {}\n"
        + "window.NouTubeInitialSettings = settings;\n"
        + "try { localStorage.setItem('nou:settings', JSON.stringify(settings)); } catch (e) {}\n";
      // NouTube ne masque pas les Shorts de lui-même : c'est à l'application hôte de le demander, une
      // fois l'en-tête de la page créé. L'entrée « Shorts » du menu latéral, qu'il ignore, est ajoutée ici.
      const shorts = "const applyShorts = () => {\n"
        + "  if (!settings.hideShorts || document.getElementById('noutube-shorts')) return;\n"
        + "  window.NouTube?.hideShorts?.();\n"
        + "  const guide = document.createElement('style');\n"
        + "  guide.textContent = 'ytd-guide-entry-renderer:has(a[title=\"Shorts\"]),ytd-mini-guide-entry-renderer:has(a[title=\"Shorts\"]){display:none!important}';\n"
        + "  document.head.appendChild(guide);\n"
        + "};\n"
        + "if (document.head) applyShorts(); else document.addEventListener('DOMContentLoaded', applyShorts, { once: true });\n";
      const run = new Function('settings', `${prelude}try {\n${boot.source}\n${shorts}} catch (error) { console.error('NouTube', error); }\nreturn typeof window.NouTube === 'object';`);
      active = contextBridge.executeInMainWorld({ func: run, args: [boot.settings || {}] }) === true;
    }
  } catch (error) {
    console.error('NouTube preload', error);
  }
  ipcRenderer.send('noutube:status', { active, host });
}
