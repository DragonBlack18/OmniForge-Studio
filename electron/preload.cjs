'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Never expose ipcRenderer itself: only this explicit method allowlist.
contextBridge.exposeInMainWorld('omni', Object.freeze({
  info: () => ipcRenderer.invoke('omni:info'),
  catalog: () => ipcRenderer.invoke('omni:catalog'),
  selectWorkspace: () => ipcRenderer.invoke('omni:selectWorkspace'),
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
