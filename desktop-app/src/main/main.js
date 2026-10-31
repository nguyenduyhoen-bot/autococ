const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const LocalBridgeServer = require('./bridge');
const { getMachineFingerprint } = require('./hardwareId');
const { detectAdobeApplications } = require('./adobeDetector');
const {
  getCepDirectory,
  getInstalledExtensions,
  installExtensionFromDir,
  installExtensionFromZip,
  uninstallExtension,
  enablePlayerDebugMode
} = require('./extensionInstaller');
const autoUpdater = require('./autoUpdater');
const patchInstaller = require('./patchInstaller');

// Remove Default Electron Application Menu (Section 2.3)
Menu.setApplicationMenu(null);

let mainWindow = null;
let bridgeServer = null;
let authLoopbackServer = null;
let currentPendingAuth = null;

// Register custom protocol for Windows & macOS (Section 1.2)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('catmanager', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('catmanager');
}

// Cache InfinityFree Anti-Bot __test cookie
let ifCookie = null;
const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function resolveInfinityFreeCookie(baseUrl = 'https://cathouse.gt.tc') {
  if (ifCookie) return ifCookie;
  try {
    const initRes = await fetch(`${baseUrl}/`, { headers: { 'User-Agent': ua } });
    const text = await initRes.text();
    if (text.includes('slowAES.decrypt')) {
      const regex = /toNumbers\("([0-9a-f]+)"\)/g;
      const matches = [...text.matchAll(regex)].map(m => m[1]);
      if (matches.length >= 3) {
        const key = Buffer.from(matches[0], 'hex');
        const iv = Buffer.from(matches[1], 'hex');
        const cipher = Buffer.from(matches[2], 'hex');
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        decipher.setAutoPadding(false);
        ifCookie = Buffer.concat([decipher.update(cipher), decipher.final()]).toString('hex');
      }
    }
  } catch (err) {
    console.warn('[InfinityFreeCookie] Notice:', err.message);
  }
  return ifCookie;
}

