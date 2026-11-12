// Import d'une session YouTube exportée d'un navigateur (format cookies.txt « Netscape »).
// Google refuse la connexion directe dans un navigateur intégré : on reprend donc une session
// ouverte dans ton navigateur habituel. Seuls les cookies YouTube et Google sont retenus.
'use strict';

const ALLOWED_DOMAIN = /^\.?(?:[a-z0-9-]+\.)*(?:youtube\.com|google\.com)$/i;

function parseCookiesTxt(text, now = Date.now() / 1000) {
  const cookies = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    let line = rawLine.trim();
    let httpOnly = false;
    if (line.startsWith('#HttpOnly_')) { httpOnly = true; line = line.slice('#HttpOnly_'.length); }
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('\t');
    if (fields.length < 7) continue;
    const [domain, , cookiePath, secureFlag, expiryText, name, ...rest] = fields;
    const value = rest.join('\t');
    if (!ALLOWED_DOMAIN.test(domain) || !name) continue;
    const expiry = Number(expiryText);
    if (expiry > 0 && expiry < now) continue;  // Déjà expiré : inutile de l'importer.
    cookies.push({ domain, path: cookiePath || '/', secure: /^true$/i.test(secureFlag), expirationDate: expiry > 0 ? expiry : undefined, name, value, httpOnly });
  }
  return cookies;
}

// Paramètres attendus par session.cookies.set, en respectant les préfixes __Host- et __Secure-.
function toElectronCookie(cookie) {
  const host = cookie.domain.replace(/^\./, '');
  const hostOnly = cookie.name.startsWith('__Host-');
  const secure = cookie.secure || hostOnly || cookie.name.startsWith('__Secure-');
  const details = {
    url: `https://${host}${hostOnly ? '/' : cookie.path}`,
    name: cookie.name,
    value: cookie.value,
    path: hostOnly ? '/' : cookie.path,
    secure,
    httpOnly: cookie.httpOnly,
    // Les cookies Google circulent entre youtube.com et google.com : ils doivent rester intersites.
    sameSite: secure ? 'no_restriction' : 'lax',
  };
  if (!hostOnly && cookie.domain.startsWith('.')) details.domain = cookie.domain;
  if (cookie.expirationDate) details.expirationDate = cookie.expirationDate;
  return details;
}

module.exports = { parseCookiesTxt, toElectronCookie };
