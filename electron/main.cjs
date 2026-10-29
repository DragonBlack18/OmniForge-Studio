'use strict';
const { app, BrowserWindow, dialog, ipcMain, protocol, net, shell, session, powerMonitor } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{
  scheme: 'omni', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

let mainWindow;
let workspaceRoot = null;
let executionInProgress = false;
let activeRunController = null;
let exitAfterRun = false;
let saveInProgress = false;
let workspaceSearchInProgress = false;
let registryMutationInProgress = false;
let cadMutationInProgress = false;
let activeProjectId = null;
let hasUnsavedChanges = false;
let exitPromptOpen = false;
let userApprovedExit = false;
let scheduleService = null;
let scheduleReady = false;
let schedulePromptOpen = false;
const projectRoot = path.resolve(__dirname, '..');
const isDevelopment = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);

// Isolated userData is allowed ONLY for local E2E smoke processes.
// Do not trust arbitrary profile paths from the renderer and never enable
// this override in a packaged application used with real project data.
const smokeProfile=process.env.OMNIFORGE_E2E_USER_DATA;
if (!app.isPackaged && process.env.OMNIFORGE_E2E === '1' &&
    typeof smokeProfile === 'string' && smokeProfile.length > 0 &&
    smokeProfile.length < 4096 && path.isAbsolute(smokeProfile)) {
  const tempBase=path.resolve(os.tmpdir());
  const target=path.resolve(smokeProfile);
  const relative=path.relative(tempBase,target);
  if (relative && relative !== '..' && !relative.startsWith('..'+path.sep) &&
      !path.isAbsolute(relative)) {
    // Electron must use app.setPath() before app.whenReady; changing APPDATA
    // alone does not consistently isolate the runtime on Windows.
    app.setPath('userData',target);
  } else {
    throw new Error('Smoke profile must live under the system temporary directory.');
  }
}


function assertTrustedSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Origem de IPC não autorizada.');
  }
  const url = event.senderFrame.url;
  const approved = isDevelopment
    ? url.startsWith('http://127.0.0.1:5173/')
    : url.startsWith('omni://app/');
  if (!approved) throw new Error('Renderer não autorizado.');
}

function register(name, action) {
  ipcMain.handle(`omni:${name}`, (event, ...args) => {
    assertTrustedSender(event);
    return action(...args);
  });
}

function requireWorkspace() {
  if (!workspaceRoot) throw new Error('Abra uma pasta de projeto antes de continuar.');
  return workspaceRoot;
}

