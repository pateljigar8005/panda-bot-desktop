// Runs in the sandboxed window before the UI. The UI gets exactly one function, never
// Node.js or raw IPC access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panda', {
    /** request({ method: 'GET', path: '/accounts?page=2', body }) → { ok, status, data | message } */
    request: (request) => ipcRenderer.invoke('panda:request', request)
});
