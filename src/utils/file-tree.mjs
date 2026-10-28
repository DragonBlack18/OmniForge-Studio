/**
 * Renderer-only projection of the immutable workspace file index.
 * Files are returned by the backend, never opened through a constructed path.
 */
export function visibleFileEntries(entries, { query = '', collapsedPaths = new Set() } = {}) {
  if (!Array.isArray(entries)) throw new TypeError('Índice de arquivos inválido.');
  const text = typeof query === 'string' ? query.trim().toLocaleLowerCase('pt-BR') : '';
  const hidden = collapsedPaths instanceof Set ? collapsedPaths : new Set(collapsedPaths);
  return entries.filter(entry => {
    if (!entry || typeof entry.path !== 'string' || !['file', 'directory'].includes(entry.kind)) return false;
    if (text) return entry.kind === 'file' && entry.path.toLocaleLowerCase('pt-BR').includes(text);
    const segments = entry.path.split('/');
    for (let i = 1; i < segments.length; i++)
      if (hidden.has(segments.slice(0, i).join('/'))) return false;
    return true;
  });
}