async function initializeIpc() {
  const core = await import('../core/index.mjs');
  register('info', () => ({ version: app.getVersion(), mode: isDevelopment ? 'DESENVOLVIMENTO' : 'PRODUÇÃO' }));
  register('setUnsavedChanges', dirty => {
    if (typeof dirty !== 'boolean') throw new Error('Estado de edição inválido.');
    hasUnsavedChanges = dirty;
    return true;
  });
  register('requestExit', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    return true;
  });
  register('catalog', () => core.NODE_CATALOG);
  register('loadCadSketch', () => core.loadCadDocument(requireWorkspace()));
  register('saveCadSketch', async (sketch, revision) => {
    if (cadMutationInProgress || executionInProgress || registryMutationInProgress) throw new Error('Operação simultânea não permitida.');
    cadMutationInProgress = true;
    try { return await core.saveCadDocument(requireWorkspace(), sketch, revision); }
    finally { cadMutationInProgress = false; }
  });
  register('importCadDxf', async () => {
    if (cadMutationInProgress || executionInProgress || registryMutationInProgress || saveInProgress) {
      throw new Error('Conclua a operação atual antes de importar um DXF.');
    }
    requireWorkspace();
    cadMutationInProgress = true;
    try {
      const chosen = await dialog.showOpenDialog(mainWindow, {
        title: 'Importar desenho DXF ASCII (somente leitura)',
        properties: ['openFile'],
        filters: [{ name: 'AutoCAD DXF (*.dxf)', extensions: ['dxf'] }]
      });
      if (chosen.canceled || chosen.filePaths.length !== 1) return null;
      const imported = await core.readCadDxfFile(chosen.filePaths[0], { assumeMillimeters: true });
      if (imported.meta.assumedMillimeters) {
        const confirmation = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Confirmar unidades do DXF',
          message: 'O arquivo não informa unidades confiáveis.',
          detail: 'O desenho será interpretado em milímetros (mm), sem conversão de escala. ' +
            'Se ele foi criado em polegadas ou outra unidade, cancele e ajuste as unidades no programa de origem.',
          buttons: ['Cancelar importação', 'Interpretar como milímetros'],
          defaultId: 0,
          cancelId: 0,
          noLink: true
        });
        if (confirmation.response !== 1) return null;
      }
      return imported;
    } finally {
      cadMutationInProgress = false;
    }
  });
  register('exportCadSketch', async (format, sketch) => {
    if (cadMutationInProgress || executionInProgress) throw new Error('Conclua a operação atual antes de exportar.');
    cadMutationInProgress = true;
    try { return await core.exportCadSketch(requireWorkspace(), format, sketch); }
    finally { cadMutationInProgress = false; }
  });
  const catalogDataRoot = app.getPath('userData');
  const ensureIdle = () => {
    if (saveInProgress || executionInProgress || registryMutationInProgress || cadMutationInProgress) throw new Error('Conclua a operação atual antes de trocar ou cadastrar projetos.');
  };
  async function serialRegistryAction(action) {
    ensureIdle();
    registryMutationInProgress = true;
    try { return await action(); }
    finally { registryMutationInProgress = false; }
  }
  async function activateProject(project) {
    const candidate = project.path;
    const [document, files] = await Promise.all([core.readFlowDocument(candidate), core.listProjectFiles(candidate)]);
    await core.markProjectOpened(catalogDataRoot, project.id);
    workspaceRoot = candidate;
    activeProjectId = project.id;
    return { workspace: candidate, projectId: project.id, flow: document.flow, flowRevision: document.revision, files };
  }
  // Declarative packages are data, never arbitrary Node or browser code.
  // Every mutation shares the project's registry mutex with flow execution.
  register('listExtensions',()=>core.listInstalledExtensions(catalogDataRoot,workspaceRoot));
  register('installExtension',()=>serialRegistryAction(async()=>{
    const chosen=await dialog.showOpenDialog(mainWindow,{
      title:'Instalar extensão declarativa OmniForge (.ofx.json)',
      properties:['openFile'],filters:[{name:'Pacote OmniForge',extensions:['json']}]
    });
    if(chosen.canceled || chosen.filePaths.length!==1)return null;
    const manifest=await core.readExtensionFile(chosen.filePaths[0]);
    const existing=(await core.listInstalledExtensions(catalogDataRoot))
      .find(item=>item.id===manifest.id);
    const requested=manifest.permissions.join('\n  - ');
    const approval=await dialog.showMessageBox(mainWindow,{
      type:'warning',title:existing?'Atualizar extensão local':'Instalar extensão local',
      message:(existing?'Atualizar':'Instalar')+' '+manifest.name+' v'+manifest.version+'?',
      detail:'Origem: arquivo local selecionado pelo usuário.\n'+
        'Identificador: '+manifest.id+'\n'+
        'Permissões declaradas:\n  - '+requested+'\n\n'+
        'Somente operações declarativas são aceitas. Nenhum JavaScript, executável ou pacote npm será executado. '+
        'A extensão será instalada DESATIVADA. Ao atualizar, todas as permissões anteriores serão revogadas.',
      buttons:['Cancelar','Confirmar instalação'],defaultId:0,cancelId:0,noLink:true
    });
    if(approval.response!==1)return null;
    return core.installExtension(catalogDataRoot,manifest,{replace:Boolean(existing)});
  }));
  register('installExampleExtension',()=>serialRegistryAction(async()=>{
    const manifest=core.EXAMPLE_EXTENSION;
    const current=(await core.listInstalledExtensions(catalogDataRoot))
      .find(item=>item.id===manifest.id);
    const approval=await dialog.showMessageBox(mainWindow,{
      type:'question',title:'Instalar exemplo funcional',
      message:'Instalar Engenharia de dados?',
      detail:'Ações reais: converter kg em gramas e formatar etiqueta de ordem.\n\n'+
        'O exemplo será instalado DESATIVADO e sem permissões. '+ 
        'Ative-o e conceda acesso ao workspace para executar; nada é gravado durante a instalação.',
      buttons:['Cancelar','Instalar exemplo'],defaultId:0,cancelId:0,noLink:true
    });
    if(approval.response!==1)return null;
    return core.installExtension(catalogDataRoot,manifest,{replace:Boolean(current)});
  }));
  register('setExtensionEnabled',(id,enabled)=>serialRegistryAction(()=>
    core.setExtensionEnabled(catalogDataRoot,id,enabled)
  ));
  register('setExtensionGrant',(id,permission,enabled)=>serialRegistryAction(async()=>{
    const workspace=requireWorkspace();
    if(enabled) {
      const approval=await dialog.showMessageBox(mainWindow,{
        type:'warning',title:'Autorizar capacidade local',
        message:'Conceder a permissão '+permission+'?',
        detail:'Extensão: '+id+'\nWorkspace: '+workspace+'\n\n'+
          (permission==='workspace.output.write'
            ? 'Esta permissão permite que a extensão grave JSON somente em .omniforge/output do projeto, quando um fluxo real for executado.'
            : 'Esta permissão permite que a ação declarativa transforme os valores JSON neste workspace.')+
          '\n\nA autorização pode ser revogada a qualquer momento na Central de Extensões.',
        buttons:['Cancelar','Autorizar neste projeto'],defaultId:0,cancelId:0,noLink:true
      });
      if(approval.response!==1)return null;
    }
    return core.setExtensionGrant(catalogDataRoot,workspace,id,permission,enabled);
  }));
  register('removeExtension',id=>serialRegistryAction(async()=>{
    const confirm=await dialog.showMessageBox(mainWindow,{
      type:'warning',title:'Desinstalar extensão',
      message:'Desinstalar '+id+'?',
      detail:'Ações desta extensão deixarão de validar. Fluxos e arquivos já gravados serão preservados.',
      buttons:['Cancelar','Desinstalar'],defaultId:0,cancelId:0,noLink:true
    });
    if(confirm.response!==1)return null;
    return core.removeExtension(catalogDataRoot,id);
  }));
  // Local scheduler: only the Electron main process owns the timer and
  // the permission to start a supervised automation. No background service.
  scheduleService = new core.LocalScheduleEngine({
    userData:catalogDataRoot,
    acquireSlot:()=>{
      if(executionInProgress||saveInProgress||cadMutationInProgress||
         registryMutationInProgress||schedulePromptOpen)return null;
      executionInProgress=true;
      activeRunController=new AbortController();
      return activeRunController;
    },
    releaseSlot:controller=>{
      if(activeRunController!==controller)return;
      executionInProgress=false;activeRunController=null;
      if(exitAfterRun){
        exitAfterRun=false;userApprovedExit=true;
        setImmediate(()=>app.quit());
      }
    },
    onChange:event=>{
      if(mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('omni:scheduleChanged',event);
    },
    onProgress:({scheduleId,step})=>{
      if(mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('omni:scheduleProgress',{scheduleId,step});
    }
  });
  try {
    await scheduleService.bootstrap();
    scheduleReady=true;
  } catch {
    // Corrupt/unsafe schedule storage must not make the entire desktop unusable.
    scheduleReady=false;
  }
  const scheduler=()=>{
    if(!scheduleReady)throw new Error(
      'Agendador indisponível: verifique a integridade do catálogo local.'
    );
    return scheduleService;
  };
  const announceSchedule=(id,kind='updated')=>{
    if(mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('omni:scheduleChanged',{id,kind});
  };
  register('listSchedules',()=>core.listSchedules(catalogDataRoot));
  register('createSchedule',data=>serialRegistryAction(async()=>{
    const projectId=activeProjectId;
    const workspace=requireWorkspace();
    if(!projectId)throw new Error('Abra um projeto cadastrado antes de agendar.');
    const {document}=await core.validateScheduledDocument(workspace,catalogDataRoot);
    const created=await core.createSchedule(catalogDataRoot,{
      label:data?.label,intervalMinutes:data?.intervalMinutes,
      projectId,flowRevision:document.revision
    });
    announceSchedule(created.id,'created');
    return created;
  }));
  register('setScheduleEnabled',(id,enabled)=>{
    // Pausing future runs is allowed even when that scheduled run is active.
    // The store serializes this change and the active job finishes/cancels separately.
    if(enabled===false)return core.setScheduleEnabled(catalogDataRoot,id,false).then(result=>{
      announceSchedule(id,'paused');return result;
    });
    return serialRegistryAction(async()=>{
    const job=await core.getSchedule(catalogDataRoot,id);
    if(enabled){
      const project=await core.getProject(catalogDataRoot,job.projectId);
      await core.validateScheduledDocument(project.path,catalogDataRoot,job.flowRevision);
      const approval=await dialog.showMessageBox(mainWindow,{
        type:'warning',title:'Autorizar execução automática local',
        message:'Ativar '+job.label+'?',
        detail:'O OmniForge executará o fluxo salvo do projeto '+project.label+
          ' a cada '+job.intervalMinutes+' minuto(s), apenas enquanto este aplicativo estiver aberto.\\n\\n'+
          'Podem ocorrer gravações reais na pasta .omniforge/output do projeto. '+
          'Chamadas HTTP, APIs externas e reexecução de horários perdidos são bloqueadas. '+
          'Alterações do fluxo exigirão nova aprovação.\\n\\n'+
          'O agendamento poderá ser pausado a qualquer momento.',
        buttons:['Cancelar','Ativar agendamento'],defaultId:0,cancelId:0,noLink:true
      });
      if(approval.response!==1)return null;
    }
    const changed=await core.setScheduleEnabled(catalogDataRoot,id,enabled);
    announceSchedule(id,enabled?'enabled':'paused');
    return changed;
    });
  });
  register('rebindSchedule',id=>serialRegistryAction(async()=>{
    const job=await core.getSchedule(catalogDataRoot,id);
    if(job.enabled||job.state==='running')
      throw new Error('Pause o agendamento antes de atualizar a revisão.');
    const project=await core.getProject(catalogDataRoot,job.projectId);
    const {document}=await core.validateScheduledDocument(project.path,catalogDataRoot);
    const approval=await dialog.showMessageBox(mainWindow,{
      type:'warning',title:'Atualizar vínculo do agendamento',
      message:'Aprovar a revisão atual do fluxo?',
      detail:'Agendamento: '+job.label+'\\nProjeto: '+project.label+
        '\\n\\nEsta ação não ativa o agendamento. '+
        'Verifique o fluxo salvo antes de reativá-lo.',
      buttons:['Cancelar','Aprovar revisão'],defaultId:0,cancelId:0,noLink:true
    });
    if(approval.response!==1)return null;
    const updated=await core.rebindSchedule(catalogDataRoot,id,document.revision);
    announceSchedule(id,'rebound');
    return updated;
  }));
  register('removeSchedule',id=>serialRegistryAction(async()=>{
    const job=await core.getSchedule(catalogDataRoot,id);
    const answer=await dialog.showMessageBox(mainWindow,{
      type:'warning',title:'Excluir agendamento',
      message:'Excluir '+job.label+'?',
      detail:'Serão removidas apenas as configurações do agendamento. '+
        'Os fluxos, históricos e arquivos do projeto não serão apagados.',
      buttons:['Cancelar','Excluir agendamento'],defaultId:0,cancelId:0,noLink:true
    });
    if(answer.response!==1)return null;
    const result=await core.removeSchedule(catalogDataRoot,id);
    announceSchedule(id,'removed');
    return result;
  }));
  register('runScheduleNow',async id=>{
    const service=scheduler();
    if(executionInProgress||service.busy||schedulePromptOpen||
       registryMutationInProgress||saveInProgress||cadMutationInProgress)
      throw new Error('Já existe uma execução em andamento.');
    const job=await core.getSchedule(catalogDataRoot,id);
    if(!job.enabled)throw new Error('Ative o agendamento antes de executá-lo.');
    schedulePromptOpen=true;
    let approved=false;
    try{
      const result=await dialog.showMessageBox(mainWindow,{
        type:'warning',title:'Executar agendamento agora',
        message:'Executar '+job.label+' agora?',
        detail:'Esta é uma execução REAL do fluxo salvo. '+
          'Saídas JSON podem ser gravadas. Nenhum HTTP é permitido.',
        buttons:['Cancelar','Executar agora'],defaultId:0,cancelId:0,noLink:true
      });
      approved=result.response===1;
    } finally {schedulePromptOpen=false;}
    if(!approved)return null;
    return service.runNow(id,{force:true});
  });
  register('cancelScheduleRun',id=>{
    const service=scheduler();
    if(service.activeId!==id || !activeRunController ||
       activeRunController.signal.aborted)return false;
    activeRunController.abort();
    return true;
  });
  register('listProjects', () => core.listProjects(catalogDataRoot));
  register('registerProject', async () => serialRegistryAction(async () => {
    const selected = await dialog.showOpenDialog(mainWindow, { title: 'Cadastrar projeto no catálogo (sem alterar arquivos)', properties: ['openDirectory'] });
    if (selected.canceled || selected.filePaths.length === 0) return null;
    return core.registerProject(catalogDataRoot, selected.filePaths[0]);
  }));
  register('openProject', id => serialRegistryAction(async () => activateProject(await core.getProject(catalogDataRoot, id))));
  register('registerCapability', (projectId, definition) => serialRegistryAction(() => core.registerCapability(catalogDataRoot, projectId, definition)));
  register('forgetCapability', (projectId, id) => serialRegistryAction(() => core.forgetCapability(catalogDataRoot, projectId, id)));
  register('forgetProject', id => serialRegistryAction(async () => {
    if (id === activeProjectId) throw new Error('Abra outro projeto antes de esquecer o projeto ativo.');
    return core.forgetProject(catalogDataRoot, id);
  }));
  register('selectWorkspace', () => serialRegistryAction(async () => {
    const selected = await dialog.showOpenDialog(mainWindow, { title: 'Abrir projeto existente', properties: ['openDirectory'] });
    if (selected.canceled || selected.filePaths.length === 0) return null;
    const project = await core.registerProject(catalogDataRoot, selected.filePaths[0]);
    return activateProject(project);
  }));
  // All Git writes are deliberate and serialized with other privileged operations.
  // The renderer never receives a shell, child_process handle or arbitrary Git command.
  register('gitStatus', () => core.gitWorkspaceStatus(requireWorkspace()));
  register('gitDiff', (relative, staged) => core.gitDiff(requireWorkspace(), relative, staged));
  register('gitStage', paths => serialRegistryAction(() => core.gitStage(requireWorkspace(), paths)));
  register('gitUnstage', paths => serialRegistryAction(() => core.gitUnstage(requireWorkspace(), paths)));
  register('gitCommit', message => serialRegistryAction(async () => {
    const current = await core.gitWorkspaceStatus(requireWorkspace());
    if (!current.available) throw new Error(current.reason);
    if (current.truncated) throw new Error('Mais de 400 alterações no repositório. Revise o índice antes do commit.');
    const staged = current.files.filter(item => item.staged);
    if (!staged.length) throw new Error('Nenhuma alteração preparada para commit.');
    const detail = 'Branch: ' + current.branch + '\nArquivos preparados: ' + staged.length +
      '\n\n' + staged.slice(0, 10).map(item => '• ' + item.path).join('\n') +
      (staged.length > 10 ? '\n... e outros arquivos' : '') +
      '\n\nTodos os arquivos no índice serão incluídos, mesmo os preparados por outros programas. Nenhum push será executado.';
    const answer = await dialog.showMessageBox(mainWindow, {
      type: 'warning', title: 'Criar commit Git local',
      message: 'Confirma este commit no repositório local?',
      detail, buttons: ['Cancelar', 'Criar commit'], defaultId: 0,
      cancelId: 0, noLink: true
    });
    if (answer.response !== 1) return null;
    return core.gitCommit(requireWorkspace(), message);
  }));
  // File search is read-only, bounded and does not expose Node to the renderer.
  register('searchWorkspaceText', async options => {
    if (workspaceSearchInProgress) throw new Error('Outra busca já está em andamento.');
    const selectedRoot = requireWorkspace();
    workspaceSearchInProgress = true;
    try { return await core.searchWorkspaceText(selectedRoot, options); }
    finally { workspaceSearchInProgress = false; }
  });
  // File/folder creation is exclusive and shares the privileged operation mutex.
  register('createWorkspaceFile', relative =>
    serialRegistryAction(() => core.createWorkspaceFile(requireWorkspace(), relative)));
  register('createWorkspaceFolder', relative =>
    serialRegistryAction(() => core.createWorkspaceFolder(requireWorkspace(), relative)));
  register('listFiles', () => core.listProjectFiles(requireWorkspace()));
  register('listRunHistory', () => core.listRunHistory(requireWorkspace()));
  register('readRunHistory', id => core.readRunHistory(requireWorkspace(), id));
  register('readFile', relative => core.readProjectFile(requireWorkspace(), relative));
  register('saveFile', async (relative, content, expectedRevision) => {
    if (saveInProgress || executionInProgress || cadMutationInProgress || registryMutationInProgress)
      throw new Error('Conclua a execução antes de salvar arquivos.');
    saveInProgress = true;
    try { return await core.saveProjectFile(requireWorkspace(), relative, content, expectedRevision); }
    finally { saveInProgress = false; }
  });
  register('saveFlow', async (flow, expectedRevision) => {
    if (saveInProgress || executionInProgress || registryMutationInProgress || cadMutationInProgress) throw new Error('Conclua a operação atual antes de salvar o fluxo.');
    saveInProgress = true;
    const root = requireWorkspace();
    try { return await core.saveFlow(root, flow, expectedRevision); }
    finally { saveInProgress = false; }
  });
  register('validateFlow', async flow => core.validateFlow(flow,{
    projects:await core.listProjects(catalogDataRoot),
    extensions:workspaceRoot ? await core.extensionSnapshot(catalogDataRoot,workspaceRoot):[]
  }));
  register('cancelFlow', () => {
    if (!executionInProgress || !activeRunController || activeRunController.signal.aborted) return false;
    activeRunController.abort();
    return true;
  });
  register('executeFlow', async (flow, dryRun) => {
    if (typeof dryRun !== 'boolean') throw new Error('Modo de execução inválido.');
    if (executionInProgress) throw new Error('Já existe um fluxo em execução.');
    executionInProgress = true;
    activeRunController = new AbortController();
    try {
      const root = requireWorkspace();
      let networkApproved = false;
      const projects = await core.listProjects(catalogDataRoot);
      const extensions = await core.extensionSnapshot(catalogDataRoot,root);
      if (!dryRun && core.validateFlow(flow, { projects, extensions }).valid) {
        const requests = [...core.summarizeLocalHttpNodes(flow), ...core.summarizeProjectCalls(flow, projects)];
        if (requests.length) {
          const destinations = requests.map(request => `${request.project ? request.project + ' / ' : ''}${request.method} ${request.destination}`).join('\n').slice(0, 1600);
          const answer = await dialog.showMessageBox(mainWindow, {
            type: 'warning', title: 'Autorizar API local',
            message: 'Este fluxo fará requisições HTTP reais.',
            detail: `Serviços locais acessados:\n${destinations}\n\nA operação pode modificar dados em outros projetos.`,
            buttons: ['Cancelar', 'Autorizar esta execução'], defaultId: 0, cancelId: 0, noLink: true
          });
          if (answer.response !== 1) throw new Error('Requisição HTTP cancelada pelo usuário.');
          networkApproved = true;
        }
      }
      const result = await core.runSupervisedFlow(flow,
        { workspace: root, dryRun, networkApproved, projects, extensions },
        { signal: activeRunController.signal, onProgress: step => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('omni:flowProgress', step);
        } }
      );
      try {
        return { ...result, history: await core.recordRunHistory(root, result) };
      } catch {
        return { ...result, history: { saved: false, warning: 'Falha ao salvar histórico; resultado da execução preservado.' } };
      }
    }
    finally {
      executionInProgress = false;
      activeRunController = null;
      if (exitAfterRun) {
        exitAfterRun = false;
        userApprovedExit = true;
        setImmediate(() => app.quit());
      }
    }
  });
  register('openDeveloper', () => shell.openExternal('https://github.com/DragonBlack18'));
}

function configureProtocol() {
  const distDir = path.join(projectRoot, 'dist');
  protocol.handle('omni', request => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'app') return new Response('Not Found', { status: 404 });
      const raw = decodeURIComponent(url.pathname);
      const relative = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
      const absolute = path.resolve(distDir, relative);
      if (!absolute.startsWith(distDir + path.sep)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(absolute).href);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1040, minHeight: 680,
    backgroundColor: '#0c111a', show: false,
    title: 'OmniForge Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });
  // Electron does not display the browser's beforeunload confirmation. Preventing
  // beforeunload in the renderer can trap both Setup and Portable indefinitely.
  // Handle close natively, once, including the system X button and Alt+F4.
  mainWindow.on('close', event => {
    if (userApprovedExit || mainWindow.isDestroyed()) return;
    if (!(hasUnsavedChanges || executionInProgress || saveInProgress || cadMutationInProgress)) return;
    event.preventDefault();
    if (exitPromptOpen) return;
    exitPromptOpen = true;
    const isExecuting = executionInProgress || saveInProgress || cadMutationInProgress;
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Fechar OmniForge Studio',
      message: isExecuting ? 'Há uma operação em andamento.' : 'Existem alterações não salvas.',
      detail: 'Se sair agora, as alterações não salvas serão descartadas. Os dados já gravados continuarão no projeto.',
      buttons: ['Continuar no programa', 'Sair sem salvar'],
      defaultId: 0, cancelId: 0, noLink: true
    }).then(answer => {
      if (answer.response !== 1 || !mainWindow || mainWindow.isDestroyed()) return;
      if (executionInProgress && activeRunController) {
        // The cancellation result is persisted in execution history before exit.
        exitAfterRun = true;
        activeRunController.abort();
      } else {
        userApprovedExit = true;
        app.quit();
      }
    }).catch(() => {}).finally(() => { exitPromptOpen = false; });
  });
  mainWindow.on('closed', () => { scheduleService?.stop(); mainWindow = null; hasUnsavedChanges = false; });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  if (isDevelopment) await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadURL('omni://app/');
}

const firstInstance = app.requestSingleInstanceLock();
if (!firstInstance) app.quit();
else {
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  configureProtocol();
  await initializeIpc();
  await createWindow();
  if(scheduleReady) {
    scheduleService.start();
    powerMonitor.on('suspend',()=>scheduleService?.stop());
    powerMonitor.on('resume',async()=>{
      try {await scheduleService?.onResume();}
      finally {if(scheduleReady) scheduleService?.start();}
    });
  }
}).catch(error => {
  dialog.showErrorBox('Erro ao iniciar OmniForge', String(error.message));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow().then(()=>{ if(scheduleReady) scheduleService?.start(); }); });
}
