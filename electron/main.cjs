'use strict';
const { app, BrowserWindow, dialog, ipcMain, protocol, net, shell, session } = require('electron');
const path = require('node:path');
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
let registryMutationInProgress = false;
let cadMutationInProgress = false;
let activeProjectId = null;
let hasUnsavedChanges = false;
let exitPromptOpen = false;
let userApprovedExit = false;
const projectRoot = path.resolve(__dirname, '..');
const isDevelopment = !app.isPackaged && Boolean(process.env.ELECTRON_RENDERER_URL);

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
  register('listFiles', () => core.listProjectFiles(requireWorkspace()));
  register('listRunHistory', () => core.listRunHistory(requireWorkspace()));
  register('readRunHistory', id => core.readRunHistory(requireWorkspace(), id));
  register('readFile', relative => core.readProjectFile(requireWorkspace(), relative));
  register('saveFile', (relative, content, expectedRevision) => {
    if (executionInProgress || cadMutationInProgress || registryMutationInProgress) throw new Error('Conclua a execução antes de salvar arquivos.');
    return core.saveProjectFile(requireWorkspace(), relative, content, expectedRevision);
  });
  register('saveFlow', async (flow, expectedRevision) => {
    if (saveInProgress || executionInProgress || registryMutationInProgress || cadMutationInProgress) throw new Error('Conclua a operação atual antes de salvar o fluxo.');
    saveInProgress = true;
    const root = requireWorkspace();
    try { return await core.saveFlow(root, flow, expectedRevision); }
    finally { saveInProgress = false; }
  });
  register('validateFlow', async flow => core.validateFlow(flow, { projects: await core.listProjects(catalogDataRoot) }));
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
      if (!dryRun && core.validateFlow(flow, { projects }).valid) {
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
        { workspace: root, dryRun, networkApproved, projects },
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
  mainWindow.on('closed', () => { mainWindow = null; hasUnsavedChanges = false; });
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
}).catch(error => {
  dialog.showErrorBox('Erro ao iniciar OmniForge', String(error.message));
  app.quit();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
