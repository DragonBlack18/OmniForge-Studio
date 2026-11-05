import { getLanguage } from './editor-language.mjs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFlowRecovery } from '../modules/automation/useFlowRecovery.mjs';
const FlowRecoveryNotice = React.lazy(() => import('../modules/automation/FlowRecoveryNotice.jsx'));
import { useFlowSession, toUiNodes } from '../modules/automation/useFlowSession.mjs';
import {checkFlowConnection,arrangeFlowNodes} from '../../core/modules/automation/connections.mjs';
import FlowInspector,{FlowEditTools} from '../modules/automation/FlowInspector.jsx';
import { NODE_CATALOG, exampleFlow, createNode } from '../../core/catalog.mjs';
import { validateFlow } from '../../core/graph.mjs';
import { WORKFLOW_TEMPLATES } from '../../core/templates.mjs';
const FlowCanvas = React.lazy(() => import('../modules/automation/FlowCanvas.jsx'));
const CodeEditor = React.lazy(() => import('../modules/ide/CodeEditor.jsx'));
const CadWorkbench = React.lazy(() => import('../modules/cad/CadWorkbench.jsx'));
import WorkspaceOverview from './WorkspaceOverview.jsx';
const ExtensionsHub = React.lazy(() => import('../modules/extensions/ExtensionsHub.jsx'));
const ScheduleCenter = React.lazy(() => import('../modules/automation/ScheduleCenter.jsx'));
const GitSourceControl = React.lazy(() => import('../modules/ide/GitSourceControl.jsx'));
const ProjectTasks = React.lazy(() => import('../modules/ide/ProjectTasks.jsx'));
const WorkspaceSearch = React.lazy(() => import('../modules/ide/WorkspaceSearch.jsx'));
import NavigationSidebar from './NavigationSidebar.jsx';
const CommandPalette = React.lazy(() => import('./CommandPalette.jsx'));
const RuntimeDiagnostics = React.lazy(() => import('./diagnostics/RuntimeDiagnostics.jsx'));
import { buildWorkbenchCommands } from './command-registry.mjs';
import ModuleErrorBoundary from './ModuleErrorBoundary.jsx';
import { NavGlyph } from '../shared/NavGlyph.jsx';
import { findWorkbenchModule } from './module-registry.mjs';
import { visibleFileEntries } from '../utils/file-tree.mjs';
import { createOperationGate } from '../utils/operation-gate.mjs';
import { useEditorRecovery } from '../modules/ide/useEditorRecovery.mjs';
import { editorOptionsForSize } from '../modules/ide/editor-performance.mjs';



const CATEGORY_NAV_ICONS = {Gatilhos:'workflow',Lógica:'workflow',Dados:'code',Texto:'code',
  Matemática:'code',Codificação:'code',Datas:'history',Arquivos:'folder',
  Integrações:'plug',Projetos:'folder',Engenharia:'cad'};
const DEFAULT = exampleFlow();
const ModuleLoading = ({label='ferramenta'}) => <div className="module-loading" role="status">Carregando {label}...</div>;

