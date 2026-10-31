const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getHardwareId: () => ipcRenderer.invoke('get-hardware-id'),
  detectAdobe: () => ipcRenderer.invoke('detect-adobe'),
  getInstalledExtensions: () => ipcRenderer.invoke('get-installed-extensions'),
  installExtension: (payload) => ipcRenderer.invoke('install-extension', payload),
  downloadAndInstallExtension: (payload) => ipcRenderer.invoke('download-and-install-extension', payload),
  uninstallExtension: (payload) => ipcRenderer.invoke('uninstall-extension', payload),
  openExtensionFolder: (payload) => ipcRenderer.invoke('open-extension-folder', payload),
  openAdobeApp: (payload) => ipcRenderer.invoke('open-adobe-app', payload),
  enablePlayerDebug: () => ipcRenderer.invoke('enable-player-debug'),
  updateBridgeState: (state) => ipcRenderer.invoke('update-bridge-state', state),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),

  // Session & Access Guard APIs
  setAuthSession: (session) => ipcRenderer.invoke('set-auth-session', session),
  clearAuthSession: () => ipcRenderer.invoke('clear-auth-session'),
  getAuthSession: () => ipcRenderer.invoke('get-auth-session'),

  // Web-based Authentication (OAuth 2.0 PKCE & Custom Protocol)
  startWebAuth: () => ipcRenderer.invoke('start-web-auth'),
  cancelWebAuth: () => ipcRenderer.invoke('cancel-web-auth'),
  onOAuthCallback: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('oauth-callback-received', handler);
    return () => ipcRenderer.removeListener('oauth-callback-received', handler);
  },

  // Secure API Proxy to cathouse.gt.tc
  apiCall: (payload) => ipcRenderer.invoke('api-call', payload),

  // Auto Updater & Patch System APIs
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: (opts) => ipcRenderer.invoke('check-for-updates', opts),
  downloadUpdate: (release) => ipcRenderer.invoke('download-update', release),
  installUpdate: (payload) => ipcRenderer.invoke('install-update', payload),
  onDownloadProgress: (callback) => {
    const handler = (event, progress) => callback(progress);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },

  // Patch Installer APIs (v1.1.2)
  checkPatchUpdate: (opts) => ipcRenderer.invoke('check-patch-update', opts),
  downloadPatchUpdate: (patch) => ipcRenderer.invoke('download-patch-update', patch),
  applyPatchUpdate: (payload) => ipcRenderer.invoke('apply-patch-update', payload)
});
