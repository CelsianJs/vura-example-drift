import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as tcpServer } from 'node:net';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { localPostgres } from '../test/local-postgres.mjs';
import { seed, fields, schema } from '../src/lib/domain.js';
const pg = await localPostgres();
if (!pg) throw Error('Real local PostgreSQL is required. No browser persistence proof obtained.');
await pg.query('UPDATE '+schema+'.admission SET enabled=true WHERE id=1');
let pending = 0, drained;
const bridge = createServer(async (request, response) => {
 pending++;
 try {
  let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 65536) throw Error('test query too large'); }
  const { query, params } = JSON.parse(body);
  const rows = await pg.query(query, params);
  const names = rows.length ? Object.keys(rows[0]) : [];
  const result = { fields: names.map(name => ({ name, dataTypeID: typeof rows[0][name] === 'object' ? 3802 : 25 })), rows: rows.map(row => names.map(name => typeof row[name] === 'object' ? JSON.stringify(row[name]) : String(row[name]))), rowCount: rows.length };
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result));
 } catch { response.writeHead(500, { 'content-type': 'application/json' }); response.end(JSON.stringify({ message: 'local test SQL failed', code: 'TEST_QUERY_FAILED' })); }
 finally { if (--pending === 0) drained?.(); }
});
await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
const listener=tcpServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
const base='http://127.0.0.1:'+port;
let server, browser;
const start = async () => {
 server=spawn(process.execPath,['--import','./test/neon-loopback.mjs','dist/server/entry.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATABASE_URL:'postgresql://demo:fixture@demo-test.invalid/postgres',APP_ORIGIN:base,DEMO_TEST_SQL_URL:'http://127.0.0.1:'+bridge.address().port+'/sql'},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error('Built server failed to start.');
};
const stop=async()=>{if(!server)return;const child=server;server=null;child.kill('SIGTERM');if(child.exitCode===null)await new Promise(resolve=>{const timeout=setTimeout(()=>child.kill('SIGKILL'),5000);child.once('exit',()=>{clearTimeout(timeout);resolve();});});};
try {
 await start();
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1480,height:900}});
 const page=await context.newPage(),errors=[];
 const watch = page => {page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['error','warning'].includes(message.type())&&!/Failed to load resource.*(?:401|409)/.test(message.text()))errors.push(message.text());});};
 watch(page);
 await page.goto(base);
 const createdPromise=page.waitForResponse(response=>response.url().endsWith('/api/session')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Create private workspace'}).click();
 const created=await createdPromise;assert.equal(created.status(),201,'Built create session failed: '+await created.text());
 await page.locator('[data-item-id]').first().waitFor();
 assert.equal(await page.locator('[data-item-id]').count(),seed.length);
 const item=seed[0],key=Object.keys(fields)[0],value=fields[key].find(choice=>choice!==item[key]);
 const row=page.locator('[data-item-id="'+item.id+'"]');
 await page.getByLabel(item.title+' '+key).selectOption(value);
 await row.getByText('revision 2',{exact:false}).waitFor();
 const second=await context.newPage();watch(second);await second.goto(base);
 await second.locator('[data-item-id="'+item.id+'"]').getByText('revision 2',{exact:false}).waitFor();
 await second.getByRole('status').filter({hasText:'live sync'}).waitFor();
 await page.getByLabel(item.title+' '+key).selectOption(item[key]);
 await row.getByText('revision 3',{exact:false}).waitFor();
 
 await second.locator('[data-item-id="'+item.id+'"]').getByText('revision 3',{exact:false}).waitFor();
 const otherContext=await browser.newContext(),other=await otherContext.newPage();watch(other);
 await other.goto(base);await other.getByRole('button',{name:'Create private workspace'}).click();
 await other.locator('[data-item-id="'+item.id+'"]').getByText('revision 1',{exact:false}).waitFor();
 assert.equal(await other.getByLabel(item.title+' '+key).inputValue(),item[key]);
 const session=await (await context.request.get(base+'/api/session')).json();
 const conflict=await context.request.patch(base+'/api/items/'+item.id,{headers:{origin:base,'x-demo-csrf':session.csrfToken},data:{expectedVersion:1,[key]:value}});
 assert.equal(conflict.status(),409);
 const proof=await mkdtemp(join(tmpdir(),'vura-example-postgres-browser-'));
 await page.screenshot({path:join(proof,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:join(proof,'mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 assert.equal(await page.evaluate(()=>localStorage.length),0);
 await page.close();await second.close();await otherContext.close();
 await stop();await start();
 const restored=await context.newPage();watch(restored);await restored.goto(base);
 await restored.locator('[data-item-id="'+item.id+'"]').getByText('revision 3',{exact:false}).waitFor();
 assert.equal(await restored.locator('#activity li').count(),2);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'pass',artifact:'released-package Vura build',storage:'disposable real PostgreSQL via test-only Neon HTTP transport bridge',checks:['browser create/read/write','two sessions isolated','version conflict409','atomic audit','full Node runtime restart retained revision3','no-localStorage','desktop/mobile','no-relevant-console-errors','two-tab committed SSE'],screenshots:proof,hostedNeonTransportVerified:false},null,2));
} finally {await browser?.close();await stop();bridge.closeAllConnections();await new Promise(resolve=>bridge.close(resolve));if(pending)await new Promise(resolve=>{drained=resolve;});await pg.close();}
