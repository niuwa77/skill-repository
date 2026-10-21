// Executed only with --smoke-test and an explicit, isolated test data directory.
const { app } = require('electron');
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const { join, dirname, resolve } = require('node:path');
const assert = require('node:assert/strict');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(contents, script) {
  for (let attempt = 0; attempt < 150; attempt++) { if (await contents.executeJavaScript(script)) return; await wait(100); }
  throw new Error('Timed out waiting for the desktop app.');
}
async function runSmoke(window) {
  const contents = window.webContents;
  const output = resolve(process.env.SKILL_VAULT_TEST_OUTPUT || join(process.env.SKILL_VAULT_TEST_DATA_DIR,'result.json'));
  const mode = process.env.SKILL_VAULT_TEST_MODE || 'read';
  const errors = [];
  contents.on('console-message', (_event, level, message) => {if (level === 3) errors.push(message);});
  await until(contents, "document.querySelectorAll('.category-card').length === 6");
  const baseline = await contents.executeJavaScript(`({
    title: document.querySelector('.brand').innerText,
    categories: [...document.querySelectorAll('.card-bottom strong')].map(e=>e.textContent),
    rendererHasNode: typeof process !== 'undefined' || typeof require !== 'undefined',
    secure: isSecureContext, overflow: document.documentElement.scrollWidth > innerWidth
  })`);
  assert.equal(baseline.rendererHasNode,false); assert.equal(baseline.secure,true); assert.equal(baseline.overflow,false);
  assert.deepEqual(baseline.categories,['写作内容','图像设计','视频音频','办公文档','网站应用','其他']);
  if (mode === 'write') {
    await contents.executeJavaScript(`document.querySelector('[data-action="new"]').click();
      const f=document.querySelector('#skill-form'); f.elements.name.value='桌面验收 skill';
      f.elements.link.value='https://example.com/skill'; f.elements.notes.value='持久化检查：中文备注';
      f.querySelector('[value="cat-writing"]').checked=true; f.requestSubmit();`);
    await until(contents,"!document.querySelector('#modal').open && document.body.innerText.includes('你的 1 个 skill')");
  }
  const saved = await contents.executeJavaScript(`new Promise((resolve,reject)=>{
    const request=indexedDB.open('skill-vault-local',1);
    request.onsuccess=()=>{const db=request.result; const get=db.transaction('vault','readonly').objectStore('vault').get('state');
      get.onsuccess=()=>{resolve(get.result);db.close();};get.onerror=()=>reject(get.error);};request.onerror=()=>reject(request.error);
  })`);
  assert.equal(saved.skills.length,1); assert.equal(saved.skills[0].name,'桌面验收 skill');
  assert.equal(saved.skills[0].link,'https://example.com/skill'); assert.equal(saved.skills[0].notes,'持久化检查：中文备注');
  assert.deepEqual(saved.skills[0].categoryIds,['cat-writing']);
  let backup = false;
  if (mode === 'read') {
    const backupPath = join(dirname(output),'smoke-backup.json');
    await mkdir(dirname(output),{recursive:true});
    const downloaded = new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Backup download did not finish.')),15000);
      contents.session.once('will-download',(_event,item)=>{item.setSavePath(backupPath);item.once('done',(_event,state)=>{clearTimeout(timeout);state==='completed'?resolve():reject(new Error('Download '+state));});});
    });
    await contents.executeJavaScript(`location.hash='settings'`);
    await until(contents,`!!document.querySelector('[data-action="export"]')`);
    await contents.executeJavaScript(`document.querySelector('[data-action="export"]').click()`);
    await downloaded;
    const data=JSON.parse(await readFile(backupPath,'utf8'));
    assert.equal(data.data.skills[0].link,'https://example.com/skill'); backup=true;
  }
  const screenshot = await contents.capturePage();
  await mkdir(dirname(output),{recursive:true});
  await writeFile(join(dirname(output),`desktop-${mode}.png`),screenshot.toPNG());
  assert.deepEqual(errors,[]);
  const report={ok:true,mode,packaged:app.isPackaged,version:app.getVersion(),categories:baseline.categories,rendererHasNode:baseline.rendererHasNode,secureContext:baseline.secure,persistedRecords:saved.skills.length,backupDownloaded:backup};
  await writeFile(output,JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
}
module.exports={runSmoke};
