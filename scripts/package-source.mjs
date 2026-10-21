import {readFile,readdir,lstat,mkdir,writeFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {zip} from './zip.mjs';
const pkg=JSON.parse(await readFile('package.json','utf8'));
// This allowlist deliberately excludes browser/desktop profiles, test records, caches and credentials.
const roots=['dist','desktop','assets','tests','scripts','.github'];
const files=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','electron-builder.yml','.gitignore','LICENSE','README.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','THIRD_PARTY_NOTICES.md','server.mjs','start.ps1','启动Skill仓库.cmd','启动Skill仓.cmd','previews/home-v1.1.jpg','previews/register-v1.1.jpg'];
async function collect(folder){
  for(const name of (await readdir(folder)).sort()){
    const path=join(folder,name),stat=await lstat(path);
    if(stat.isSymbolicLink())throw new Error('Source archive refuses symlink: '+path);
    if(stat.isDirectory())await collect(path);else if(stat.isFile())files.push(path.replaceAll('\\','/'));
  }
}
for(const root of roots)await collect(root);
const name=`SkillVault-${pkg.version}-source`,stage=resolve('open-source',name),entries=[];
for(const path of [...new Set(files)].sort()){
  if(/(^|\/)(?:\.git|\.qa|\.cache|node_modules|release)(\/|$)|(^|\/)\.env|\.(?:pem|key|pfx|p12)$/i.test(path))throw new Error('Unexpected private path: '+path);
  const bytes=await readFile(path),target=join(stage,path);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
  entries.push({name:`${name}/${path}`,bytes});
}
await mkdir('release',{recursive:true});
const archive=resolve('release',`${name}.zip`);await writeFile(archive,zip(entries));
console.log(JSON.stringify({archive,sourceDirectory:stage,files:entries.length,containsPersonalData:false}));
