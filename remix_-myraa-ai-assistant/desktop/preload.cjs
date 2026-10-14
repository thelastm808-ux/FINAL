const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("myraaDesktop", {
  getStatus: () => ipcRenderer.invoke("desktop:get-status"),
  getPermissions: () => ipcRenderer.invoke("desktop:get-permissions"),
  setPermissions: (permissions) => ipcRenderer.invoke("desktop:set-permissions", permissions),
  getPreferenceSync: (key, fallback) => ipcRenderer.sendSync("desktop:get-preference", { key, fallback }),
  setPreference: (key, value) => ipcRenderer.invoke("desktop:set-preference", { key, value }),
  startVisionSession: () => ipcRenderer.invoke("desktop:start-vision"),
  stopVisionSession: () => ipcRenderer.invoke("desktop:stop-vision"),
  runDesktopAction: (request) => ipcRenderer.invoke("desktop:run-action", request),
  getLocalDatabaseInfo: () => ipcRenderer.invoke("desktop:get-database-info"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
});
