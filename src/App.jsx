import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow,
  Background, Controls, MiniMap, Handle, Position,
  addEdge, useNodesState, useEdgesState
} from '@xyflow/react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { NODE_CATALOG, exampleFlow, createNode } from '../core/catalog.mjs';
import { validateFlow } from '../core/graph.mjs';

self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  }
};
loader.config({ monaco });

const ICONS = { 'trigger.manual': '▶', 'logic.pick': '◇', 'io.writeJson': '▣', 'http.localJson': '⇄', 'project.callLocalApi': '⊞' };
const LABELS = { 'trigger.manual': 'GATILHO', 'logic.pick': 'LÓGICA', 'io.writeJson': 'ARQUIVOS', 'http.localJson': 'API LOCAL', 'project.callLocalApi': 'PROJETO' };
const DEFAULT = exampleFlow();
const toUiNodes = flow => flow.nodes.map(node => ({
  id: node.id, type: 'block', position: node.position,
  data: { kind: node.type, config: node.config }
}));
const toFlow = (nodes, edges) => ({
  schemaVersion: 1,
  name: 'Fluxo principal',
  nodes: nodes.map(node => ({ id: node.id, type: node.data.kind, position: node.position, config: node.data.config })),
  edges: edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle }))
});

function BlockNode({ data, selected }) {
  const meta = NODE_CATALOG[data.kind];
  return (
    <div className={`graph-node ${selected ? 'graph-node--selected' : ''}`}>
      {meta.inputs.length > 0 && <Handle type="target" position={Position.Left} id="in" className="node-handle" />}
      <div className="graph-node__overline"><span>{ICONS[data.kind]}</span>{LABELS[data.kind]}</div>
      <div className="graph-node__title">{meta.label}</div>
      <div className="graph-node__details">{data.kind === 'trigger.manual' ? 'Entrada JSON' : data.kind === 'logic.pick' ? (data.config.path || 'Selecionar campo') : data.kind === 'http.localJson' ? (data.config.url || 'API local') : data.kind === 'project.callLocalApi' ? (data.config.capabilityId || 'Selecione uma capacidade') : (data.config.fileName || 'Arquivo')}</div>
      {meta.outputs.length > 0 && <Handle type="source" position={Position.Right} id="out" className="node-handle" />}
    </div>
  );
}
const NODE_TYPES = { block: BlockNode };
const EXT_TO_LANGUAGE = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', java: 'java', go: 'go', rs: 'rust', c: 'c', cpp: 'cpp', h: 'cpp', cs: 'csharp',
  json: 'json', html: 'html', css: 'css', scss: 'scss', sh: 'shell', ps1: 'powershell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', md: 'markdown', xml: 'xml', php: 'php', rb: 'ruby'
};

function getLanguage(filename) {
  return EXT_TO_LANGUAGE[filename?.split('.').pop()?.toLowerCase()] || 'plaintext';
}

