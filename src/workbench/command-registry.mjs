// Workbench command index: navigation and safe file-opening only.
// Never execute a shell command or resolve a path from free-form input.
import { NAV_GROUPS } from './module-registry.mjs';

const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export const NAV_COMMANDS = Object.freeze(NAV_GROUPS.flatMap(group =>
  group.items.map(item => Object.freeze({
    id: 'navigate:' + item.mode, kind: 'navigate', mode: item.mode,
    title: item.label, detail: group.title, icon: item.icon,
    searchText: normalize(item.label + ' ' + item.aria + ' ' + group.title + ' ' + item.mode),
    requiresWorkspace: item.mode === 'history'
  }))
));

const ACTIONS = Object.freeze([
  {id:'action:open-project', kind:'action', action:'open-project', title:'Abrir projeto local',
    detail:'WORKSPACE', icon:'folder', searchText:'abrir projeto workspace pasta local'},
  {id:'action:toggle-nav', kind:'action', action:'toggle-nav', title:'Recolher ou expandir navegação',
    detail:'APARÊNCIA', icon:'panel', searchText:'sidebar barra lateral recolher expandir navegacao'},
  {id:'action:toggle-context', kind:'action', action:'toggle-context', title:'Alternar painel de ferramentas',
    detail:'APARÊNCIA · EDITOR / AUTOMAÇÃO', icon:'layers', searchText:'ferramentas painel lateral arquivos blocos',
    modes:['code','canvas']},
  {id:'action:toggle-inspector', kind:'action', action:'toggle-inspector', title:'Alternar inspetor de automações',
    detail:'APARÊNCIA · AUTOMAÇÃO', icon:'panel', searchText:'inspetor automacao configuracao bloco',
    modes:['canvas']}
].map(item => Object.freeze(item)));

export function buildWorkbenchCommands(files = [], workspace = '') {
  const commands = [...NAV_COMMANDS, ...ACTIONS];
  if (!workspace || !Array.isArray(files)) return commands;
  const seen = new Set();
  for (const item of files) {
    if (item?.kind !== 'file' || typeof item.path !== 'string' || item.path.length > 300 ||
        !item.path || item.path.startsWith('/') || item.path.includes('\\') ||
        item.path.split('/').some(segment => !segment || segment === '.' || segment === '..') ||
        seen.has(item.path)) continue;
    seen.add(item.path);
    commands.push({
      id:'file:' + item.path, kind:'file', path:item.path,
      title:item.path.split('/').at(-1), detail:item.path, icon:'code',
      searchText:normalize(item.path)
    });
  }
  return commands;
}

/** Deterministic bounded ranking, independent of React/DOM and locale accents. */
export function searchWorkbenchCommands(commands, query = '', {
  scope = 'all', mode = 'home', hasWorkspace = false, limit = 35
} = {}) {
  if (!Array.isArray(commands)) throw new TypeError('Catálogo de comandos inválido.');
  const needle = normalize(query).slice(0, 120);
  const tokens = needle.split(/\s+/).filter(Boolean);
  const max = Math.max(1, Math.min(60, Math.trunc(limit) || 35));
  const rows = [];
  for (const item of commands) {
    if (!item || (scope === 'files' ? item.kind !== 'file' : false) ||
        (item.requiresWorkspace && !hasWorkspace) ||
        (item.modes && !item.modes.includes(mode))) continue;
    const text = item.searchText || normalize(item.title + ' ' + item.detail);
    if (!tokens.every(token => text.includes(token))) continue;
    const title = normalize(item.title);
    const score = title === needle ? 0 : title.startsWith(needle) ? 1 :
      text.startsWith(needle) ? 2 : item.kind === 'file' ? 4 : 3;
    rows.push({item, score});
  }
  rows.sort((a,b) => a.score - b.score || a.item.title.localeCompare(b.item.title,'pt-BR'));
  return rows.slice(0,max).map(row => row.item);
}
