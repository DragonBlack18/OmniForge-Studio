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
let saveInProgress = false;
let registryMutationInProgress = false;
let activeProjectId = null;
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
  register('catalog', () => core.NODE_CATALOG);
  const catalogDataRoot = app.getPath('userData');
  const ensureIdle = () => {
    if (saveInProgress || executionInProgress || registryMutationInProgress) throw new Error('Conclua a operação atual antes de trocar ou cadastrar projetos.');
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
  register('saveFile', (relative, content, expectedRevision) => core.saveProjectFile(requireWorkspace(), relative, content, expectedRevision));
  register('saveFlow', async (flow, expectedRevision) => {
    if (saveInProgress) throw new Error('Uma gravação de fluxo já está em andamento.');
    saveInProgress = true;
    const root = requireWorkspace();
    try { return await core.saveFlow(root, flow, expectedRevision); }
    finally { saveInProgress = false; }
  });
  register('validateFlow', flow => core.validateFlow(flow));
  register('executeFlow', async (flow, dryRun) => {
    if (typeof dryRun !== 'boolean') throw new Error('Modo de execução inválido.');
    if (executionInProgress) throw new Error('Já existe um fluxo em execução.');
    executionInProgress = true;
    const root = requireWorkspace();
    try {
      let networkApproved = false;
      if (!dryRun && core.validateFlow(flow).valid) {
        const requests = core.summarizeLocalHttpNodes(flow);
        if (requests.length) {
          const destinations = requests.map(request => `${request.method} ${request.destination}`).join('\n').slice(0, 1600);
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
      const result = await core.runFlow(flow, { workspace: root, dryRun, networkApproved });
      try {
        return { ...result, history: await core.recordRunHistory(root, result) };
      } catch {
        return { ...result, history: { saved: false, warning: 'Falha ao salvar histórico; resultado da execução preservado.' } };
      }
    }
    finally { executionInProgress = false; }
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
