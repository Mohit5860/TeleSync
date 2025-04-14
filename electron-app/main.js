import { app, BrowserWindow, desktopCapturer, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import {spawn, exec } from "child_process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;

async function handleGetSources(event, filters) {
  try {
    const sources = await desktopCapturer.getSources({ types: filters });
    return sources;
  } catch (err) {
    console.error("Error getting sources:", err);
    return null;
  }
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });


  const py = spawn("python", ["mouse.py"]);
  ipcMain.handle("DESKTOP_CAPTURER_GET_SOURCES", handleGetSources);

  ipcMain.on("mouse_move", (event, { x, y }) => {
    // exec(`python mouse.py ${x} ${y}`, (error, stdout, stderr) => {
    //   if (error) {
    //     console.error(`Error moving mouse: ${error.message}`);
    //     return;
    //   }
    //   if (stderr) {
    //     console.error(`stderr: ${stderr}`);
    //     return;
    //   }
    //   console.log(`Mouse moved to (${x}, ${y}): ${stdout}`);
    // });
    py.stdin.write(`${x},${y}\n`);
    console.log(`Mouse moved to (${x}, ${y})`);
  });

  mainWindow.loadURL("http://localhost:5173");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
