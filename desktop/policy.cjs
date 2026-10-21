const ASSETS = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/core.mjs', ['core.mjs', 'text/javascript; charset=utf-8']],
  ['/store.mjs', ['store.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/mark.svg', ['mark.svg', 'image/svg+xml']],
]);
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'";
function isAppURL(value) {
  try { const url = new URL(value); return url.protocol === 'skillvault:' && url.hostname === 'app' && !url.port && !url.username && !url.password; }
  catch { return false; }
}
function externalURL(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
function resolveAsset(value) {
  if (!isAppURL(value)) return null;
  return ASSETS.get(new URL(value).pathname) || null;
}
module.exports = { ASSETS, CSP, isAppURL, externalURL, resolveAsset };
