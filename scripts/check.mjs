import {readFile, access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(pkg.version))throw new Error('Version must be a stable semver.');
if(pkg.main!=='desktop/main.cjs'||pkg.license!=='MIT')throw new Error('Desktop entry/license mismatch.');
for(const file of ['dist/app.mjs','dist/core.mjs','dist/store.mjs','desktop/main.cjs','desktop/policy.cjs','desktop/smoke.cjs','server.mjs']){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
for(const file of ['assets/icon.ico','assets/icon.png','assets/icon.svg','LICENSE','electron-builder.yml','pnpm-lock.yaml'])await access(file);
console.log(`Skill仓库 ${pkg.version}: source and packaging checks passed.`);
