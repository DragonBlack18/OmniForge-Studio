/**
 * Network boundary for v0.1.2: local APIs only, literal 127.0.0.1 URLs.
 * No DNS resolution, redirects, embedded credentials or external HTTP.
 */
export const HTTP_MAX_REQUEST_BYTES = 128_000;
export const HTTP_MAX_RESPONSE_BYTES = 512_000;
export const HTTP_MIN_TIMEOUT_MS = 100;
export const HTTP_MAX_TIMEOUT_MS = 10_000;

export function validateLocalHttpConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuração HTTP inválida.');
  const endpoint = config.url;
  if (typeof endpoint !== 'string' || endpoint.length > 500 ||
      !/^http:\/\/127\.0\.0\.1(?::\d{1,5})?(?:\/|\?|$)/.test(endpoint)) {
    throw new Error('Na v0.1.2 use somente http://127.0.0.1:PORTA/caminho (sem DNS ou rede externa).');
  }
  let url;
  try { url = new URL(endpoint); }
  catch { throw new Error('URL HTTP inválida.'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash) {
    throw new Error('URL HTTP contém usuário, fragmento ou destino proibido.');
  }
  const explicitPort = /^http:\/\/127\.0\.0\.1:(\d{1,5})/.exec(endpoint)?.[1];
  if (explicitPort && (+explicitPort < 1 || +explicitPort > 65535)) throw new Error('Porta TCP inválida.');
  if (!['GET', 'POST'].includes(config.method)) throw new Error('Método HTTP permitido: GET ou POST.');
  const timeoutMs = Number(config.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < HTTP_MIN_TIMEOUT_MS || timeoutMs > HTTP_MAX_TIMEOUT_MS) {
    throw new Error('Timeout HTTP deve estar entre 100 e 10000 ms.');
  }
  return { url, method: config.method, timeoutMs };
}

export function summarizeLocalHttpNodes(flow) {
  return Array.isArray(flow?.nodes) ? flow.nodes.filter(n => n?.type === 'http.localJson')
    .map(n => { const { url, method } = validateLocalHttpConfig(n.config); return { nodeId: n.id, method, destination: url.origin + url.pathname }; }) : [];
}

export async function fetchLocalJson(config, input, { networkApproved = false } = {}) {
  const { url, method, timeoutMs } = validateLocalHttpConfig(config);
  if (!networkApproved) throw new Error('Acesso HTTP negado: confirme a operação na janela do OmniForge.');
  const headers = { accept: 'application/json' };
  let body;
  if (method === 'POST') {
    body = JSON.stringify(input);
    if (body === undefined) throw new Error('O corpo JSON do POST não pode ser indefinido.');
    if (Buffer.byteLength(body) > HTTP_MAX_REQUEST_BYTES) throw new Error('Corpo HTTP excede 128 kB.');
    headers['content-type'] = 'application/json';
  }
  let response;
  try {
    response = await fetch(url, {
      method, headers, body, redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (err) {
    // Avoid exposing query parameters, response contents or proxy diagnostics in the UI.
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new Error(`HTTP excedeu limite de ${timeoutMs} ms.`);
    throw new Error('Não foi possível comunicar com a API local (conexão, timeout ou redirecionamento).');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`API local retornou HTTP ${response.status}.`);
  }
  const mime = response.headers.get('content-type') || '';
  if (!/^application\/(?:[\w.+-]*\+)?json(?:\s*;|\s*$)/i.test(mime)) {
    await response.body?.cancel().catch(() => {});
    throw new Error('A API deve responder application/json.');
  }
  if (Number(response.headers.get('content-length') || 0) > HTTP_MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Resposta da API excede 512 kB.');
  }
  const chunks = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > HTTP_MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error('Resposta da API excede 512 kB.');
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks, total).toString('utf8')); }
  catch { throw new Error('API retornou JSON inválido.'); }
  return { status: response.status, data };
}
