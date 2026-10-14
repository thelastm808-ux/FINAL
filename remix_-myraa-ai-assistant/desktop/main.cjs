const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const readline = require("readline");
const fs = require("fs");

let mainWindow = null;
let tray = null;
let pythonProcess = null;
let backendProcess = null;
let requestId = 0;
const pending = new Map();
const preferenceCache = new Map();

function getPythonCommand() {
  return process.env.MYRAA_PYTHON || process.env.PYTHON || "python";
}

function resolvePythonBridgePath() {
  const basePath = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..");
  return path.join(basePath, "python", "backend", "app.py");
}

function resolveProjectRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..");
}

function resolveServerBundlePath() {
  return path.join(resolveProjectRoot(), "dist", "server.cjs");
}

function startPythonBridge() {
  if (pythonProcess) {
    return pythonProcess;
  }

  const scriptPath = resolvePythonBridgePath();
  pythonProcess = spawn(getPythonCommand(), [scriptPath, "--bridge"], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const rl = readline.createInterface({ input: pythonProcess.stdout });
  rl.on("line", (line) => {
    try {
      const packet = JSON.parse(line);
      if (packet && packet.type === "ready") {
        console.log("[Myraa Desktop] Python bridge ready:", packet.message);
        return;
      }

      if (packet && packet.id && pending.has(packet.id)) {
        const pendingRequest = pending.get(packet.id);
        pending.delete(packet.id);
        if (packet.ok) {
          pendingRequest.resolve(packet.data);
        } else {
          pendingRequest.reject(new Error(packet.error || "Python bridge error"));
        }
      }
    } catch (err) {
      console.error("[Myraa Desktop] Failed to parse bridge response:", err);
    }
  });

  pythonProcess.stderr.on("data", (chunk) => {
    console.error("[Myraa Desktop][Python stderr]", chunk.toString());
  });

  pythonProcess.on("exit", (code) => {
    console.log("[Myraa Desktop] Python bridge exited with code", code);
    pythonProcess = null;
  });

  return pythonProcess;
}

function startBackendServer() {
  if (backendProcess) {
    return backendProcess;
  }

  const serverPath = resolveServerBundlePath();
  const nodeCommand = process.env.MYRAA_NODE || "node";
  backendProcess = spawn(nodeCommand, [serverPath], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });

  backendProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[Myraa Backend] ${chunk}`);
  });

  backendProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[Myraa Backend ERROR] ${chunk}`);
  });

  backendProcess.on("exit", (code) => {
    console.log("[Myraa Desktop] Backend server exited with code", code);
    backendProcess = null;
  });

  return backendProcess;
}

async function waitForHttpReady(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (response.ok) {
        return true;
      }
    } catch (err) {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function bridgeRequest(method, params = {}) {
  startPythonBridge();
  const id = `req_${Date.now()}_${requestId++}`;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    pythonProcess.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
}

function createTray() {
  const iconPath = path.join(resolveProjectRoot(), "assets", "icon.png");
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Myraa");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Myraa", click: () => mainWindow && mainWindow.show() },
    { label: "Quit", click: () => app.quit() },
  ]));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#020205",
    title: "Myraa",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const rendererUrl = process.env.MYRAA_RENDERER_URL || "http://127.0.0.1:3000";
  mainWindow.loadURL(rendererUrl);
}

app.whenReady().then(async () => {
  startBackendServer();
  startPythonBridge();
  try {
    const permissions = await bridgeRequest("permissions.get");
    preferenceCache.set("desktop_permissions", permissions);
  } catch (err) {}
  try {
    await waitForHttpReady("http://127.0.0.1:3000");
  } catch (err) {
    console.error("[Myraa Desktop] Backend UI server did not become ready:", err);
  }
  createTray();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  try {
    if (pythonProcess) {
      pythonProcess.kill();
      pythonProcess = null;
    }
  } catch (err) {}
  try {
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
  } catch (err) {}
});

ipcMain.handle("desktop:get-status", async () => bridgeRequest("runtime.info"));
ipcMain.handle("desktop:get-permissions", async () => bridgeRequest("permissions.get"));
ipcMain.handle("desktop:set-permissions", async (_event, permissions) => {
  preferenceCache.set("desktop_permissions", permissions);
  return bridgeRequest("permissions.set", { permissions });
});
ipcMain.on("desktop:get-preference", (event, payload) => {
  const key = payload?.key;
  if (key && preferenceCache.has(key)) {
    event.returnValue = preferenceCache.get(key);
    return;
  }
  event.returnValue = payload?.fallback;
});
ipcMain.handle("desktop:set-preference", async (_event, payload) => {
  if (payload?.key) {
    preferenceCache.set(payload.key, payload.value);
  }
  return bridgeRequest("preferences.set", payload || {});
});
ipcMain.handle("desktop:start-vision", async () => bridgeRequest("desktop.startVision"));
ipcMain.handle("desktop:stop-vision", async () => bridgeRequest("desktop.stopVision"));
ipcMain.handle("desktop:run-action", async (_event, request) => bridgeRequest("desktop.runAction", request));
ipcMain.handle("desktop:get-database-info", async () => bridgeRequest("database.info"));
ipcMain.handle("desktop:open-external", async (_event, url) => shell.openExternal(url));
