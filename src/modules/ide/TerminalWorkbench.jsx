import React, { useEffect, useId, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { NavGlyph } from '../../shared/NavGlyph.jsx';
import { confirmAction } from '../../shared/confirm-action.mjs';
import '@xterm/xterm/css/xterm.css';
import './TerminalWorkbench.css';

const NOOP = () => {};
const ACTIVE = new Set(['starting', 'running', 'closing']);
const LABELS = { starting: 'Iniciando', running: 'Sessão ativa', closing: 'Encerrando',
  closed: 'Encerrado', exited: 'Shell finalizado', failed: 'Falhou' };

export default function TerminalWorkbench({ workspace, visible = true, busy = false, onNotice = NOOP }) {
  const [catalog, setCatalog] = useState(null), [shellId, setShellId] = useState('');
  const [session, setSession] = useState(null), [acting, setActing] = useState(false);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const element = useRef(null), terminal = useRef(null), fitter = useRef(null), resize = useRef(NOOP);
  const current = useRef(null), generation = useRef(0), notice = useRef(onNotice), isVisible = useRef(visible);
  const sendQueue = useRef(Promise.resolve());
  const queuedInputBytes = useRef(0);
  notice.current = onNotice; isVisible.current = visible;
  const fieldId = useId();

  function sendInput(data) {
    const id = current.current?.id, token = generation.current;
    if (!id || current.current.status !== 'running') return;
    const bytes = new TextEncoder().encode(data).length;
    if (queuedInputBytes.current + bytes > 131072) { setError('Entrada muito grande. Cole até 128 KB por vez.'); return; }
    queuedInputBytes.current += bytes;
    // Keep keystrokes/paste ordered, with bounded messages and no shell parsing.
    for (let offset = 0; offset < data.length;) {
      let end = Math.min(offset + 4096, data.length);
      if (end < data.length && /[\uD800-\uDBFF]/.test(data[end - 1])) end--;
      const chunk = data.slice(offset, end); offset = end;
      const chunkBytes = new TextEncoder().encode(chunk).length;
      sendQueue.current = sendQueue.current.then(async () => {
        if (generation.current !== token || current.current?.id !== id || current.current.status !== 'running') return;
        await window.omni.writeTerminal(id, chunk);
      }).catch(err => { if (generation.current === token) setError(err.message); })
        .finally(() => { if (generation.current === token) queuedInputBytes.current -= chunkBytes; });
    }
  }

  useEffect(() => {
    const token = ++generation.current;
    setCatalog(null); setSession(null); setError(''); setActing(false); setLoading(true);
    current.current = null; sendQueue.current = Promise.resolve(); queuedInputBytes.current = 0;
    if (!element.current || !window.omni?.terminalAvailability) {
      setError('O terminal interativo está disponível no aplicativo desktop.'); setLoading(false); return;
    }
    const colors = getComputedStyle(element.current);
    const term = new Terminal({ cols: 80, rows: 24, scrollback: 2000, cursorBlink: false,
      fontFamily: 'Consolas, ui-monospace, monospace', fontSize: 13, lineHeight: 1.15,
      minimumContrastRatio: 4.5, screenReaderMode: false, disableStdin: true,
      windowOptions: {}, linkHandler: { activate: () => {} },
      theme: { background: colors.getPropertyValue('--of-bg').trim() || '#101012',
        foreground: colors.getPropertyValue('--of-ink').trim() || '#e5e3e4',
        cursor: colors.getPropertyValue('--of-accent').trim() || '#c8515e',
        selectionBackground: colors.getPropertyValue('--of-accent-soft').trim() || '#302025' } });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(element.current);
    term.textarea?.setAttribute('aria-label', 'Entrada do terminal');
    term.textarea?.setAttribute('data-testid', 'terminal-input');
    // Explicitly consume clipboard and hyperlink OSC sequences. Nothing from
    // process output may trigger clipboard/native navigation automatically.
    const denyClipboard = term.parser.registerOscHandler(52, () => true);
    const denyLinks = term.parser.registerOscHandler(8, () => true);
    const input = term.onData(sendInput);
    terminal.current = term; fitter.current = fit;
    let attaching = false, attachedId = null, buffered = [], lastSequence = 0;
    const acknowledge = (id, sequence) => {
      if (generation.current !== token) return;
      void window.omni.acknowledgeTerminal(id, sequence).catch(() => {});
    };
    const write = event => {
      if (event.session.id !== attachedId || event.sequence <= lastSequence) return;
      lastSequence = event.sequence;
      term.write(event.chunk, () => acknowledge(event.session.id, event.sequence));
    };
    const showState = next => {
      if (current.current && next && ((current.current.id === next.id && current.current.version > next.version) ||
          (current.current.id !== next.id && current.current.startedAt > next.startedAt))) return false;
      current.current = next; setSession(next);
      term.options.disableStdin = next?.status !== 'running';
      return true;
    };
    const attach = async next => {
      if (!next || next.workspace !== workspace || generation.current !== token) return;
      if (!showState(next)) next = current.current;
      if (attachedId === next.id || attaching) return;
      attaching = true; buffered = [];
      try {
        const snapshot = await window.omni.attachTerminal(next.id);
        if (generation.current !== token || current.current?.id !== next.id) return;
        attachedId = next.id; lastSequence = snapshot.sequence;
        term.reset(); term.options.disableStdin = current.current?.status !== 'running';
        if (snapshot.historyTruncated) term.writeln('\x1b[90m[Saída anterior limitada ao buffer desta sessão.]\x1b[0m');
        term.write(snapshot.output || '', () => acknowledge(snapshot.id, snapshot.sequence));
        for (const event of buffered) write(event);
        resize.current();
        if (isVisible.current && current.current.status === 'running') term.focus();
      } catch (err) { if (generation.current === token) setError(err.message); }
      finally { attaching = false; buffered = []; }
    };
    const dispose = window.omni.onTerminalEvent(event => {
      if (generation.current !== token || event.session?.workspace !== workspace) return;
      if (event.type === 'data') { if (attaching) buffered.push(event); else write(event); return; }
      showState(event.session);
      if (event.type === 'started') {
        void attach(event.session);
        notice.current('Terminal aberto: ' + event.session.shellLabel + '.');
      }
      if (event.type === 'finished') notice.current(event.session.message);
    });
    resize.current = () => {
      if (!isVisible.current || !element.current?.clientWidth || !element.current?.clientHeight) return;
      const proposal = fit.proposeDimensions();
      if (!proposal) return;
      const cols = Math.max(20, Math.min(500, proposal.cols)), rows = Math.max(5, Math.min(200, proposal.rows));
      if (term.cols !== cols || term.rows !== rows) term.resize(cols, rows);
      if (current.current?.status === 'running') {
        void window.omni.resizeTerminal(current.current.id, cols, rows).catch(err => {
          if (generation.current === token) setError(err.message);
        });
      }
    };
    const observer = new ResizeObserver(() => resize.current()); observer.observe(element.current);
    window.omni.terminalAvailability().then(data => {
      if (generation.current !== token) return;
      setCatalog(data); setShellId(data.shells[0]?.id || '');
    }).catch(err => { if (generation.current === token) setError(err.message); })
      .finally(() => { if (generation.current === token) setLoading(false); });
    window.omni.terminalState().then(state => { if (generation.current === token) void attach(state); }).catch(() => {});
    resize.current();
    return () => {
      generation.current++; dispose?.(); observer.disconnect(); input.dispose(); denyClipboard.dispose(); denyLinks.dispose();
      if (attachedId) void window.omni.detachTerminal(attachedId).catch(() => {});
      term.dispose(); terminal.current = null; fitter.current = null; resize.current = NOOP;
    };
  }, [workspace]);

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(() => { resize.current(); if (current.current?.status === 'running') terminal.current?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [visible]);
  useEffect(() => { if (terminal.current) terminal.current.options.screenReaderMode = screenReader; }, [screenReader]);

  async function open() {
    if (acting || busy || !workspace || !shellId || ACTIVE.has(session?.status)) return;
    const token = generation.current; setActing(true); setError('');
    try {
      const result = await window.omni.openTerminal({ shellId, cols: terminal.current?.cols || 80, rows: terminal.current?.rows || 24 });
      if (generation.current !== token) return;
      if (!result) notice.current('Abertura do terminal cancelada.');
    } catch (err) { if (generation.current === token) setError(err.message); }
    finally { if (generation.current === token) setActing(false); }
  }
  async function close() {
    const selected = current.current, token = generation.current;
    if (!selected || !ACTIVE.has(selected.status)) return;
    const accepted = await confirmAction({ title: 'Encerrar terminal',
      message: 'A sessão e seus processos serão encerrados. Alterações já feitas por comandos permanecerão nos arquivos.',
      confirmLabel: 'Encerrar sessão' });
    if (!accepted || generation.current !== token || current.current?.id !== selected.id) return;
    try { await window.omni.closeTerminal(selected.id); }
    catch (err) { if (generation.current === token) setError(err.message); }
  }
  async function copy() {
    const selection = terminal.current?.getSelection();
    if (!selection) { setError('Selecione um trecho da saída para copiar.'); return; }
    const token = generation.current, id = current.current?.id;
    try {
      await window.omni.copyTerminalSelection(id, selection);
      if (generation.current === token) { setError(''); notice.current('Seleção copiada.'); }
    } catch (err) { if (generation.current === token) setError(err.message || 'Não foi possível copiar a seleção.'); }
  }
  const active = ACTIVE.has(session?.status);
  return <section className="terminal-workbench" aria-label="Terminal interativo" data-testid="terminal-workbench">
    <header className="terminal-workbench__heading"><div><span className="eyebrow">DESENVOLVIMENTO</span>
      <h2>Terminal</h2><p>Uma sessão local no projeto. Edite e salve enquanto seus comandos trabalham.</p></div>
      <span className={'terminal-workbench__status terminal-workbench__status--' + (session?.status || 'idle')}
        role="status" data-testid="terminal-status">{LABELS[session?.status] || 'Sem sessão'}</span></header>
    <div className="terminal-workbench__toolbar">
      <label htmlFor={fieldId + '-shell'}>Ambiente</label>
      <select id={fieldId + '-shell'} value={shellId} onChange={event => setShellId(event.target.value)}
        disabled={loading || acting || active} data-testid="terminal-shell">
        {!catalog?.shells.length && <option value="">{loading ? 'Localizando…' : 'Indisponível'}</option>}
        {catalog?.shells.map(shell => <option key={shell.id} value={shell.id}>{shell.label}</option>)}
      </select>
      <button type="button" className="button button--solid" disabled={busy || acting || active || !workspace || !shellId}
        onClick={open} aria-busy={acting} data-testid="terminal-open"><NavGlyph name="terminal" size={15}/>{acting ? 'Aguardando…' : 'Abrir terminal'}</button>
      <button type="button" className="button button--outline" disabled={!active || session?.status === 'closing'}
        onClick={close} data-testid="terminal-close"><NavGlyph name="close" size={15}/> Encerrar</button>
      <span className="terminal-workbench__workspace" title={workspace || ''}>{workspace || 'Abra uma pasta de projeto para iniciar.'}</span>
    </div>
    <div className="terminal-workbench__feedback" aria-live="polite">
      {error ? <p role="alert">{error}</p> : <p>{catalog?.reason || session?.message ||
        'A abertura pede confirmação. Perfis do shell ficam desativados; comandos executam com as permissões da sua conta.'}</p>}
    </div>
    <div className="terminal-workbench__surface" ref={element} data-testid="terminal-surface"/>
    <footer className="terminal-workbench__footer">
      <button type="button" className="button button--outline" onClick={() => sendInput('\x03')}
        disabled={session?.status !== 'running'} data-testid="terminal-interrupt">Interromper comando <kbd>Ctrl+C</kbd></button>
      <button type="button" className="button button--subtle" onClick={() => terminal.current?.clear()} disabled={!session}>Limpar tela</button>
      <button type="button" className="button button--subtle" onClick={copy} disabled={!session}>Copiar seleção</button>
      <label><input type="checkbox" checked={screenReader} onChange={event => setScreenReader(event.target.checked)}/> Leitor de tela</label>
      {session?.exitCode != null && <code>Exit {session.exitCode}</code>}
    </footer>
  </section>;
}