export default function App() {
  const [mode, setMode] = useState('canvas');
  const [sideMode, setSideMode] = useState('catalog');
  const [workspace, setWorkspace] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [nodes, setNodes, onNodesChange] = useNodesState(toUiNodes(DEFAULT));
  const [edges, setEdges, onEdgesChange] = useEdgesState(DEFAULT.edges);
  const [selectedId, setSelectedId] = useState('inicio');
  const [validation, setValidation] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [status, setStatus] = useState('Selecione uma pasta para começar.');
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [fileRevision, setFileRevision] = useState('');
  const [flowRevision, setFlowRevision] = useState(null);
  const [flowDirty, setFlowDirty] = useState(false);
  const [info, setInfo] = useState({ version: '0.1.5', mode: '...' });
  const [connectorProjectId, setConnectorProjectId] = useState('');
  const [newCapability, setNewCapability] = useState({ id: 'registrar-venda', label: 'Registrar venda', method: 'POST', url: 'http://127.0.0.1:8000/api/vendas', timeoutMs: '3000', inputSchema: '{"type":"object"}', outputSchema: '{"type":"object"}' });
  const selected = nodes.find(node => node.id === selectedId);
  const graph = useMemo(() => toFlow(nodes, edges), [nodes, edges]);
  // React Flow emits change notifications after dragging, moving or deleting nodes.
  // Mark only user changes as dirty, not the initial graph or a loaded workspace.
  const handleNodesChange = useCallback(changes => {
    if (changes.some(change => change.type !== 'select' && change.type !== 'dimensions')) setFlowDirty(true);
    onNodesChange(changes);
  }, [onNodesChange]);
  const handleEdgesChange = useCallback(changes => {
    if (changes.some(change => change.type !== 'select')) setFlowDirty(true);
    onEdgesChange(changes);
  }, [onEdgesChange]);
  useEffect(() => {
    const blockClose = (event) => {
      if (dirty || flowDirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', blockClose);
    return () => window.removeEventListener('beforeunload', blockClose);
  }, [dirty, flowDirty]);

  useEffect(() => {
    if (!window.omni) { setStatus('Abra esta interface pelo Electron: npm run dev.'); return; }
    window.omni.info().then(setInfo).catch(e => setStatus(e.message));
    window.omni.listProjects().then(setProjects).catch(e => setStatus(`Catálogo indisponível: ${e.message}`));
  }, []);

  const notify = useCallback(message => setStatus(message), []);
  const execute = useCallback(async (action) => {
    if (!window.omni) return notify('Integração desktop indisponível.');
    setBusy(true);
    try { await action(); }
    catch (err) { notify(`Erro: ${err.message}`); }
    finally { setBusy(false); }
  }, [notify]);

  const applyProject = async result => {
    setWorkspace(result.workspace);
    setActiveProjectId(result.projectId);
    setFiles(result.files);
    setNodes(toUiNodes(result.flow));
    setEdges(result.flow.edges);
    setFlowRevision(result.flowRevision);
    setFlowDirty(result.flowRevision === null);
    setSelectedId(result.flow.nodes[0]?.id || null);
    setFileName(''); setFileContent(''); setFileRevision(''); setDirty(false);
    setLastRun(null); setValidation(null);
    setHistory(await window.omni.listRunHistory());
    setSelectedHistory(null);
    setProjects(await window.omni.listProjects());
    setMode('canvas');
    notify(`Projeto aberto: ${result.workspace}`);
  };

  const confirmProjectSwitch = () => !(dirty || flowDirty) ||
    window.confirm('Existem alterações não salvas. Deseja trocar de projeto e descartá-las?');

  const openWorkspace = () => execute(async () => {
    if (!confirmProjectSwitch()) return;
    const result = await window.omni.selectWorkspace();
    if (result) await applyProject(result);
  });

  const registerProject = () => execute(async () => {
    const registered = await window.omni.registerProject();
    if (!registered) return;
    setProjects(await window.omni.listProjects());
    notify(registered.alreadyRegistered ? 'Este projeto já está cadastrado.' : `Projeto cadastrado: ${registered.label}`);
  });

  const openProjectById = id => execute(async () => {
    if (!confirmProjectSwitch()) return;
    await applyProject(await window.omni.openProject(id));
  });

  const forgetProjectById = id => execute(async () => {
    if (id === activeProjectId) throw new Error('Abra outro projeto antes de remover o projeto ativo do catálogo.');
    if (!window.confirm('Esquecer este projeto apenas no catálogo? A pasta e os arquivos permanecerão intactos.')) return;
    await window.omni.forgetProject(id);
    setProjects(await window.omni.listProjects());
    notify('Projeto removido apenas do catálogo. Os arquivos originais foram preservados.');
  });


  const addCapability = () => execute(async () => {
    if (!connectorProjectId) throw new Error('Selecione o projeto que disponibiliza a API.');
    let inputSchema, outputSchema;
    try { inputSchema = JSON.parse(newCapability.inputSchema); outputSchema = JSON.parse(newCapability.outputSchema); }
    catch { throw new Error('Schemas de entrada e saída devem ser JSON válido.'); }
    await window.omni.registerCapability(connectorProjectId, { ...newCapability, inputSchema, outputSchema });
    setProjects(await window.omni.listProjects());
    notify('Capacidade local registrada. Agora adicione o bloco “Chamar projeto por API” e configure suas portas.');
  });

  const forgetCapability = (projectId, id) => execute(async () => {
    if (!window.confirm('Remover esta capacidade do catálogo? Fluxos que dependem dela deixarão de validar até sua configuração ser corrigida.')) return;
    await window.omni.forgetCapability(projectId, id);
    setProjects(await window.omni.listProjects());
    notify('Capacidade removida do catálogo; projetos e arquivos intactos.');
  });

  const addNode = (type) => {
    const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const next = createNode(type, id, { x: 160 + nodes.length * 60, y: 110 + nodes.length * 50 });
    setNodes(previous => [...previous, toUiNodes({ nodes: [next] })[0]]);
    setFlowDirty(true);
    setSelectedId(id);
    setMode('canvas');
    notify('Bloco adicionado. Conecte as portas antes de executar.');
  };

  const onConnect = useCallback(connection => {
    if (connection.source === connection.target) return notify('Não é permitido conectar um bloco a ele mesmo.');
    setEdges(old => addEdge({ ...connection, id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }, old));
    setValidation(null);
    setFlowDirty(true);
  }, [setEdges, notify]);

  const changeConfig = (key, value) => {
    setNodes(all => all.map(node => node.id === selectedId
      ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value, ...(key === 'projectId' ? { capabilityId: '' } : {}) } } }
      : node));
    setValidation(null);
    setFlowDirty(true);
  };

  const validate = () => execute(async () => {
    const checked = await window.omni.validateFlow(graph);
    setValidation(checked);
    setMode('canvas');
    notify(checked.valid ? 'Validação concluída: estrutura e capacidades aprovadas.' : `Validação identificou ${checked.errors.length} problema(s).`);
  });

  const save = () => execute(async () => {
    if (!workspace) throw new Error('Abra uma pasta para salvar o fluxo.');
    const result = await window.omni.saveFlow(graph, flowRevision);
    setFlowRevision(result.revision);
    setFlowDirty(false);
    notify(`Fluxo gravado em ${result.path}`);
  });

  const run = dryRun => execute(async () => {
    if (!workspace) throw new Error('Abra uma pasta antes de executar.');
    const result = await window.omni.executeFlow(graph, dryRun);
    setLastRun(result);
    if (result.history?.saved) setHistory(await window.omni.listRunHistory());
    const checked = await window.omni.validateFlow(graph);
    setValidation(checked);
    if (result.history && !result.history.saved) notify('Histórico indisponível: a execução foi concluída, mas não foi registrada.');
    else notify(result.ok
      ? (result.partialSimulation ? 'Simulação parcial: nenhum HTTP foi enviado nem respostas inventadas.' : dryRun ? 'Simulação concluída: nenhuma escrita realizada.' : 'Execução real concluída.')
      : `Execução bloqueada: ${result.error || result.errors?.[0] || 'falha de validação'}`);
  });

  const openHistory = () => execute(async () => {
    if (!workspace) throw new Error('Abra um projeto para visualizar o histórico.');
    setHistory(await window.omni.listRunHistory());
    setSelectedHistory(null);
    setMode('history');
    notify('Histórico de execuções carregado.');
  });

  const showHistory = id => execute(async () => {
    setSelectedHistory(await window.omni.readRunHistory(id));
  });

  const openFile = relative => execute(async () => {
    if (dirty && !window.confirm('Descartar alterações não salvas do arquivo atual?')) return;
    const loaded = await window.omni.readFile(relative);
    setFileName(relative); setFileContent(loaded.content); setFileRevision(loaded.revision); setDirty(false);
    setMode('code'); notify(`Arquivo aberto: ${relative}`);
  });

  const saveFile = () => execute(async () => {
    if (!workspace || !fileName) throw new Error('Selecione um arquivo do projeto.');
    const saved = await window.omni.saveFile(fileName, fileContent, fileRevision);
    setFileRevision(saved.revision); setDirty(false);
    notify(`Arquivo atualizado: ${fileName}`);
  });

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-logo">O<span>F</span></div>
        <div className="brand-name">OMNIFORGE <span>STUDIO</span><small>V{info.version}</small></div>
        <div className="topbar-separator" />
        <div className="workspace-pill" title={workspace}>{workspace ? workspace.split(/[\\/]/).pop() : 'Nenhum projeto aberto'}{flowDirty ? ' •' : ''}</div>
        <div className="topbar-spacer" />
        <span className="environment">{info.mode}</span>
        <button disabled={busy} onClick={openWorkspace} className="button button--outline">Abrir projeto</button>
        <button disabled={busy || !workspace || !flowDirty} onClick={save} className="button button--solid">Salvar fluxo</button>
      </header>

      <div className="workspace-layout">
        <nav className="rail" aria-label="Ferramentas">
          <button title="Arquitetura visual" className={mode === 'canvas' ? 'rail-active' : ''} onClick={() => setMode('canvas')}>⌘</button>
          <button title="Catálogo de projetos" aria-label="Catálogo de projetos" className={mode === 'projects' ? 'rail-active' : ''} onClick={() => setMode('projects')}>▤</button>
          <button title="Conectores de projetos" aria-label="Conectores de projetos" className={mode === 'integrations' ? 'rail-active' : ''} onClick={() => setMode('integrations')}>⇄</button>
          <button title="Editor de código" className={mode === 'code' ? 'rail-active' : ''} onClick={() => {setMode('code'); setSideMode('files');}}>◧</button>
          <button title="Histórico de execuções" aria-label="Histórico de execuções" disabled={!workspace || busy} className={mode === 'history' ? 'rail-active' : ''} onClick={openHistory}>◷</button>
          <button title="Sobre o projeto" className={mode === 'about' ? 'rail-active' : ''} onClick={() => setMode('about')}>ⓘ</button>
        </nav>

        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button className={sideMode === 'catalog' ? 'active' : ''} onClick={() => setSideMode('catalog')}>BLOCOS</button>
            <button className={sideMode === 'files' ? 'active' : ''} onClick={() => setSideMode('files')}>ARQUIVOS</button>
          </div>
          {sideMode === 'catalog' ? (
            <div className="sidebar-content">
              <div className="section-label">CATÁLOGO / V0.1.5</div>
              <p className="sidebar-description">Blocos reais com validação. APIs limitadas ao próprio computador e somente com autorização.</p>
              {Object.entries(NODE_CATALOG).map(([type, node]) => (
                <button key={type} className="catalog-item" onClick={() => addNode(type)}>
                  <span className="catalog-icon">{ICONS[type]}</span>
                  <span><strong>{node.label}</strong><small>{node.category}</small></span>
                  <span className="catalog-plus">+</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="sidebar-content">
              <div className="section-label">EXPLORADOR DE PROJETO</div>
              {workspace ? (
                <>
                  <div className="folder-title">▾ {workspace.split(/[\\/]/).pop()}</div>
                  <div className="file-list">
                    {files.map(entry => (
                      <button key={entry.path} disabled={entry.kind === 'directory'} onClick={() => openFile(entry.path)}
                        className={`file-entry ${entry.path === fileName ? 'file-entry--selected' : ''}`}
                        style={{ paddingLeft: 10 + entry.depth * 14 }}>
                        <span>{entry.kind === 'directory' ? '▸' : '▤'}</span>
                        <span>{entry.path.split('/').pop()}</span>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => execute(async () => { setFiles(await window.omni.listFiles()); notify('Explorador atualizado.'); })}
                    className="subtle-action">↻ Atualizar arquivos</button>
                </>
              ) : <div className="empty-small">Abra uma pasta para visualizar seus arquivos.</div>}
            </div>
          )}
          <div className="sidebar-footer"><span className="indicator-dot"/> Ambiente local • Desktop</div>
        </aside>

        <main className="main-panel">
          {mode === 'canvas' && (
            <>
              <div className="main-toolbar">
                <div className="toolbar-heading"><span className="eyebrow">WORKSPACE / AUTOMAÇÕES</span><strong>Editor visual</strong></div>
                <div className="toolbar-actions">
                  <button className="button button--subtle" onClick={validate}>Validar</button>
                  <button className="button button--subtle" disabled={busy || !workspace} onClick={() => run(true)}>Simular</button>
                  <button className="button button--run" disabled={busy || !workspace} onClick={() => run(false)}>▶ Executar</button>
                </div>
              </div>
              <div className="canvas-wrap">
                <ReactFlow
                  nodes={nodes} edges={edges} nodeTypes={NODE_TYPES}
                  onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
                  onConnect={onConnect} onNodeClick={(_event, node) => setSelectedId(node.id)}
                  onPaneClick={() => setSelectedId(null)}
                  fitView fitViewOptions={{ padding: 0.24 }}
                  proOptions={{ hideAttribution: false }}
                  colorMode="dark" nodesConnectable elementsSelectable
                >
                  <Background color="#253347" gap={24} size={1}/>
                  <Controls position="bottom-left" showInteractive={false}/>
                  <MiniMap pannable zoomable nodeColor="#327db1" maskColor="rgba(7,14,24,0.72)" position="bottom-right"/>
                </ReactFlow>
                <div className="canvas-chip">GRAFO / V1 · VALIDAÇÃO ANTES DA EXECUÇÃO</div>
              </div>
            </>
          )}
          {mode === 'code' && (
            <>
              <div className="main-toolbar">
                <div className="toolbar-heading"><span className="eyebrow">EDITOR / ARQUIVOS LOCAIS</span><strong>{fileName || 'Nenhum arquivo selecionado'} {dirty ? '•' : ''}</strong></div>
                <div className="toolbar-actions"><button className="button button--solid" disabled={busy || !fileName || !dirty} onClick={saveFile}>Salvar arquivo</button></div>
              </div>
              {fileName ? (
                <div className="editor-wrap"><Editor theme="vs-dark" language={getLanguage(fileName)} value={fileContent}
                  onChange={v => {setFileContent(v ?? ''); setDirty(true);}}
                  options={{ automaticLayout: true, fontSize: 14, minimap: { enabled: true }, scrollBeyondLastLine: false, wordWrap: 'on' }} /></div>
              ) : <div className="empty-main"><div>◧</div><h2>Editor de código</h2><p>Abra uma pasta e selecione um arquivo no explorador.</p></div>}
            </>
          )}
          {mode === 'projects' && (
            <>
              <div className="main-toolbar">
                <div className="toolbar-heading"><span className="eyebrow">CENTRAL DE WORKSPACES / LOCAL</span><strong>Meus projetos ({projects.length})</strong></div>
                <div className="toolbar-actions">
                  <button className="button button--subtle" disabled={busy} onClick={() => execute(async () => { setProjects(await window.omni.listProjects()); notify('Catálogo atualizado.'); })}>↻ Atualizar</button>
                  <button className="button button--solid" disabled={busy || !window.omni} onClick={registerProject}>+ Adicionar projeto</button>
                </div>
              </div>
              <section className="projects-page">
                <p className="projects-intro">Adicione pastas existentes sem copiar ou alterar seus arquivos. Fluxos e históricos permanecem dentro de cada projeto; a lista é guardada separadamente nos dados locais do OmniForge.</p>
                {!projects.length && <div className="projects-empty">Nenhum projeto cadastrado. Use “Adicionar projeto” para começar.</div>}
                <div className="project-cards">
                  {projects.map(project => (
                    <article className="project-card" key={project.id}>
                      <div className="project-card__heading"><strong>{project.label}</strong><span className={project.available ? 'project-available' : 'project-offline'}>{project.available ? 'DISPONÍVEL' : 'OFFLINE'}</span></div>
                      <small>{project.kind}</small><div className="project-card__path" title={project.path}>{project.path}</div>
                      <div className="project-card__footer"><span>{project.id === activeProjectId ? '● Projeto ativo' : project.lastOpenedAt ? 'Aberto anteriormente' : 'Ainda não aberto'}</span><div>
                        <button disabled={busy || !project.available} className="button button--subtle" onClick={() => openProjectById(project.id)}>Abrir</button>
                        <button disabled={busy || project.id === activeProjectId} className="button button--outline" onClick={() => forgetProjectById(project.id)}>Esquecer</button>
                      </div></div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
          {mode === 'integrations' && (
            <>
              <div className="main-toolbar">
                <div className="toolbar-heading"><span className="eyebrow">CONTRATOS / API LOCAL</span><strong>Conectar projetos por blocos</strong></div>
                <div className="toolbar-actions"><button disabled={busy} className="button button--subtle" onClick={() => execute(async () => setProjects(await window.omni.listProjects()))}>↻ Atualizar</button></div>
              </div>
              <section className="integrations-page">
                <p className="projects-intro">Cadastre a API HTTP local de um projeto. O OmniForge NÃO executa scripts, instala dependências nem inicia servidores. O projeto precisa expor uma API real em 127.0.0.1. A cada execução haverá autorização e verificação de entrada/saída.</p>
                <div className="integrations-layout">
                  <form className="capability-form" onSubmit={event => { event.preventDefault(); addCapability(); }}>
                    <h3>Adicionar capacidade</h3>
                    <label>Projeto que oferece a API
                      <select required value={connectorProjectId} onChange={event => setConnectorProjectId(event.target.value)}>
                        <option value="">Selecione o projeto</option>
                        {projects.filter(p => p.available).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </label>
                    {[
                      ['id','Identificador único'], ['label','Nome da capacidade'], ['url','URL HTTP local'], ['timeoutMs','Timeout (ms)']
                    ].map(([key,label]) => <label key={key}>{label}<input required value={newCapability[key]} onChange={e => setNewCapability(old => ({ ...old, [key]: e.target.value }))}/></label>)}
                    <label>Método<select value={newCapability.method} onChange={e => setNewCapability(old => ({ ...old, method: e.target.value }))}><option>POST</option><option>GET</option></select></label>
                    <label>Schema de entrada (JSON, subconjunto tipado)<textarea rows={4} spellCheck={false} value={newCapability.inputSchema} onChange={e => setNewCapability(old => ({ ...old, inputSchema: e.target.value }))}/></label>
                    <label>Schema de saída (JSON, subconjunto tipado)<textarea rows={4} spellCheck={false} value={newCapability.outputSchema} onChange={e => setNewCapability(old => ({ ...old, outputSchema: e.target.value }))}/></label>
                    <button type="submit" disabled={busy || !connectorProjectId} className="button button--solid">Registrar API local</button>
                  </form>
                  <section className="capabilities-list">
                    <h3>Capacidades cadastradas</h3>
                    {!projects.some(p => p.capabilities?.length) && <p className="projects-intro">Ainda não há capacidades. Cadastre uma API para disponibilizá-la no bloco “Chamar projeto por API”.</p>}
                    {projects.flatMap(p => (p.capabilities || []).map(c => ({ ...c, projectId: p.id, projectName: p.label, available: p.available }))).map(c => (
                      <article className="capability-card" key={`${c.projectId}-${c.id}`}>
                        <strong>{c.label}</strong><small>{c.projectName} · {c.id}</small>
                        <code>{c.method} {c.url}</code>
                        <div><span className={c.available ? 'project-available' : 'project-offline'}>{c.available ? 'ATIVA NO CATÁLOGO' : 'PROJETO OFFLINE'}</span>
                          <button disabled={busy} onClick={() => forgetCapability(c.projectId, c.id)} className="button button--outline">Remover</button></div>
                      </article>
                    ))}
                  </section>
                </div>
              </section>
            </>
          )}
          {mode === 'history' && (
            <>
              <div className="main-toolbar">
                <div className="toolbar-heading"><span className="eyebrow">OBSERVABILIDADE / WORKSPACE</span><strong>Histórico de execuções</strong></div>
                <div className="toolbar-actions"><button disabled={busy} className="button button--subtle" onClick={openHistory}>↻ Atualizar histórico</button></div>
              </div>
              <div className="history-layout">
                <div className="history-list">
                  {!history.length && <p className="history-empty">Nenhuma execução registrada neste projeto.</p>}
                  {history.map(item => (
                    <button key={item.id} type="button" disabled={busy} onClick={() => showHistory(item.id)} className={`history-item ${selectedHistory?.id === item.id ? 'history-item--selected' : ''}`}>
                      <strong className={item.ok ? 'log-success' : 'log-error'}>{item.ok ? (item.partialSimulation ? 'SIMULAÇÃO PARCIAL' : 'PASS') : 'FAIL'}</strong>
                      <small>{item.dryRun ? 'Simulação' : 'Execução real'} · {item.stepCount} etapas</small>
                      <time>{new Date(item.timestamp).toLocaleString('pt-BR')}</time>
                    </button>
                  ))}
                </div>
                <div className="history-detail">
                  {selectedHistory ? <>
                    <span className="eyebrow">REGISTRO SALVO / {selectedHistory.runId || 'VALIDAÇÃO'}</span>
                    <h2>{selectedHistory.ok ? 'Execução concluída' : 'Execução com falha'}</h2>
                    <p>{new Date(selectedHistory.timestamp).toLocaleString('pt-BR')} · {selectedHistory.dryRun ? 'Simulação' : 'Real'} · {selectedHistory.stage}</p>
                    {selectedHistory.partialSimulation && <p className="history-notice">Simulação parcial: serviços HTTP não foram chamados e etapas dependentes não foram executadas.</p>}
                    {selectedHistory.error && <p className="log-error">{selectedHistory.error}</p>}
                    {selectedHistory.errors.map((message, index) => <p key={index} className="log-error">{message}</p>)}
                    {selectedHistory.steps.map((step, index) => <div key={`${step.nodeId}-${index}`} className="history-step">
                      <span className={step.status === 'PASS' ? 'log-success' : step.status === 'SKIP' ? 'log-muted' : 'log-error'}>{step.status}</span>
                      <strong>{step.nodeId}</strong><small>{step.type} · {step.elapsedMs} ms</small>
                      {step.message && <p>{step.message}</p>}
                    </div>)}
                    <p className="history-notice">Este histórico armazena metadados, não os dados de entrada ou as respostas das APIs.</p>
                  </> : <div className="history-empty">Selecione uma execução na lista para examinar as etapas e seus resultados.</div>}
                </div>
              </div>
            </>
          )}
          {mode === 'about' && (
            <div className="about-page">
              <div className="about-mark">OF</div><span className="eyebrow">PLATAFORMA DE ENGENHARIA</span>
              <h1>OmniForge Studio</h1><p>Ambiente local para programação, construção de fluxos e engenharia visual.</p>
              <div className="about-grid"><div><small>VERSÃO</small><strong>{info.version}</strong></div><div><small>EXECUÇÃO</small><strong>LOCAL</strong></div><div><small>DESENVOLVEDOR</small><strong>Davi Brand</strong></div></div>
              <button className="button button--outline" disabled={!window.omni} onClick={() => window.omni.openDeveloper()}>GitHub do desenvolvedor</button>
              <div className="about-note">Este é o primeiro marco funcional. Compatibilidade ampla com extensões, integrações industriais e CAD paramétrico pertencem às etapas futuras, não estão ativos nesta versão.</div>
            </div>
          )}
        </main>

        <aside className="inspector">
          <div className="inspector-heading">INSPECTOR <span>{mode === 'canvas' ? 'NÓ' : 'PROJETO'}</span></div>
          {mode === 'canvas' && selected ? (
            <div className="inspector-section">
              <span className="eyebrow">CONFIGURAÇÃO DO BLOCO</span>
              <h3>{NODE_CATALOG[selected.data.kind].label}</h3>
              <p>{NODE_CATALOG[selected.data.kind].description}</p>
              <div className="inspector-separator" />
              {NODE_CATALOG[selected.data.kind].fields.map(field => (
                <label key={field.key} className="setting-field">
                  <span>{field.label}</span>
                  {field.kind === 'project' ? (
                    <select value={selected.data.config.projectId || ''} onChange={event => changeConfig('projectId', event.target.value)}>
                      <option value="">Selecione um projeto</option>
                      {projects.filter(p => p.available).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  ) : field.kind === 'capability' ? (
                    <select value={selected.data.config.capabilityId || ''} onChange={event => changeConfig('capabilityId', event.target.value)}>
                      <option value="">Selecione uma capacidade</option>
                      {(projects.find(p => p.id === selected.data.config.projectId)?.capabilities || []).map(c => <option key={c.id} value={c.id}>{c.label} ({c.id})</option>)}
                    </select>
                  ) : field.kind === 'select' ? (
                    <select value={selected.data.config[field.key] || field.default} onChange={event => changeConfig(field.key, event.target.value)}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select>
                  ) : field.kind === 'json' ? (
                    <textarea rows={8} spellCheck={false} value={selected.data.config[field.key] || ''} onChange={event => changeConfig(field.key, event.target.value)} />
                  ) : (
                    <input value={selected.data.config[field.key] || ''} onChange={event => changeConfig(field.key, event.target.value)}/>
                  )}
                </label>
              ))}
              <div className="inspector-tip">{flowDirty ? "Fluxo modificado: salve para persistir. A execução usa os nós atuais da tela." : "Fluxo sincronizado com o projeto."}</div>
            </div>
          ) : <div className="inspector-section"><p>Selecione um bloco para editar as configurações. As informações de validação e execução aparecem abaixo.</p></div>}
          <div className="inspector-heading inspector-heading--border">DIAGNÓSTICO <span>{validation?.valid === true ? 'PASS' : validation ? 'FAIL' : '—'}</span></div>
          <div className="diagnostic-log">
            {!validation && !lastRun && <div className="log-muted">Valide, simule ou execute o fluxo para ver os resultados.</div>}
            {validation && <>
              <div className={validation.valid ? 'log-success' : 'log-error'}>{validation.valid ? '✓ Estrutura válida' : `× ${validation.errors.length} erro(s)`}</div>
              {validation.errors.map((message, i) => <div key={i} className="log-line log-error">{message}</div>)}
              {validation.warnings.map((message, i) => <div key={`w${i}`} className="log-line log-muted">{message}</div>)}
            </>}
            {lastRun && <>
              <div className="run-divider">{lastRun.dryRun ? 'SIMULAÇÃO' : 'EXECUÇÃO REAL'} · {lastRun.ok ? 'PASS' : 'FAIL'}</div>
              {(lastRun.steps || []).map(step => <div key={step.nodeId} className="log-line"><span className={step.status === 'PASS' ? 'log-success' : step.status === 'SKIP' ? 'log-muted' : 'log-error'}>{step.status}</span> {step.nodeId} <span className="log-muted">{step.elapsedMs}ms</span>{step.message && <div className="log-error">{step.message}</div>}</div>)}
              {(lastRun.artifacts || []).map((item, index) => <div key={index} className="log-line log-muted">{item.simulated ? 'Seria gravado' : 'Gravado'}: {item.relativePath}</div>)}
              {lastRun.error && <div className="log-line log-error">{lastRun.error}</div>}
            </>}
          </div>
        </aside>
      </div>
      <footer className="statusbar"><span className="statusbar-left"><span className="indicator-dot" /> {status}</span><span>OmniForge Core 0.1.5 · Workspace local</span></footer>
    </div>
  );
}
