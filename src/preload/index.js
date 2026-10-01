// Runs in the sandboxed window before the UI. The UI gets exactly one function, never
// Node.js or raw IPC access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panda', {
    /** request({ method: 'GET', path: '/accounts?page=2', body }) → { ok, status, data | message } */
    request: (request) => ipcRenderer.invoke('panda:request', request),
    /** onEvent(cb): live events pushed by the main process (heartbeats, kill switch, …). Returns an unsubscribe function. */
    onEvent: (callback) => {
        const listener = (_event, envelope) => callback(envelope);
        ipcRenderer.on('panda:event', listener);
        return () => ipcRenderer.removeListener('panda:event', listener);
    }
});
