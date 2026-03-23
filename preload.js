const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('daftrly', {
  // Settings
  getSettings: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

  // Database
  query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
  transaction: (queries) => ipcRenderer.invoke('db:transaction', queries),
  nextSequence: (name) => ipcRenderer.invoke('db:nextSequence', name),
  nextTicket: () => ipcRenderer.invoke('db:nextTicket'),

  // Excel import/export
  downloadTemplate: () => ipcRenderer.invoke('excel:downloadTemplate'),
  readExcelFile: () => ipcRenderer.invoke('excel:readFile'),
  exportProducts: () => ipcRenderer.invoke('excel:exportProducts'),
  exportSales: (from, to) => ipcRenderer.invoke('excel:exportSales', from, to),
  exportReport: (data) => ipcRenderer.invoke('excel:exportReport', data),

  // QR Code
  generateQR: (data) => ipcRenderer.invoke('qr:generate', data),

  // ZATCA Phase 2
  zatcaOnboard: (otp) => ipcRenderer.invoke('zatca:onboard', otp),
  zatcaGetStatus: () => ipcRenderer.invoke('zatca:getStatus'),
  zatcaReportInvoice: (data) => ipcRenderer.invoke('zatca:reportInvoice', data),
  zatcaClearInvoice: (data) => ipcRenderer.invoke('zatca:clearInvoice', data),
  zatcaProcessQueue: () => ipcRenderer.invoke('zatca:processQueue'),

  // Backup
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  getDbSize: () => ipcRenderer.invoke('db:size'),
  getLastBackupDate: () => ipcRenderer.invoke('backup:lastDate'),
  exportRecords: (from, to) => ipcRenderer.invoke('backup:exportRecords', from, to),

  // Printer (ESC/POS over network)
  printerSend: (ip, port, command) => ipcRenderer.invoke('printer:send', ip, port, command),
  printThermalReceipt: (data) => ipcRenderer.invoke('printer:printReceipt', data),
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  printUSB: (printerName, html, paperWidth) => ipcRenderer.invoke('printer:printUSB', printerName, html, paperWidth),
  printPreview: (html, paperWidth) => ipcRenderer.invoke('printer:printPreview', html, paperWidth),

  // Customer Display
  openDisplay: (screenIndex) => ipcRenderer.invoke('display:open', screenIndex),
  updateDisplay: (data) => ipcRenderer.invoke('display:update', data),
  closeDisplay: () => ipcRenderer.invoke('display:close'),
  getScreens: () => ipcRenderer.invoke('display:screens'),

  // Network scan
  scanNetwork: (port, timeout) => ipcRenderer.invoke('network:scan', port, timeout),

  testTerminal: (url) => ipcRenderer.invoke('terminal:test', url),
  sendTerminalPayment: (url, amount, invoiceNumber, timeout) => ipcRenderer.invoke('terminal:pay', url, amount, invoiceNumber, timeout),
  sendTerminalRefund: (url, amount, originalRef, timeout) => ipcRenderer.invoke('terminal:refund', url, amount, originalRef, timeout),

  // Kiosk & Auto-start
  setKiosk: (enabled) => ipcRenderer.invoke('app:setKiosk', enabled),
  setAutoStart: (enabled) => ipcRenderer.invoke('app:setAutoStart', enabled),
  setMenu: (isAdmin) => ipcRenderer.invoke('app:setMenu', isAdmin),
  exitApp: () => ipcRenderer.invoke('app:exit'),
  verifyMasterPin: (pin) => ipcRenderer.invoke('auth:verifyMasterPin', pin),

  // App info
  platform: process.platform,
  version: require('./package.json').version,

  // Menu events from main process
  onMenuNav: (callback) => ipcRenderer.on('nav', (e, page) => callback(page)),
  onMenuAction: (callback) => ipcRenderer.on('action', (e, action) => callback(action)),

  // Qoyod Accounting Integration
  qoyodTest: (apiKey) => ipcRenderer.invoke('qoyod:test', apiKey),
  qoyodFetchSetup: (apiKey) => ipcRenderer.invoke('qoyod:fetchSetup', apiKey),
  qoyodApi: (method, path, apiKey, body) => ipcRenderer.invoke('qoyod:api', method, path, apiKey, body),

  // License & Trial
  licenseGetStatus: () => ipcRenderer.invoke('license:getStatus'),
  licenseActivate: (key) => ipcRenderer.invoke('license:activate', key),
  licenseDeactivate: () => ipcRenderer.invoke('license:deactivate'),

  // Open external URL in system browser
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Auto-updater events
  onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (e, version) => callback(version)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update:downloaded', (e, version) => callback(version)),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
