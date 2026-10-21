import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
const files=(await readdir('release')).filter(name=>/\.(exe|zip)$/.test(name)).sort();
if(!files.length)throw new Error('No release artifacts found.');
const lines=[];
for(const name of files)lines.push(createHash('sha256').update(await readFile('release/'+name)).digest('hex')+'  '+name);
await writeFile('release/SHA256SUMS.txt',lines.join('\n')+'\n');
console.log('Checksums generated for '+files.length+' release artifacts.');
