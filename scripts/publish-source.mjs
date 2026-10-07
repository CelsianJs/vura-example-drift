import { readFile,mkdir,writeFile,lstat } from 'node:fs/promises';
import { dirname,join } from 'node:path';
const paths=['README.md','API.md','BUILD.md','db/001.sql','db/002.sql','src/lib/store.js','src/lib/security.js','src/lib/service.js','src/lib/domain.js','src/lib/fixtures.js','src/api/_hooks.ts','src/api/health.ts','src/api/session.ts','src/api/snapshot.ts','src/api/items/[id].ts','src/client/App.jsx','src/pages/build.tsx'];
if (JSON.parse(await readFile('package.json','utf8')).name==='vura-example-drift') paths.push('src/lib/events.js','src/api/events.ts');
for(const path of paths){
 if((await lstat(path)).isSymbolicLink())throw Error('Public teaching source may not be a symlink.');
 const destination=join('public','source',path+'.txt');
 await mkdir(dirname(destination),{recursive:true});
 await writeFile(destination,await readFile(path,'utf8'));
}
console.log('Generated '+paths.length+' allowlisted public source files; env files are never read.');
