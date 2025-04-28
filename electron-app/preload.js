const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getSources: (filters) =>
    ipcRenderer.invoke("DESKTOP_CAPTURER_GET_SOURCES", filters),
  sendMouseMove: (data) => ipcRenderer.send("mouse_move", data),
  sendKey: (data) => ipcRenderer.send("key_press", data),
});
