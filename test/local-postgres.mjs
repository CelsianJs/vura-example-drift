import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
const exec=promisify(execFile);
function csv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if(ch==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}
 if(cell||row.length){row.push(cell);rows.push(row);}
 const headers=rows.shift()||[];
 return rows.filter(r=>r.length===headers.length).map(r=>Object.fromEntries(r.map((v,i)=>[headers[i],v[0]==='{'||v[0]==='['?JSON.parse(v):v])));
}
export async function localPostgres(){
 const bin=process.env.DEMO_TEST_POSTGRES_BIN||'/opt/homebrew/opt/postgresql@17/bin';
 if(!existsSync(join(bin,'initdb')))return null;
 const scratch=await mkdtemp(join(tmpdir(),'vura-demo-pg-'));
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const data=join(scratch,'data');
 execFileSync(join(bin,'initdb'),['-D',data,'-A','trust','--no-locale','-E','UTF8'],{stdio:'ignore',env:{...process.env,LC_ALL:'C'}});
 execFileSync(join(bin,'pg_ctl'),['-D',data,'-l',join(scratch,'server.log'),'-o','-p '+port+' -h 127.0.0.1 -k '+scratch,'-w','start'],{stdio:'ignore',env:{...process.env,LC_ALL:'C'}});
 const args=['-h','127.0.0.1','-p',String(port),'-d','postgres','-X','--csv','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'];
 const query=async(sql,params=[])=>{
  // Test-only executor against disposable PostgreSQL, not a production mode.
  const bound=sql.replace(/\$(\d+)/g,(_,n)=>params[Number(n)-1]===null?'NULL':"'"+String(params[Number(n)-1]).replaceAll("'","''")+"'");
  try{const result=await exec(join(bin,'psql'),[...args,'-c',bound],{maxBuffer:1024*1024});return csv(result.stdout);}
  catch(error){error.code=error.stderr?.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1]||error.code;throw error;}
 };
 try{const directory=new URL('../db/',import.meta.url);for(const file of (await readdir(directory)).filter(name=>/^\d{3}\.sql$/.test(name)).sort())await query(await readFile(new URL(file,directory),'utf8'));}
 catch(error){execFileSync(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{stdio:'ignore',env:{...process.env,LC_ALL:'C'}});await rm(scratch,{recursive:true,force:true});throw error;}
 return {query,close:async()=>{execFileSync(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'],{stdio:'ignore',env:{...process.env,LC_ALL:'C'}});await rm(scratch,{recursive:true,force:true});}};
}
