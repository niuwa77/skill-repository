const { app, BrowserWindow, Menu, protocol, session, shell, dialog } = require('electron');
const { join, resolve } = require('node:path');
const { readFile } = require('node:fs/promises');
const { CSP, isAppURL, externalURL, resolveAsset } = require('./policy.cjs');

const smoke = process.argv.includes('--smoke-test');
// Smoke tests use an explicitly isolated directory, never the person's real data.
if (smoke && !process.env.SKILL_VAULT_TEST_DATA_DIR) throw new Error('Smoke tests require SKILL_VAULT_TEST_DATA_DIR.');
app.setName('Skill仓库');
app.setPath('userData', smoke ? resolve(process.env.SKILL_VAULT_TEST_DATA_DIR) : join(app.getPath('appData'), 'SkillVault'));
app.setAppUserModelId('io.github.niuwa77.skillvault');
protocol.registerSchemesAsPrivileged([{ scheme: 'skillvault', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let mainWindow;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) {if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus();} });
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    protocol.handle('skillvault', async request => {
      const asset = resolveAsset(request.url);
      if (!asset) return new Response('Not found', { status: 404 });
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      try {
        const body = await readFile(join(app.getAppPath(), 'dist', asset[0]));
        return new Response(request.method === 'HEAD' ? null : body, { headers: {
          'Content-Type': asset[1], 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
        } });
      } catch { return new Response('Unable to open application asset', { status: 500 }); }
    });
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((contents, permission, callback, details) => callback(
      isAppURL(contents?.getURL() || '') && isAppURL(details?.requestingUrl || contents.getURL()) && permission === 'clipboard-sanitized-write'
    ));
    ses.setPermissionCheckHandler((_contents, permission, origin) => isAppURL(origin) && permission === 'clipboard-sanitized-write');
    // No application page makes requests to the internet. Links are opened by the OS browser.
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
    ses.on('will-download', (event, item) => {
      if (!item.getURL().startsWith('blob:skillvault://app/') || !item.getFilename().endsWith('.json')) {event.preventDefault(); return;}
      item.setSaveDialogOptions({ title: '保存 Skill仓库 备份', defaultPath: join(app.getPath('downloads'), item.getFilename()), filters: [{name: 'JSON 备份', extensions: ['json']}] });
    });
    await createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch(error => {
    if (smoke) {console.error(error.stack); app.exit(1);}
    else {dialog.showErrorBox('Skill仓库启动失败', error.message); app.quit();}
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320, height: 900, minWidth: 800, minHeight: 620,
    backgroundColor: '#f5d675', title: 'Skill仓库', show: false,
    icon: join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, devTools: !app.isPackaged },
  });
  const contents = mainWindow.webContents;
  contents.on('page-title-updated', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({url}) => {
    const safe = externalURL(url);
    if (safe) shell.openExternal(safe).catch(error => dialog.showErrorBox('无法打开链接',error.message));
    return {action:'deny'};
  });
  contents.on('will-navigate', (event, url) => {
    if (isAppURL(url)) return;
    event.preventDefault();
    const safe = externalURL(url);
    if (safe) shell.openExternal(safe).catch(error => dialog.showErrorBox('无法打开链接',error.message));
  });
  let closing = false;
  mainWindow.on('close', event => {
    if (closing || smoke || contents.isDestroyed()) return;
    event.preventDefault();
    // Let any just-submitted IndexedDB transaction finish before quitting.
    contents.executeJavaScript(`new Promise(resolve => {
      let tries = 0; const check = () => {
        if (!document.body.classList.contains('saving') || ++tries > 100) resolve();
        else setTimeout(check, 50);
      }; check();
    })`).catch(() => {}).finally(() => {
      sesFlush(); closing = true; if (!mainWindow.isDestroyed()) mainWindow.close();
    });
  });
  await mainWindow.loadURL('skillvault://app/');
  if (smoke) {
    await require('./smoke.cjs').runSmoke(mainWindow);
    sesFlush(); app.exit(0);
  } else mainWindow.show();
}
function sesFlush() { session.defaultSession.flushStorageData(); }
