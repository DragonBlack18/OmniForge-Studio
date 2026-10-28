'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Never expose ipcRenderer itself: only this explicit method allowlist.
contextBridge.exposeInMainWorld('omni', Object.freeze({
  info: () => ipcRenderer.invoke('omni:info'),
  setUnsavedChanges: dirty => ipcRenderer.invoke('omni:setUnsavedChanges', dirty),
  requestExit: () => ipcRenderer.invoke('omni:requestExit'),
  catalog: () => ipcRenderer.invoke('omni:catalog'),
  selectWorkspace: () => ipcRenderer.invoke('omni:selectWorkspace'),
  listProjects: () => ipcRenderer.invoke('omni:listProjects'),
  registerProject: () => ipcRenderer.invoke('omni:registerProject'),
  openProject: id => ipcRenderer.invoke('omni:openProject', id),
  forgetProject: id => ipcRenderer.invoke('omni:forgetProject', id),
  registerCapability: (projectId, definition) => ipcRenderer.invoke('omni:registerCapability', projectId, definition),
  forgetCapability: (projectId, capabilityId) => ipcRenderer.invoke('omni:forgetCapability', projectId, capabilityId),
  listFiles: () => ipcRenderer.invoke('omni:listFiles'),
  listRunHistory: () => ipcRenderer.invoke('omni:listRunHistory'),
  readRunHistory: id => ipcRenderer.invoke('omni:readRunHistory', id),
  readFile: relative => ipcRenderer.invoke('omni:readFile', relative),
  saveFile: (relative, content, revision) => ipcRenderer.invoke('omni:saveFile', relative, content, revision),
  saveFlow: (flow, revision) => ipcRenderer.invoke('omni:saveFlow', flow, revision),
  validateFlow: flow => ipcRenderer.invoke('omni:validateFlow', flow),
  executeFlow: (flow, dryRun) => ipcRenderer.invoke('omni:executeFlow', flow, dryRun),
  openDeveloper: () => ipcRenderer.invoke('omni:openDeveloper')
}));