function handleDeepLink(urlStr) {
  if (!urlStr || !urlStr.startsWith('catmanager://')) return;
  try {
    const parsed = new URL(urlStr);
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');

    if (code && state && mainWindow && !mainWindow.isDestroyed()) {
      console.log(`[OAuth DeepLink] Nhận mã ủy quyền từ protocol: state=${state}`);
      mainWindow.webContents.send('oauth-callback-received', { code, state });
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (e) {
    console.warn('[OAuth DeepLink] Lỗi parse deep link:', e.message);
  }
}

// Single instance lock to catch deep link callbacks on Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const deepLinkUrl = commandLine.find(arg => arg.startsWith('catmanager://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });
}

// macOS open-url event
app.on('open-url', (event, urlStr) => {
  event.preventDefault();
  handleDeepLink(urlStr);
});

function createWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../../build/icon.ico')
    : path.join(__dirname, '../../build/icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#07090e',
    title: 'CAT Product Manager',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true, // Hide menu bar
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // In production, load the built index.html; in dev, load Vite or localhost
  const distHtml = path.join(__dirname, '../../dist/index.html');
  if (fs.existsSync(distHtml)) {
    mainWindow.loadFile(distHtml);
  } else {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(__dirname, '../renderer/fallback.html')).catch(() => {});
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // 1. Automatically enable Adobe PlayerDebugMode
  enablePlayerDebugMode();

  // 2. Start Local Loopback Bridge for Adobe CEP extensions
  bridgeServer = new LocalBridgeServer(48123);
  await bridgeServer.start();

  // 3. Setup IPC Handlers
  ipcMain.handle('get-hardware-id', () => {
    return getMachineFingerprint();
  });

  ipcMain.handle('detect-adobe', () => {
    return detectAdobeApplications();
  });

  ipcMain.handle('get-installed-extensions', () => {
    return getInstalledExtensions();
  });

  // =========================================================================
  // APPLICATION-LEVEL AUTHENTICATION GUARD & SESSION STATE (Section 3)
  // =========================================================================
  let authenticatedSession = null; // { user, token, license, sessionId }

  ipcMain.handle('set-auth-session', (event, session) => {
    authenticatedSession = session;
    console.log(`[Main Guard] Kích hoạt phiên đăng nhập người dùng: ${session?.user?.email || 'Authenticated'}`);
    return { success: true };
  });

  ipcMain.handle('clear-auth-session', () => {
    console.log(`[Main Guard] Đã thu hồi toàn bộ quyền truy cập và xóa sạch phiên đăng nhập`);
    authenticatedSession = null;
    if (bridgeServer) {
      bridgeServer.updateState({
        isLicensed: false,
        licenseKey: null,
        plan: 'none',
        allowedExtensions: [],
        aiConfig: null
      });
    }
    return { success: true };
  });

  ipcMain.handle('get-auth-session', () => {
    return authenticatedSession;
  });

  const checkAuthGuard = () => {
    if (!authenticatedSession || !authenticatedSession.token) {
      throw new Error('Quyền truy cập bị từ chối: Bắt buộc đăng nhập tài khoản CAT Manager.');
    }
  };

  // =========================================================================
  // WEB-BASED AUTHENTICATION (OAUTH 2.0 PKCE & DUAL CALLBACK: PROTOCOL + LOOPBACK)
  // =========================================================================
  ipcMain.handle('start-web-auth', async () => {
    // 1. Generate code_verifier (43-128 chars base64url)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    // 2. Generate code_challenge = base64url(sha256(verifier))
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    // 3. State token (CSRF defense)
    const state = crypto.randomBytes(16).toString('hex');
    const port = 48124;

    currentPendingAuth = { codeVerifier, state };

    // Close any prior loopback listener
    if (authLoopbackServer) {
      try { authLoopbackServer.close(); } catch (_) {}
      authLoopbackServer = null;
    }

    // Start local loopback server to guarantee 100% callback delivery even if protocol prompt is blocked
    authLoopbackServer = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url, `http://127.0.0.1:${port}`);
        if (parsedUrl.pathname === '/auth-callback') {
          const code = parsedUrl.searchParams.get('code');
          const returnedState = parsedUrl.searchParams.get('state');

          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>CAT Manager - Xác thực Thành công</title>
              <style>
                body { background: #07090e; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #0d1117; border: 1px solid #10b98155; padding: 40px; border-radius: 24px; text-align: center; max-width: 440px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7); }
                .icon { width: 56px; height: 56px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 16px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
                h2 { color: #10b981; margin: 0 0 12px; font-size: 22px; font-weight: 800; }
                p { font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0 0 20px; }
                .btn { display: inline-block; background: #10b981; color: #000; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 12px; text-decoration: none; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">🐾</div>
                <h2>Xác thực Thành công!</h2>
                <p>Phiên đăng nhập Website đã được chuyển an toàn về ứng dụng <strong>CAT Manager Desktop</strong>.</p>
                <p>Bạn có thể đóng tab này và tiếp tục sáng tạo trong ứng dụng.</p>
              </div>
            </body>
            </html>
          `);

          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log(`[OAuth Loopback] Nhận mã ủy quyền qua 127.0.0.1:${port}`);
            mainWindow.webContents.send('oauth-callback-received', { code, state: returnedState });
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
          }

          setTimeout(() => {
            if (authLoopbackServer) {
              try { authLoopbackServer.close(); } catch (_) {}
              authLoopbackServer = null;
            }
          }, 1000);
        }
      } catch (err) {
        console.warn('[Loopback Server] Error:', err.message);
      }
    });

    authLoopbackServer.listen(port, '127.0.0.1');

    // Open user's default browser to website login
    const targetUrl = `https://cathouse.gt.tc/?auth=desktop&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&port=${port}`;
    console.log(`[WebAuth] Mở trình duyệt mặc định: ${targetUrl}`);
    shell.openExternal(targetUrl);

    return {
      success: true,
      state,
      codeVerifier,
      targetUrl
    };
  });

  ipcMain.handle('cancel-web-auth', () => {
    if (authLoopbackServer) {
      try { authLoopbackServer.close(); } catch (_) {}
      authLoopbackServer = null;
    }
    currentPendingAuth = null;
    return { success: true };
  });

  // Online Install & Update Extension with Auth & SHA-256 verification
  ipcMain.handle('download-and-install-extension', async (event, { slug, version, checksumSha256, token }) => {
    try {
      checkAuthGuard();
      const baseUrl = 'https://cathouse.gt.tc';
      const cookie = await resolveInfinityFreeCookie(baseUrl);
      const targetVer = version || '1.0.0';
      const activeToken = token || authenticatedSession?.token;
      const downloadUrl = `${baseUrl}/api/v1/extensions/download/${slug}/${targetVer}`;

      const headers = {
        'User-Agent': ua,
        'Authorization': `Bearer ${activeToken}`,
        ...(cookie ? { 'Cookie': `__test=${cookie}` } : {})
      };

      const tempZip = path.join(os.tmpdir(), `cat_ext_${slug}_${targetVer}_${Date.now()}.zip`);
      let downloadedSuccessfully = false;

      try {
        const res = await fetch(downloadUrl, { headers });
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          fs.writeFileSync(tempZip, Buffer.from(buffer));
          downloadedSuccessfully = true;
        }
      } catch (netErr) {
        console.warn(`Online download warning: ${netErr.message}`);
      }

      if (downloadedSuccessfully && fs.existsSync(tempZip) && fs.statSync(tempZip).size > 1000) {
        const result = installExtensionFromZip(slug, tempZip, checksumSha256);
        try { fs.unlinkSync(tempZip); } catch (_) {}
        return result;
      }

      const candidates = [
        path.join(process.resourcesPath || '', 'extensions', slug),
        path.resolve(__dirname, '../../../extensions', slug),
        path.resolve(__dirname, '../../extensions', slug)
      ];
      let src = null;
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          src = c;
          break;
        }
      }

      if (src && fs.existsSync(src)) {
        return installExtensionFromDir(slug, src);
      }

      throw new Error(`Không thể tải Extension từ server và không tìm thấy bản cài đặt dự phòng cục bộ`);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('install-extension', async (event, { slug, sourceDir }) => {
    try {
      checkAuthGuard();
      let src = sourceDir;
      if (!src) {
        const candidates = [
          path.join(process.resourcesPath || '', 'extensions', slug),
          path.resolve(__dirname, '../../../extensions', slug),
          path.resolve(__dirname, '../../extensions', slug)
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            src = c;
            break;
          }
        }
      }

      if (!src || !fs.existsSync(src)) {
        return { success: false, error: `Không tìm thấy thư mục mã nguồn Extension ${slug}` };
      }

      return installExtensionFromDir(slug, src);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('uninstall-extension', async (event, { slug }) => {
    try {
      checkAuthGuard();
      return uninstallExtension(slug);
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-extension-folder', async (event, { slug }) => {
    try {
      checkAuthGuard();
      const cepDir = getCepDirectory();
      const folderName = slug === 'cat-prime' ? 'com.cat.prime' : 'com.cat.af';
      const targetDir = path.join(cepDir, folderName);
      if (fs.existsSync(targetDir)) {
        shell.openPath(targetDir);
        return { success: true };
      }
      shell.openPath(cepDir);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-adobe-app', async (event, { appName }) => {
    try {
      checkAuthGuard();
      const adobe = detectAdobeApplications();
      const appInfo = appName === 'premiere' ? adobe.premiere : adobe.afterEffects;
      if (appInfo && appInfo.path && fs.existsSync(appInfo.path)) {
        shell.openPath(appInfo.path);
        return { success: true, message: `Đang khởi chạy ${appName === 'premiere' ? 'Adobe Premiere Pro' : 'Adobe After Effects'}...` };
      }
      return { success: false, message: `Không tìm thấy ứng dụng ${appName} trên thiết bị` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('enable-player-debug', () => {
    return enablePlayerDebugMode();
  });

  ipcMain.handle('update-bridge-state', (event, state) => {
    try {
      checkAuthGuard();
      if (bridgeServer) {
        bridgeServer.updateState(state);
        return { success: true };
      }
      return { success: false };
    } catch (err) {
      if (bridgeServer) {
        bridgeServer.updateState({ isLicensed: false, licenseKey: null, aiConfig: null });
      }
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-url', (event, url) => {
    shell.openExternal(url);
    return true;
  });

  // Secure API proxy to cathouse.gt.tc bypassing CORS & InfinityFree cookie challenge
  ipcMain.handle('api-call', async (event, { endpoint, method = 'GET', body = null, token = null }) => {
    const baseUrl = 'https://cathouse.gt.tc';
    const cookie = await resolveInfinityFreeCookie(baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': ua,
      ...(cookie ? { 'Cookie': `__test=${cookie}` } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    let targetUrl = endpoint;
    if (!targetUrl.startsWith('http')) {
      const cleanEp = endpoint.replace(/^\//, '');
      targetUrl = cleanEp.startsWith('api/') 
        ? `${baseUrl}/${cleanEp}` 
        : `${baseUrl}/api/v1/${cleanEp}`;
    }

    try {
      const res = await fetch(targetUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        return { ok: res.ok, status: res.status, data };
      } catch (_) {
        return { ok: res.ok, status: res.status, raw: text };
      }
    } catch (err) {
      return { ok: false, status: 500, error: err.message };
    }
  });

  // Dynamic App Version (Section 6)
  ipcMain.handle('get-app-version', () => {
    try {
      if (app && typeof app.getVersion === 'function') {
        const v = app.getVersion();
        if (v && v !== '1.0.0') return v;
      }
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
      return pkg.version || '1.1.4';
    } catch (_) {
      return '1.1.4';
    }
  });

  ipcMain.handle('check-for-updates', async (event, customOpts = {}) => {
    let currentVer = customOpts.currentVersion;
    if (!currentVer) {
      try {
        currentVer = app && typeof app.getVersion === 'function' ? app.getVersion() : null;
      } catch (_) {}
      if (!currentVer) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
          currentVer = pkg.version;
        } catch (_) {}
      }
    }
    return await autoUpdater.checkForUpdates({
      currentVersion: currentVer || '1.1.4',
      platform: customOpts.platform || (process.platform === 'win32' ? 'windows' : 'macos'),
      arch: customOpts.arch || (process.arch === 'arm64' ? 'arm64' : 'x64'),
      token: customOpts.token
    });
  });

  ipcMain.handle('download-update', async (event, release) => {
    try {
      const res = await autoUpdater.downloadUpdate(release, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', progress);
        }
      });
      return res;
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('install-update', async (event, { filePath, platform }) => {
    try {
      return await autoUpdater.installAndRestart({ filePath, platform });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // =========================================================================
  // PATCH INSTALLER IPC HANDLERS (Sections 5, 6, 7, 10)
  // =========================================================================
  ipcMain.handle('check-patch-update', async (event, opts = {}) => {
    return await patchInstaller.checkForPatches({
      currentVersion: opts.currentVersion || (typeof app.getVersion === 'function' ? app.getVersion() : '1.1.4'),
      platform: opts.platform,
      arch: opts.arch
    });
  });

  ipcMain.handle('download-patch-update', async (event, patch) => {
    try {
      return await patchInstaller.downloadAndVerifyPatch(patch, (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', progress);
        }
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('apply-patch-update', async (event, { patchFilePath }) => {
    try {
      return await patchInstaller.applyPatch({ patchFilePath });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (bridgeServer) {
    bridgeServer.stop();
  }
  if (authLoopbackServer) {
    try { authLoopbackServer.close(); } catch (_) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
