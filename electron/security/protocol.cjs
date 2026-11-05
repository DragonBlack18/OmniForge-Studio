'use strict';
const path = require('node:path');
// No development origins, eval, remote frames or form submissions in shipped HTML.
const PRODUCTION_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; media-src 'none'";
function resolveResource(request, distDir) {
  if (!request || !['GET','HEAD'].includes(request.method || 'GET')) throw Error('method');
  const url = new URL(request.url);
  if (url.protocol !== 'omni:' || url.host !== 'app' || url.username || url.password) throw Error('origin');
  const raw = decodeURIComponent(url.pathname);
  const relative = raw === '/' ? 'index.html' : raw.slice(1);
  const parts = relative.split('/');
  if (!raw.startsWith('/') || relative.length > 2048 || /[\\\0:]/.test(relative) ||
      parts.some(part => !part || part === '.' || part === '..')) throw Error('path');
  const root = path.resolve(distDir), absolute = path.resolve(root, ...parts);
  if (!absolute.startsWith(root + path.sep)) throw Error('path');
  return { absolute, document: relative === 'index.html', head: request.method === 'HEAD' };
}
module.exports = { PRODUCTION_CSP, resolveResource };
