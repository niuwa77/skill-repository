import {spawn} from 'node:child_process';
import {readFile, mkdir, mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const packaged=process.argv[2];
const executable=packaged?resolve(packaged):require('electron');
await mkdir('.qa',{recursive:true});
const root=await mkdtemp(resolve('.qa/desktop-smoke-'));
for(const mode of ['write','read']){
  const output=join(root,`${mode}.json`);
  const args=packaged?['--smoke-test']:['.','--smoke-test'];
  await new Promise((done,fail)=>{
    const child=spawn(executable,args,{windowsHide:true,env:{...process.env,SKILL_VAULT_TEST_DATA_DIR:join(root,'profile'),SKILL_VAULT_TEST_MODE:mode,SKILL_VAULT_TEST_OUTPUT:output},stdio:['ignore','pipe','pipe']});
    let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
    const timer=setTimeout(()=>{child.kill();fail(new Error('Desktop smoke test timed out.\n'+logs));},45000);
    child.on('error',error=>{clearTimeout(timer);fail(error);});
    child.on('close',code=>{clearTimeout(timer);code===0?done():fail(new Error(`Desktop test exited ${code}.\n${logs}`));});
  });
  const report=JSON.parse(await readFile(output,'utf8'));
  if(!report.ok)throw new Error('Desktop test did not pass.');
  console.log(JSON.stringify(report));
}
console.log('Desktop persistence and backup tests passed. Isolated results: '+root);