function readUiPreference(key, fallback) {
  try { const saved=window.localStorage.getItem(key);return saved===null?fallback:saved==='1'; }
  catch { return fallback; }
}
export default function AppShell() {
  const [mode, setMode] = useState('home');
  const currentModule = findWorkbenchModule(mode);
  const [cadEverOpened,setCadEverOpened] = useState(false);
  const [sideMode, setSideMode] = useState('catalog');
  useEffect(() => { if(mode==='cad') setCadEverOpened(true); }, [mode]);
  const [navigationCollapsed, setNavigationCollapsed] = useState(()=>readUiPreference('of.navCollapsed',false));
  const [paletteScope,setPaletteScope] = useState(null);
  const [diagnosticsOpen,setDiagnosticsOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(()=>readUiPreference('of.utilityOpen',true));
  const [inspectorOpen, setInspectorOpen] = useState(()=>readUiPreference('of.inspectorOpen',true));
  const [fileQuery, setFileQuery] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState(()=>new Set());
  const catalogSearchRef=useRef(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('Todas');
  const [workspace, setWorkspace] = useState('');
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [extensions, setExtensions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [files, setFiles] = useState([]);
  const flowSession = useFlowSession(DEFAULT);
  const {
    nodes, setNodes, edges, setEdges, graph, selectedId, setSelectedId,
    flowRevision, flowDirty, recoveryEligible, handleNodesChange, handleEdgesChange,
    captureSaveToken, markSaved, replaceDocument, canUndo, canRedo, undo, redo,
    deleteSelected, deleteElements, duplicateSelected, rename, editEpoch, applyTemplate: applyFlowTemplate
  } = flowSession;
  const [validation, setValidation] = useState(null);
  const [flowTab,setFlowTab]=useState(null);
  const [flowFocus,setFlowFocus]=useState(null);
  useEffect(()=>{setValidation(null);setLastRun(null);},[editEpoch,workspace]);
  const [lastRun, setLastRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [status, setStatus] = useState('Selecione uma pasta para começar.');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]);
  const [fileName, setFileName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [cadDirty, setCadDirty] = useState(false);
  const [fileRevision, setFileRevision] = useState('');
  const fileContentRef = useRef('');
  const recovery = useEditorRecovery({ workspace, fileName, fileContent, fileRevision, dirty });
  const [createKind, setCreateKind] = useState(null);
  const [createPath, setCreatePath] = useState('');
  const [editorJump, setEditorJump] = useState(null);
  const [editorPosition, setEditorPosition] = useState({line:1,column:1});
  const [info, setInfo] = useState({ version: '0.7.0', mode: '...' });
  const [connectorProjectId, setConnectorProjectId] = useState('');
  const [newCapability, setNewCapability] = useState({ id: 'registrar-venda', label: 'Registrar venda', method: 'POST', url: 'http://127.0.0.1:8000/api/vendas', timeoutMs: '3000', inputSchema: '{"type":"object"}', outputSchema: '{"type":"object"}' });
  const selected = nodes.find(node => node.id === selectedId);
  const catalogCategories = useMemo(() => ['Todas',...new Set(Object.values(NODE_CATALOG).map(meta=>meta.category))], []);
  const catalogGroups = useMemo(() => {
    const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    const query=normalize(catalogQuery.trim());
    const items=Object.entries(NODE_CATALOG).filter(([type,meta]) =>
      (catalogCategory === 'Todas' || meta.category === catalogCategory) &&
      (!query || normalize(`${meta.label} ${meta.description} ${meta.category} ${type}`).includes(query)));
    return Object.groupBy(items, ([,meta])=>meta.category);
  }, [catalogQuery, catalogCategory]);
  const visibleCatalogCount = Object.values(catalogGroups).reduce((sum, items)=>sum+items.length,0);
  const visibleFiles=useMemo(()=>visibleFileEntries(files,{query:fileQuery,collapsedPaths:collapsedFolders}),[files,fileQuery,collapsedFolders]);
  const workbenchCommands=useMemo(()=>buildWorkbenchCommands(files,workspace),[files,workspace]);
  useEffect(()=>{
    try {
      window.localStorage.setItem('of.navCollapsed',navigationCollapsed?'1':'0');
      window.localStorage.setItem('of.utilityOpen',utilityOpen?'1':'0');
      window.localStorage.setItem('of.inspectorOpen',inspectorOpen?'1':'0');
    } catch { /* renderer storage may be unavailable */ }
  },[navigationCollapsed,utilityOpen,inspectorOpen]);

  // The native Electron close handler owns the prompt. Never prevent beforeunload
  // from a renderer: Electron can silently cancel every attempt to close.
  useEffect(() => {
    if (!window.omni?.setUnsavedChanges) return;
    window.omni.setUnsavedChanges(Boolean(dirty || flowDirty || cadDirty)).catch(() => {});
  }, [dirty, flowDirty, cadDirty]);

  useEffect(() => {
    if (!window.omni?.onFlowProgress) return;
    return window.omni.onFlowProgress(step => setLiveSteps(old => [...old.slice(-79), step]));
  }, []);

  useEffect(() => {
    if (!window.omni) { setStatus('Abra esta interface pelo Electron: npm run dev.'); return; }
    window.omni.info().then(setInfo).catch(e => setStatus(e.message));
    window.omni.listProjects().then(setProjects).catch(e => setStatus(`Catálogo indisponível: ${e.message}`));
    window.omni.listExtensions().then(setExtensions).catch(e=>setStatus('Extensões: '+e.message));
    window.omni.listSchedules().then(setSchedules).catch(e=>setStatus('Agendamentos: '+e.message));
  }, []);

  useEffect(()=>{
    if(!window.omni?.onScheduleChanged)return;
    return window.omni.onScheduleChanged(event=>{
      window.omni.listSchedules().then(setSchedules)
        .catch(()=>setStatus('Não foi possível atualizar o painel de agendamentos.'));
    });
  },[]);

  const notify = useCallback(message => setStatus(message), []);
  // A React state update is asynchronous. Use a real single-flight gate so
  // double clicks cannot race privileged IPC operations or workspace swaps.
  const operationGate = useRef(null);
  if (!operationGate.current) operationGate.current = createOperationGate();
  const execute = useCallback(async (action) => {
    if (!window.omni) return notify('Integração desktop indisponível.');
    const attempt = await operationGate.current.run(async () => {
      setBusy(true);
      try { await action(); }
      catch (err) { notify(`Erro: ${err?.message || 'Falha inesperada.'}`); }
      finally { setBusy(false); }
    });
    if (!attempt.accepted) notify('Conclua a operação atual antes de iniciar outra.');
  }, [notify]);

  const flowRecovery = useFlowRecovery({ workspace, graph, revision:flowRevision, dirty:flowDirty && recoveryEligible,
    execute, notify, session:flowSession, busy });
  const flowEditAllowed = () => !flowRecovery.locked || (notify('Resolva o rascunho de fluxo antes de editar.'), false);

  const applyProject = async result => {
    const recoveryReady = flowRecovery.controller.open(result.workspace);
    setWorkspace(result.workspace);
    setActiveProjectId(result.projectId);
    setFiles(result.files);
    replaceDocument(result.flow, result.flowRevision, result.flowRevision === null, false);
    recovery.reset(); fileContentRef.current = '';
    setFileName(''); setFileContent(''); setFileRevision(''); setDirty(false); setCadDirty(false);
    setCreateKind(null); setCreatePath(''); setEditorJump(null);
    setEditorPosition({line:1,column:1});
    setFileQuery(''); setCollapsedFolders(new Set()); setSideMode('catalog'); setUtilityOpen(true);
    setLastRun(null); setValidation(null);
    setHistory(await window.omni.listRunHistory());
    setSelectedHistory(null);
    setProjects(await window.omni.listProjects());
    setExtensions(await window.omni.listExtensions());
    setMode('canvas');
    await recoveryReady;
    notify(`Projeto aberto: ${result.workspace}`);
  };

  const confirmProjectSwitch = () => !(dirty || flowDirty || cadDirty) ||
    window.confirm('Existem alterações não salvas. Trocar de projeto? Alterações sem cópia de recuperação serão perdidas.');

  const openWorkspace = () => execute(async () => {
    if (!confirmProjectSwitch()) return;
    await flowRecovery.controller.flush();
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
    await flowRecovery.controller.flush();
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

  const refreshSchedules=async()=>setSchedules(await window.omni.listSchedules());
  const createScheduledTask=spec=>execute(async()=>{
    const created=await window.omni.createSchedule(spec);
    await refreshSchedules();
    notify('Agendamento criado e PAUSADO. Ative-o para iniciar as execuções periódicas.');
  });
  const enableScheduledTask=(id,enabled)=>execute(async()=>{
    const result=await window.omni.setScheduleEnabled(id,enabled);
    await refreshSchedules();
    notify(result?(enabled?'Agendamento ativado para as próximas execuções.':'Agendamento pausado.'):
      'Operação cancelada; configuração preservada.');
  });
  // Do not hold the renderer-wide busy flag for a long scheduled run:
  // its Cancel button must remain usable while the worker is active.
  const executeScheduledTask=async id=>{
    try {
      const result=await window.omni.runScheduleNow(id);
      if(result)notify(result.status==='completed'?
        (result.outcome==='PASS'?'Agendamento executado e registrado.':'Agendamento falhou; consulte o histórico.'):
        result.status==='blocked'?'Agendamento bloqueado; revise o fluxo salvo e as permissões.':
        'O executor já está ocupado.');
    } catch(error){notify('Erro ao executar agendamento: '+error.message);}
    finally{refreshSchedules().catch(()=>{});}
  };
  const cancelScheduledTask=id=>
    window.omni.cancelScheduleRun(id).then(result=>{
      notify(result?'Cancelamento solicitado ao executor.':'Nenhuma execução ativa para este agendamento.');
    }).catch(error=>notify('Erro ao cancelar: '+error.message));
  const rebindScheduledTask=id=>execute(async()=>{
    const result=await window.omni.rebindSchedule(id);
    await refreshSchedules();
    notify(result?'Nova revisão aprovada. Ative o agendamento quando desejar.':
      'Revisão não alterada; operação cancelada.');
  });
  const removeScheduledTask=id=>execute(async()=>{
    const result=await window.omni.removeSchedule(id);
    await refreshSchedules();
    notify(result?'Agendamento excluído. Fluxos e arquivos preservados.':
      'Exclusão cancelada.');
  });

  const refreshExtensions=async()=>setExtensions(await window.omni.listExtensions());
  const installExtension=()=>execute(async()=>{
    const installed=await window.omni.installExtension();
    if(installed){await refreshExtensions();notify(installed.alreadyInstalled?'Extensão já instalada: permissões existentes preservadas.':'Extensão instalada desativada. Ative e autorize para executar.');}
    else notify('Instalação cancelada; catálogo intacto.');
  });
  const installExampleExtension=()=>execute(async()=>{
    const installed=await window.omni.installExampleExtension();
    if(installed){await refreshExtensions();notify('Exemplo funcional instalado. Ative e autorize no workspace.');}
  });
  const enableExtension=(id,enabled)=>execute(async()=>{
    await window.omni.setExtensionEnabled(id,enabled);
    await refreshExtensions();setValidation(null);
    notify(enabled?'Extensão ativada. Conceda permissões no workspace.':'Extensão desativada. Fluxos dependentes não serão executados.');
  });
  const grantExtension=(id,permission,enabled)=>execute(async()=>{
    const result=await window.omni.setExtensionGrant(id,permission,enabled);
    await refreshExtensions();setValidation(null);
    notify(result?(enabled?'Permissão autorizada neste workspace.':'Permissão revogada neste workspace.'):'Autorização cancelada.');
  });
  const removeInstalledExtension=id=>execute(async()=>{
    const result=await window.omni.removeExtension(id);
    if(result){await refreshExtensions();setValidation(null);
      notify('Extensão desinstalada. Arquivos e fluxos anteriores preservados.');}
  });
  const insertExtensionAction=(extensionId,actionId)=>addNode('extension.call',{extensionId,actionId});

  const applyTemplate = template => {
    if(busy || !flowEditAllowed())return;
    if (!window.confirm('Carregar modelo de fluxo? Alterações não salvas serão descartadas. O fluxo atual em disco não será apagado até você salvar.')) return;
    const copy=structuredClone(template.flow);
    applyFlowTemplate(copy);setValidation(null);setLastRun(null);setMode('canvas');setSideMode('catalog');setUtilityOpen(true);
    notify(`Modelo carregado: ${template.label}. Valide e salve quando estiver satisfeito.`);
  };

  const addNode = (type, extraConfig = {}) => {
    if(busy || !flowEditAllowed())return;
    if(nodes.length>=400){notify('Limite de 400 blocos atingido.');return;}
    const id = `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const next = createNode(type, id, { x: 160 + nodes.length * 60, y: 110 + nodes.length * 50 });
    next.config={...next.config,...extraConfig};
    setNodes(previous => [...previous, toUiNodes({ nodes: [next] })[0]]);
    setSelectedId(id);
    setMode('canvas');setSideMode('catalog');setUtilityOpen(true);setInspectorOpen(true);
    notify('Bloco adicionado. Conecte as portas antes de executar.');
  };

  const onConnect = useCallback((connection, addEdge) => {
    if(busy || flowRecovery.locked)return;
    const checked=checkFlowConnection(graph,connection);
    if(!checked.valid)return notify(checked.message);
    // React Flow's validated addEdge is supplied by the lazy FlowCanvas.
    if (typeof addEdge !== 'function') throw new TypeError('Conector do grafo indisponível.');
    setEdges(old => addEdge({ ...connection, id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }, old));
    setValidation(null);
  }, [setEdges, graph, busy, notify, flowRecovery.locked]);

  const changeConfig = (key, value) => {
    if(busy || !flowEditAllowed())return;
    try {
    setNodes(all => all.map(node => node.id === selectedId
      ? { ...node, data: { ...node.data, config: { ...node.data.config, [key]: value, ...(key === 'projectId' ? { capabilityId: '' } : {}), ...(key === 'extensionId' ? { actionId: '' } : {}) } } }
      : node),{groupKey:selectedId+':'+key});
    setValidation(null);
    }catch(error){notify(error.message);}
  };

  const selectFlowNode=id=>{
    setSelectedId(id);setFlowFocus({id,at:Date.now()});setInspectorOpen(true);
  };
  const editFlow=useCallback(action=>{
    if(busy || flowRecovery.locked)return;
    try {
      if(action==='undo')undo();
      else if(action==='redo')redo();
      else if(action==='delete')deleteSelected();
      else if(action==='duplicate')duplicateSelected('n_'+crypto.randomUUID().replaceAll('-','').slice(0,18));
      else if(action==='arrange'){setNodes(arrangeFlowNodes(nodes,edges));setFlowFocus({id:null,at:Date.now()});}
      else if(action==='fit')setFlowFocus({id:null,at:Date.now()});
    }catch(error){notify(error.message);}
  },[busy,flowRecovery.locked,nodes,edges,undo,redo,deleteSelected,duplicateSelected,setNodes,notify]);
  useEffect(()=>{
    if(mode!=='canvas')return;
    const handle=event=>{
      if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target?.isContentEditable||/input|textarea|select/i.test(event.target?.tagName||''))return;
      const key=event.key.toLowerCase();
      if(key==='z'||key==='y'){event.preventDefault();editFlow(key==='y'||event.shiftKey?'redo':'undo');}
      else if(key==='d'){event.preventDefault();editFlow('duplicate');}
    };
    window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);
  },[mode,editFlow]);

  const validate = () => execute(async () => {
    if (!flowEditAllowed()) return;
    const checked = await window.omni.validateFlow(graph);
    setValidation(checked);
    setInspectorOpen(true);setFlowTab({tab:'diagnostics',at:Date.now()});
    setMode('canvas');
    notify(checked.valid ? 'Validação concluída: estrutura e capacidades aprovadas.' : `Validação identificou ${checked.errors.length} problema(s).`);
  });

  const save = flowRecovery.save;

  const run = dryRun => execute(async () => {
    if (!flowEditAllowed()) return;
    if (!workspace) throw new Error('Abra uma pasta antes de executar.');
    setLiveSteps([]);
    setLastRun(null);
    setRunning(true);
    setInspectorOpen(true);setFlowTab({tab:'diagnostics',at:Date.now()});
    let result;
    try { result = await window.omni.executeFlow(graph, dryRun); }
    finally { setRunning(false); }
    setLastRun(result);
    if (result.history?.saved) setHistory(await window.omni.listRunHistory());
    const checked = await window.omni.validateFlow(graph);
    setValidation(checked);
    if (result.history && !result.history.saved) notify('Histórico indisponível: a execução foi concluída, mas não foi registrada.');
    else notify(result.ok
      ? (result.partialSimulation ? 'Simulação parcial: nenhum HTTP foi enviado nem respostas inventadas.' : dryRun ? 'Simulação concluída: nenhuma escrita realizada.' : 'Execução real concluída.')
      : `Execução bloqueada: ${result.error || result.errors?.[0] || 'falha de validação'}`);
  });

  const cancelRun = () => window.omni.cancelFlow().then(cancelled => {
    notify(cancelled ? 'Cancelamento solicitado. Registrando o resultado...' : 'Nenhuma execução ativa para cancelar.');
  }).catch(error => notify('Erro ao cancelar: ' + error.message));

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
    await recovery.open(workspace,relative);
    fileContentRef.current = loaded.content;
    setFileName(relative); setFileContent(loaded.content); setFileRevision(loaded.revision); setDirty(false);
    setEditorJump(null); setEditorPosition({line:1,column:1});
    setMode('code');setSideMode('files');setUtilityOpen(true); notify(`Arquivo aberto: ${relative}`);
  });

  const openSearchHit = hit => execute(async () => {
    if (dirty && !window.confirm('Descartar as alterações não salvas antes de abrir este resultado?')) return;
    const loaded = await window.omni.readFile(hit.path);
    await recovery.open(workspace,hit.path);
    fileContentRef.current = loaded.content;
    setFileName(hit.path); setFileContent(loaded.content); setFileRevision(loaded.revision);
    setDirty(false); setEditorJump({path:hit.path,line:hit.line,column:hit.column});
    setEditorPosition({line:hit.line,column:hit.column});
    setMode('code'); setSideMode('files'); setUtilityOpen(true);
    notify('Resultado aberto: ' + hit.path + ' · linha ' + hit.line);
  });

  const createProjectEntry = event => {
    event.preventDefault();
    execute(async () => {
      if (!workspace || !createKind) throw new Error('Abra um projeto e selecione o que deseja criar.');
      const relative = createPath.trim();
      if (!relative) throw new Error('Informe o nome ou caminho relativo.');
      if (createKind === 'file') {
        await window.omni.createWorkspaceFile(relative);
        const loaded = await window.omni.readFile(relative);
        await recovery.open(workspace,relative);
        fileContentRef.current = loaded.content;
        setFileName(relative); setFileContent(loaded.content); setFileRevision(loaded.revision);
        setDirty(false); setEditorJump(null); setEditorPosition({line:1,column:1});
        notify('Arquivo criado: ' + relative);
      } else {
        await window.omni.createWorkspaceFolder(relative);
        notify('Pasta criada: ' + relative);
      }
      setFiles(await window.omni.listFiles());
      setCreateKind(null); setCreatePath('');
    });
  };

  const saveFile = () => execute(async () => {
    if (!workspace || !fileName) throw new Error('Selecione um arquivo do projeto.');
    if (recovery.recoveryDraft) throw new Error('Resolva o rascunho recuperável antes de salvar.');
    const writtenContent = fileContent;
    const saved = await window.omni.saveFile(fileName, writtenContent, fileRevision);
    const unchangedInEditor = fileContentRef.current === writtenContent;
    setFileRevision(saved.revision);
    setDirty(!unchangedInEditor);
    await recovery.onSaved(workspace, fileName, unchangedInEditor);
    notify(unchangedInEditor ? `Arquivo atualizado: ${fileName}` :
      'Arquivo salvo; edições mais recentes ainda precisam ser gravadas.');
  });
  const restoreEditorDraft = () => {
    const content = recovery.restore(fileRevision);
    if (content === null) return notify('O arquivo original mudou. Copie o rascunho para comparar manualmente.');
    fileContentRef.current = content;
    setFileContent(content);
    setDirty(true);
    notify('Rascunho restaurado somente no editor. Use Salvar arquivo para gravar no projeto.');
  };
  const discardEditorDraft = () => execute(async () => {
    if (!recovery.recoveryDraft || !window.confirm(
      'Descartar definitivamente a cópia de recuperação? O arquivo original permanecerá intacto.'
    )) return;
    await recovery.discard(workspace, fileName);
    notify('Cópia de recuperação descartada; arquivo original preservado.');
  });
  const copyEditorDraft = async () => {
    if (!recovery.recoveryDraft) return;
    try {
      await navigator.clipboard.writeText(recovery.recoveryDraft.content);
      notify('Texto do rascunho copiado. Revise as diferenças antes de salvar.');
    } catch (error) { notify('Não foi possível copiar o rascunho: '+error.message); }
  };

  const navigate = nextMode => {
    if(nextMode==='history'){openHistory();return;}
    if(nextMode==='schedules')refreshSchedules().catch(err=>notify('Agendamentos: '+err.message));
    setMode(nextMode);
    if(nextMode==='code'){setSideMode('files');setUtilityOpen(true);}
    else if(nextMode==='canvas'){setSideMode('catalog');setUtilityOpen(true);}
  };
  const executePaletteCommand = command => {
    if (command.kind === 'navigate') navigate(command.mode);
    else if (command.kind === 'file' && workspace) openFile(command.path);
    else if (command.kind === 'action') {
      if (command.action === 'runtime-diagnostics') setDiagnosticsOpen(true);
      else if (command.action === 'open-project') openWorkspace();
      else if (command.action === 'toggle-nav') setNavigationCollapsed(value=>!value);
      else if (command.action === 'toggle-context' && (mode==='code'||mode==='canvas'))
        setUtilityOpen(value=>!value);
      else if (command.action === 'toggle-inspector' && mode==='canvas')
        setInspectorOpen(value=>!value);
    }
  };
  const toggleFolder = folder => setCollapsedFolders(previous=>{
    const next=new Set(previous);
    if(next.has(folder))next.delete(folder);else next.add(folder);
    return next;
  });
  useEffect(()=>{
    const handleShortcut=event=>{
      if(event.key==='F1' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();setPaletteScope('all');return;
      }
      if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
      const key=event.key.toLowerCase();
      if(key==='p'){
        event.preventDefault();setPaletteScope(event.shiftKey?'all':'files');return;
      }
      if(event.shiftKey && key==='f'){
        event.preventDefault();setMode('search');return;
      }
      if(key==='b'){event.preventDefault();setNavigationCollapsed(value=>!value);}
      else if(key==='k'){
        event.preventDefault();
        setMode('canvas');setSideMode('catalog');setUtilityOpen(true);
        requestAnimationFrame(()=>catalogSearchRef.current?.focus());
      }else if(key==='s'){
        // Never open Chromium's Save Page dialog in the desktop application.
        // CAD handles its own document save while the shell handles files/flows.
        event.preventDefault();
        if(!workspace || busy || event.repeat)return;
        if(mode==='canvas' && flowDirty)save();
        else if(mode==='code' && fileName && dirty)saveFile();
      }
    };
    window.addEventListener('keydown',handleShortcut);
    return ()=>window.removeEventListener('keydown',handleShortcut);
  },[workspace,busy,mode,flowDirty,fileName,dirty,graph,fileContent,fileRevision,flowRevision]);

  return (
    <div className="app-shell">
      <header className="topbar topbar--refined">
        <div className="brand-lockup">
          <span className="brand-logo" aria-hidden="true"><span className="brand-logo__glyph">O<span>F</span></span></span>
          <div className="brand-name">OMNIFORGE <span>STUDIO</span><small>v{info.version}</small></div>
        </div>
        <span className="topbar-separator" aria-hidden="true"/>
        <div className="topbar-workspace" title={workspace}>
          <small>WORKSPACE</small>
          <strong>{workspace ? workspace.split(/[\\/]/).pop() : 'Nenhum projeto aberto'}{dirty||flowDirty||cadDirty ? <i aria-label="Alterações não salvas" title="Alterações não salvas" className="topbar-unsaved"/> : null}</strong>
        </div>
        <div className="topbar-current" aria-label="Módulo ativo">
          <small>{currentModule.group}</small><strong>{currentModule.label}</strong>
        </div>
        <div className="topbar-spacer"/>
        <button type="button" className="button button--outline topbar-commands"
          aria-label="Abrir paleta de comandos" title="Paleta de comandos · Ctrl+Shift+P"
          data-testid="command-palette-open" onClick={()=>setPaletteScope('all')}>
          <NavGlyph name="terminal" size={15}/><span>Comandos</span><kbd>Ctrl⇧P</kbd>
        </button>
        <button disabled={busy} type="button" onClick={openWorkspace} className="button button--outline topbar-open"><NavGlyph name="folder" size={16}/> Abrir projeto</button>
        {mode==='canvas' && <button disabled={busy||!workspace||!flowDirty||flowRecovery.locked} type="button" onClick={save} className="button button--solid topbar-save"><NavGlyph name="check" size={15}/> Salvar fluxo</button>}
      </header>

      <div className="workspace-layout">
        <NavigationSidebar mode={mode} collapsed={navigationCollapsed} onCollapse={()=>setNavigationCollapsed(value=>!value)}
          onNavigate={navigate} onOpenProject={openWorkspace} workspace={workspace} projectsCount={projects.length} busy={busy}/>

        {(mode==='canvas'||mode==='code') && utilityOpen && <aside className="sidebar sidebar--contextual" aria-label="Painel de ferramentas" data-testid="context-sidebar">
          <div className="sidebar-heading">
            <div><small>FERRAMENTAS</small><strong>{sideMode==='catalog'?'Biblioteca de blocos':'Explorador'}</strong></div>
            <button type="button" title="Ocultar painel de ferramentas" aria-label="Ocultar painel de ferramentas"
              className="sidebar-hide" onClick={()=>setUtilityOpen(false)}><NavGlyph name="close" size={15}/></button>
          </div>
          <div className="sidebar-tabs" role="group" aria-label="Tipo de painel">
            <button type="button" className={sideMode==='catalog'?'active':''} aria-pressed={sideMode==='catalog'}
              onClick={()=>setSideMode('catalog')}>BLOCOS</button>
            <button type="button" className={sideMode==='files'?'active':''} aria-pressed={sideMode==='files'}
              onClick={()=>setSideMode('files')}>ARQUIVOS</button>
          </div>
          {sideMode==='catalog'?<div className="sidebar-content sidebar-content--catalog">
            <div className="sidebar-summary">{Object.keys(NODE_CATALOG).length} nós executáveis</div>
            <div className="sidebar-search-wrap"><NavGlyph name="search" size={15}/>
              <input ref={catalogSearchRef} className="catalog-search" aria-label="Buscar blocos" placeholder="Buscar bloco ou função..."
                value={catalogQuery} onChange={event=>setCatalogQuery(event.target.value)}/>
              {catalogQuery && <button type="button" aria-label="Limpar busca de blocos"
                onClick={()=>{setCatalogQuery('');catalogSearchRef.current?.focus();}}><NavGlyph name="close" size={13}/></button>}
            </div>
            <select className="catalog-category" aria-label="Filtrar categoria" value={catalogCategory}
              onChange={event=>setCatalogCategory(event.target.value)}>
              {catalogCategories.map(category=><option key={category}>{category}</option>)}
            </select>
            <div className="catalog-results">{visibleCatalogCount} resultado(s)</div>
            {Object.entries(catalogGroups).map(([category, items])=><section key={category} aria-label={category} className="catalog-group">
              <div className="catalog-group-title"><span>{category}</span><span>{items.length}</span></div>
              {items.map(([type,node])=><button key={type} type="button" className="catalog-item" title={node.description}
                disabled={busy} onClick={()=>addNode(type)}>
                <span className="catalog-icon"><NavGlyph name={CATEGORY_NAV_ICONS[category]||'workflow'} size={16}/></span>
                <span className="catalog-item__copy"><strong>{node.label}</strong></span>
                <span className="catalog-plus" aria-hidden="true">+</span>
              </button>)}
            </section>)}
            {!visibleCatalogCount && <p className="empty-small">Nenhum bloco encontrado. Tente outro termo ou categoria.</p>}
          </div>:<div className="sidebar-content sidebar-content--files">
            <div className="sidebar-summary">Arquivos do workspace</div>
            {workspace?<>
              <div className="workspace-file-actions">
                <button type="button" disabled={busy} onClick={()=>{setCreateKind('file');setCreatePath('');}}>+ Novo arquivo</button>
                <button type="button" disabled={busy} onClick={()=>{setCreateKind('folder');setCreatePath('');}}>+ Nova pasta</button>
              </div>
              {createKind && <form className="workspace-create-form" data-testid="workspace-create-form" onSubmit={createProjectEntry}>
                <label>{createKind==='file'?'Criar arquivo':'Criar pasta'}
                  <input aria-label="Caminho do novo item" value={createPath} maxLength={260}
                    onChange={event=>setCreatePath(event.target.value)}
                    placeholder={createKind==='file'?'src/novo-arquivo.js':'src/nova-pasta'}
                    required autoFocus/>
                </label>
                <div className="workspace-create-form__actions">
                  <button type="submit" disabled={busy||!createPath.trim()} data-testid="workspace-create-confirm">Criar</button>
                  <button type="button" disabled={busy} onClick={()=>{setCreateKind(null);setCreatePath('');}}>Cancelar</button>
                </div>
              </form>}
              <div className="sidebar-search-wrap"><NavGlyph name="search" size={15}/>
                <input className="catalog-search" aria-label="Buscar arquivo" placeholder="Buscar arquivos..."
                  value={fileQuery} onChange={e=>setFileQuery(e.target.value)}/>
                {fileQuery && <button type="button" aria-label="Limpar busca de arquivos" onClick={()=>setFileQuery('')}>
                  <NavGlyph name="close" size={13}/></button>}
              </div>
              <div className="folder-title" title={workspace}><NavGlyph name="folder" size={15}/> {workspace.split(/[\\/]/).pop()}</div>
              <div className="file-list" role="tree" aria-label="Arquivos do projeto">
                {visibleFiles.map(entry=><button type="button" key={entry.path}
                  role="treeitem" aria-expanded={entry.kind==='directory' ? !collapsedFolders.has(entry.path) : undefined}
                  title={entry.path} disabled={busy}
                  className={`file-entry ${entry.kind==='directory'?'file-entry--directory':''} ${entry.path===fileName?'file-entry--selected':''}`}
                  onClick={()=>entry.kind==='directory'?toggleFolder(entry.path):openFile(entry.path)}
                  style={{paddingLeft:fileQuery?12:10+entry.depth*12}}>
                  {entry.kind==='directory'?<NavGlyph name="chevron" size={13}/>:<NavGlyph name="code" size={13}/>}
                  <span>{fileQuery?entry.path:entry.path.split('/').pop()}</span>
                </button>)}
                {!visibleFiles.length && <p className="empty-small">Nenhum arquivo encontrado.</p>}
              </div>
              <button type="button" disabled={busy} className="subtle-action"
                onClick={()=>execute(async()=>{setFiles(await window.omni.listFiles());notify('Explorador atualizado.');})}>Atualizar arquivos</button>
            </>:<div className="empty-small">Abra uma pasta para visualizar os arquivos locais do projeto.</div>}
          </div>}
          <div className="sidebar-footer"><span>CTRL + K</span><span>Buscar blocos</span></div>
        </aside>}

        <main className="main-panel">
          {mode==='home' && <WorkspaceOverview workspace={workspace} projects={projects} version={info.version} onNavigate={navigate} onOpenProject={openWorkspace} flowDirty={flowDirty} cadDirty={cadDirty} lastRun={lastRun}/>}
          {mode==='search' && <ModuleErrorBoundary label="Busca no projeto"><React.Suspense fallback={<ModuleLoading label="busca"/>}><WorkspaceSearch workspace={workspace} busy={busy} onOpenResult={openSearchHit}/></React.Suspense></ModuleErrorBoundary>}
          {(cadEverOpened || mode==='cad') && <div style={{display:mode === 'cad' ? 'flex' : 'none',flex:1,minHeight:0}}><ModuleErrorBoundary key={workspace || '__none__'} label="CAD 2D"><React.Suspense fallback={<ModuleLoading label="CAD"/>}><CadWorkbench key={workspace || '__none__'} workspace={workspace} visible={mode==='cad'} onDirtyChange={setCadDirty}/></React.Suspense></ModuleErrorBoundary></div>}
          {mode === 'canvas' && (
            <>
              <div className="main-toolbar">
                <div className="toolbar-heading"><span className="eyebrow">WORKSPACE / AUTOMAÇÕES</span><strong>Editor visual</strong>{flowRecovery.phase==='saved' && <small className="flow-protection" data-testid="flow-draft-saved">Cópia local protegida</small>}</div>
                <div className="toolbar-actions">
                  <button type="button" className="button button--subtle button--utility" aria-label={utilityOpen?'Ocultar biblioteca de blocos':'Mostrar painel de ferramentas'} title="Alternar biblioteca de blocos" onClick={()=>{setUtilityOpen(value=>!value);setSideMode('catalog');}}><NavGlyph name="panel" size={16}/> <span>Biblioteca</span></button>
                  <button className="button button--subtle" disabled={busy || flowRecovery.locked} onClick={validate}>Validar</button>
                  <button className="button button--subtle" disabled={busy || !workspace || flowRecovery.locked} onClick={() => run(true)}>Simular</button>
                  <button className="button button--run" disabled={busy || !workspace || flowRecovery.locked} onClick={() => run(false)}>▶ Executar</button>
                  {running && <button className="button button--stop" type="button" data-testid="flow-cancel" onClick={cancelRun}>■ Cancelar</button>}
                  <button type="button" className="button button--subtle button--inspector" title="Alternar inspetor" aria-label={inspectorOpen?'Ocultar inspetor':'Mostrar inspetor'}
                    onClick={()=>setInspectorOpen(open=>!open)}><NavGlyph name="layers" size={16}/></button>
                </div>
              </div>
              {(flowRecovery.draft || flowRecovery.error) && <React.Suspense fallback={null}><FlowRecoveryNotice
                recovery={flowRecovery} revision={flowRevision} busy={busy} onRestore={flowRecovery.restore} onDiscard={flowRecovery.discard}/></React.Suspense>}
              <FlowEditTools name={graph.name} nodeCount={nodes.length} edgeCount={edges.length}
                busy={busy || flowRecovery.locked} selected={selected} canUndo={canUndo} canRedo={canRedo} onAction={editFlow}/>
              <ModuleErrorBoundary label="Automação visual"><React.Suspense fallback={<ModuleLoading label="automações"/>}>
                <FlowCanvas nodes={nodes} edges={edges} onNodesChange={handleNodesChange}
                  onEdgesChange={handleEdgesChange} onConnect={onConnect} locked={busy || flowRecovery.locked}
                  graph={graph} diagnostics={validation?.diagnostics} runSteps={running?liveSteps:lastRun?.steps}
                  focusRequest={flowFocus} onDeleteElements={deleteElements}
                  onNodeClick={(_event,node)=>{setSelectedId(node.id);setInspectorOpen(true);setFlowTab({tab:'properties',at:Date.now()});}}
                  onPaneClick={()=>setSelectedId(null)}/>
              </React.Suspense></ModuleErrorBoundary>
            </>
          )}
          {mode === 'templates' && (
            <>
              <div className="main-toolbar"><div className="toolbar-heading"><span className="eyebrow">AUTOMAÇÕES / MODELOS EXECUTÁVEIS</span><strong>Biblioteca de fluxos</strong></div></div>
              <section className="projects-page">
                <p className="projects-intro">Os modelos usam somente blocos reais do catálogo. Carregar um modelo altera apenas o desenho atual; o fluxo salvo no projeto é mantido até você clicar em Salvar fluxo.</p>
                <div className="project-cards">{WORKFLOW_TEMPLATES.map(template=><article key={template.id} className="project-card">
                  <div className="project-card__heading"><strong>{template.label}</strong><span className="project-available">VALIDADO</span></div>
                  <p className="projects-intro">{template.description}</p>
                  <div className="project-card__footer"><span>{template.flow.nodes.length} blocos · {template.flow.edges.length} conexões</span><button className="button button--solid" disabled={busy || flowRecovery.locked} onClick={() => applyTemplate(template)}>Usar modelo</button></div>
                </article>)}</div>
              </section>
            </>
          )}
          {mode === 'code' && (
            <>
              <div className="main-toolbar">
                <div className="toolbar-heading"><span className="eyebrow">EDITOR / ARQUIVOS LOCAIS</span><strong>{fileName || 'Nenhum arquivo selecionado'} {dirty ? '•' : ''}</strong></div>
                <div className="toolbar-actions">
                  <button type="button" className="button button--subtle button--utility" aria-label={utilityOpen?'Ocultar explorador de arquivos':'Mostrar painel de ferramentas'} onClick={()=>{setUtilityOpen(open=>!open);setSideMode('files');}}><NavGlyph name="panel" size={16}/> Explorador</button>
                  {fileName && <span className="workspace-editor-position" data-testid="editor-position">Ln {editorPosition.line} · Col {editorPosition.column}</span>}
                  <button className="button button--solid" disabled={busy || !fileName || !dirty || Boolean(recovery.recoveryDraft)} onClick={saveFile}>Salvar arquivo</button>
                </div>
              </div>
              {fileName && recovery.recoveryDraft && <section className="editor-recovery" role="status" data-testid="editor-recovery">
                <div>
                  <strong>{recovery.recoveryDraft.baseRevision === fileRevision ?
                    'Rascunho de recuperação disponível' : 'Conflito: arquivo alterado externamente'}</strong>
                  <p>{recovery.recoveryDraft.baseRevision === fileRevision ?
                    'Existe uma edição não salva de uma sessão anterior. A restauração altera somente o editor.' :
                    'O documento em disco mudou desde a criação do rascunho. Copie o conteúdo para comparar; a restauração automática está bloqueada.'}</p>
                </div>
                <div className="editor-recovery__actions">
                  {recovery.recoveryDraft.baseRevision === fileRevision &&
                    <button className="button button--solid" type="button" onClick={restoreEditorDraft}>
                      Restaurar no editor
                    </button>}
                  <button className="button button--outline" type="button" onClick={copyEditorDraft}>Copiar rascunho</button>
                  <button className="button button--subtle" disabled={busy} type="button" onClick={discardEditorDraft}>Descartar rascunho</button>
                </div>
              </section>}
              {fileName && recovery.recoveryError && <p className="editor-recovery__error" role="alert">{recovery.recoveryError}</p>}
              {fileName && dirty && recovery.protectionStatus==='saved' && !recovery.recoveryDraft &&
                <p className="editor-recovery__saved" data-testid="editor-draft-saved">Rascunho protegido localmente. Salve o arquivo para confirmar as alterações.</p>}
              {fileName ? (
                <div className="editor-wrap"><ModuleErrorBoundary key={fileName} label="Editor de código"><React.Suspense fallback={<ModuleLoading label="editor"/>}><CodeEditor key={fileName} theme="vs-dark" language={getLanguage(fileName)} value={fileContent}
                  onMount={editor => {
                    editor.onDidChangeCursorPosition(event => setEditorPosition({
                      line:event.position.lineNumber,column:event.position.column
                    }));
                    if (editorJump && editorJump.path === fileName) {
                      const position = {lineNumber:editorJump.line,column:editorJump.column};
                      editor.revealPositionInCenter(position);
                      editor.setPosition(position);
                      editor.focus();
                      setEditorPosition({line:position.lineNumber,column:position.column});
                      setEditorJump(null);
                    }
                  }}
                  onChange={v => {fileContentRef.current = v ?? ''; setFileContent(v ?? ''); setDirty(true);}}
                  options={editorOptionsForSize(fileContent.length)} /></React.Suspense></ModuleErrorBoundary></div>
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
          {mode === 'git' && <ModuleErrorBoundary label="Controle Git"><React.Suspense fallback={<ModuleLoading label="Git"/>}><GitSourceControl workspace={workspace} busy={busy} onNotice={notify}/></React.Suspense></ModuleErrorBoundary>}
          {mode === 'tasks' && <ModuleErrorBoundary label="Central de Tarefas"><React.Suspense fallback={<ModuleLoading label="tarefas"/>}><ProjectTasks workspace={workspace} busy={busy} onNotice={notify}/></React.Suspense></ModuleErrorBoundary>}
          {mode === 'schedules' && <ModuleErrorBoundary label="Agendamentos"><React.Suspense fallback={<ModuleLoading label="agendamentos"/>}><ScheduleCenter
            schedules={schedules} projects={projects} workspace={workspace}
            activeProjectId={activeProjectId} flowDirty={flowDirty} busy={busy}
            onCreate={createScheduledTask} onEnable={enableScheduledTask}
            onRunNow={executeScheduledTask} onCancel={cancelScheduledTask}
            onRebind={rebindScheduledTask} onRemove={removeScheduledTask}
            onRefresh={()=>execute(async()=>{await refreshSchedules();notify('Agendamentos atualizados.');})}/></React.Suspense></ModuleErrorBoundary>}
          {mode === 'extensions' && <ModuleErrorBoundary label="Extensões"><React.Suspense fallback={<ModuleLoading label="extensões"/>}><ExtensionsHub
            extensions={extensions} workspace={workspace} busy={busy}
            onInstall={installExtension} onInstallExample={installExampleExtension}
            onEnable={enableExtension} onGrant={grantExtension}
            onRemove={removeInstalledExtension} onAddAction={insertExtensionAction}
            onRefresh={()=>execute(async()=>{await refreshExtensions();notify('Extensões atualizadas.');})}/></React.Suspense></ModuleErrorBoundary>}
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
              <div className="about-note">OmniForge CAD Sketch 2D já permite desenhar e exportar SVG/DXF. CAD sólido paramétrico 3D, automação industrial, agentes de IA e host de extensões são módulos futuros com testes próprios.</div>
            </div>
          )}
        </main>

        {mode==='canvas' && inspectorOpen && <FlowInspector
          selected={selected} graph={graph} projects={projects} extensions={extensions}
          validation={validation} lastRun={lastRun} running={running} liveSteps={liveSteps}
          busy={busy || flowRecovery.locked} tabRequest={flowTab} onConfig={changeConfig} onSelect={selectFlowNode}
          onRename={value=>{if(busy || !flowEditAllowed())return;try{rename(value);}catch(error){notify(error.message);}}}/>}

      </div>
      {paletteScope && <React.Suspense fallback={null}><CommandPalette open
        scope={paletteScope} commands={workbenchCommands} mode={mode}
        hasWorkspace={Boolean(workspace)} onClose={()=>setPaletteScope(null)}
        onExecute={executePaletteCommand}/></React.Suspense>}
      {diagnosticsOpen && <React.Suspense fallback={null}><RuntimeDiagnostics onClose={()=>setDiagnosticsOpen(false)}/></React.Suspense>}
      <footer className="statusbar"><span className="statusbar-left"><span className={`indicator-dot ${lastRun&&!lastRun.ok?'indicator-dot--error':''}`}/> {status}</span><button type="button" className="runtime-diagnostics-trigger" aria-label="Abrir diagnóstico local" title="Versões e diagnóstico local" onClick={()=>setDiagnosticsOpen(true)}>OmniForge {info.version} <span className="statusbar-separator">·</span> Local</button></footer>
    </div>
  );
}
