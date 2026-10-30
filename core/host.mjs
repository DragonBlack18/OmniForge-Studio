/**
 * Minimal Electron host facade. Keep the public core/index.mjs compatibility
 * API unchanged, but avoid loading CAD importers and Git/IDE runtimes merely
 * to show Home or initialize the desktop scheduler.
 *
 * Module loading is intentionally asynchronous and per-capability. The native
 * Electron main process remains the only holder of filesystem authority.
 */
export { NODE_CATALOG } from './modules/automation/catalog.mjs';
export { EXAMPLE_EXTENSION } from './modules/extensions/extension-example.mjs';
export { LocalScheduleEngine, validateScheduledDocument } from './modules/scheduling/schedule-engine.mjs';
export { validateFlow } from './modules/automation/graph.mjs';
export { summarizeLocalHttpNodes } from './modules/integrations/http.mjs';
export { summarizeProjectCalls } from './modules/integrations/capabilities.mjs';

const loaders = Object.freeze({
  cadStore: () => import('./modules/cad/cad-store.mjs'),
  cadFile: () => import('./modules/cad/cad-import-file.mjs'),
  workspace: () => import('./modules/workspace/workspace.mjs'),
  projects: () => import('./modules/workspace/projects.mjs'),
  history: () => import('./modules/workspace/history.mjs'),
  extensions: () => import('./modules/extensions/extension-registry.mjs'),
  scheduleStore: () => import('./modules/scheduling/schedule-store.mjs'),
  git: () => import('./modules/ide/git-control.mjs'),
  ide: () => import('./modules/ide/workspace-ide.mjs'),
  supervisor: () => import('./supervisor.mjs')
});

export const loadCadDocument = (...args) => loaders.cadStore().then(module => module.loadCadDocument(...args));
export const saveCadDocument = (...args) => loaders.cadStore().then(module => module.saveCadDocument(...args));
export const exportCadSketch = (...args) => loaders.cadStore().then(module => module.exportCadSketch(...args));
export const readCadDxfFile = (...args) => loaders.cadFile().then(module => module.readCadDxfFile(...args));
export const readFlowDocument = (...args) => loaders.workspace().then(module => module.readFlowDocument(...args));
export const listProjectFiles = (...args) => loaders.workspace().then(module => module.listProjectFiles(...args));
export const readProjectFile = (...args) => loaders.workspace().then(module => module.readProjectFile(...args));
export const saveProjectFile = (...args) => loaders.workspace().then(module => module.saveProjectFile(...args));
export const saveFlow = (...args) => loaders.workspace().then(module => module.saveFlow(...args));
export const markProjectOpened = (...args) => loaders.projects().then(module => module.markProjectOpened(...args));
export const listProjects = (...args) => loaders.projects().then(module => module.listProjects(...args));
export const registerProject = (...args) => loaders.projects().then(module => module.registerProject(...args));
export const getProject = (...args) => loaders.projects().then(module => module.getProject(...args));
export const registerCapability = (...args) => loaders.projects().then(module => module.registerCapability(...args));
export const forgetCapability = (...args) => loaders.projects().then(module => module.forgetCapability(...args));
export const forgetProject = (...args) => loaders.projects().then(module => module.forgetProject(...args));
export const listRunHistory = (...args) => loaders.history().then(module => module.listRunHistory(...args));
export const readRunHistory = (...args) => loaders.history().then(module => module.readRunHistory(...args));
export const recordRunHistory = (...args) => loaders.history().then(module => module.recordRunHistory(...args));
export const listInstalledExtensions = (...args) => loaders.extensions().then(module => module.listInstalledExtensions(...args));
export const readExtensionFile = (...args) => loaders.extensions().then(module => module.readExtensionFile(...args));
export const installExtension = (...args) => loaders.extensions().then(module => module.installExtension(...args));
export const setExtensionEnabled = (...args) => loaders.extensions().then(module => module.setExtensionEnabled(...args));
export const setExtensionGrant = (...args) => loaders.extensions().then(module => module.setExtensionGrant(...args));
export const removeExtension = (...args) => loaders.extensions().then(module => module.removeExtension(...args));
export const extensionSnapshot = (...args) => loaders.extensions().then(module => module.extensionSnapshot(...args));
export const listSchedules = (...args) => loaders.scheduleStore().then(module => module.listSchedules(...args));
export const createSchedule = (...args) => loaders.scheduleStore().then(module => module.createSchedule(...args));
export const setScheduleEnabled = (...args) => loaders.scheduleStore().then(module => module.setScheduleEnabled(...args));
export const getSchedule = (...args) => loaders.scheduleStore().then(module => module.getSchedule(...args));
export const rebindSchedule = (...args) => loaders.scheduleStore().then(module => module.rebindSchedule(...args));
export const removeSchedule = (...args) => loaders.scheduleStore().then(module => module.removeSchedule(...args));
export const gitWorkspaceStatus = (...args) => loaders.git().then(module => module.gitWorkspaceStatus(...args));
export const gitDiff = (...args) => loaders.git().then(module => module.gitDiff(...args));
export const gitStage = (...args) => loaders.git().then(module => module.gitStage(...args));
export const gitUnstage = (...args) => loaders.git().then(module => module.gitUnstage(...args));
export const gitCommit = (...args) => loaders.git().then(module => module.gitCommit(...args));
export const searchWorkspaceText = (...args) => loaders.ide().then(module => module.searchWorkspaceText(...args));
export const createWorkspaceFile = (...args) => loaders.ide().then(module => module.createWorkspaceFile(...args));
export const createWorkspaceFolder = (...args) => loaders.ide().then(module => module.createWorkspaceFolder(...args));
export const runSupervisedFlow = (...args) => loaders.supervisor().then(module => module.runSupervisedFlow(...args));
