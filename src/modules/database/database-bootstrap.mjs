/** A catalog failure must never hide a live native draft after renderer reload. */
export function newerDatabaseState(previous, next) {
  return !previous || !next || previous.sessionId !== next.sessionId || next.sequence >= previous.sequence ? next : previous;
}

export function reconcileDatabaseBootstrap(workspace, stateResult, catalogResult, events) {
  let state = stateResult.status === 'fulfilled' && stateResult.value?.workspace === workspace ? stateResult.value : null;
  for (const event of events) {
    if (!event.state || event.state.workspace === workspace) state = newerDatabaseState(state, event.state);
  }
  const errors = [];
  if (stateResult.status === 'rejected') errors.push('Não foi possível ler a sessão SQLite: ' + stateResult.reason?.message);
  if (catalogResult.status === 'rejected') errors.push('Não foi possível listar os bancos: ' + catalogResult.reason?.message);
  return { state, catalog: catalogResult.status === 'fulfilled' && catalogResult.value.workspace === workspace ? catalogResult.value : null,
    error: errors.join(' ') };
}
