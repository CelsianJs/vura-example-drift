import test from 'node:test';
import assert from 'node:assert/strict';
import { localPostgres } from './local-postgres.mjs';
import { httpApp } from './http-app.mjs';
import { PostgresStore } from '../src/lib/store.js';
import { fields, schema, seed } from '../src/lib/domain.js';
import { createEvents } from '../src/lib/events.js';
test('real disposable PostgreSQL: HTTP ownership, CSRF, versions, atomic audit and restart persistence', {timeout:60000}, async t => {
 const pg=await localPostgres();
 if(!pg){t.skip('Install PostgreSQL and set DEMO_TEST_POSTGRES_BIN. No persistence proof obtained.');return;}
 let app;
 try{
  const store=new PostgresStore(pg.query);app=await httpApp(store);process.env.APP_ORIGIN=app.base;
  await pg.query('UPDATE '+schema+'.admission SET enabled=true WHERE id=1');
  const request=(path,options={})=>fetch(app.base+path,options);
  assert.equal((await request('/api/snapshot')).status,401);
  assert.equal((await request('/api/session',{method:'POST',headers:{origin:'https://evil.example'}})).status,403);
  async function create(){
   const response=await request('/api/session',{method:'POST',headers:{origin:app.base}});
   assert.equal(response.status,201);
   return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrfToken};
  }
  const a=await create(),b=await create();
  assert.notEqual(a.cookie,b.cookie);
  const headers=session=>({cookie:session.cookie,origin:app.base,'content-type':'application/json','x-demo-csrf':session.csrf});
  const snapshot=async session=>(await request('/api/snapshot',{headers:{cookie:session.cookie}})).json();
  const initial=await snapshot(a);assert.equal(initial.items.length,seed.length);
  const item=initial.items[0],key=Object.keys(fields)[0],value=fields[key].find(v=>v!==item[key]);
  const payload={expectedVersion:item.version,[key]:value};
  const path='/api/items/'+item.id;
  for(const bad of [{cookie:a.cookie,origin:app.base,'content-type':'application/json'},{...headers(a),origin:'https://evil.example'},{...headers(a),'x-demo-csrf':'forged'}]){
   assert.equal((await request(path,{method:'PATCH',headers:bad,body:JSON.stringify(payload)})).status,403);
  }
  assert.equal((await request(path,{method:'PATCH',headers:headers(a),body:JSON.stringify({...payload,workspaceId:'other'})})).status,422);
  assert.equal((await request(path,{method:'PATCH',headers:headers(a),body:JSON.stringify({...payload,excess:'x'.repeat(9000)})})).status,413);
  const raced=await Promise.all([1,2].map(()=>request(path,{method:'PATCH',headers:headers(a),body:JSON.stringify(payload)})));
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);
  const after=await snapshot(a),other=await snapshot(b);
  assert.equal(after.items.find(i=>i.id===item.id).version,2);assert.equal(after.activity.length,1);
  assert.equal(other.items.find(i=>i.id===item.id).version,1);assert.equal(other.activity.length,0);
  assert.equal((await request('/api/items/not-in-workspace',{method:'PATCH',headers:headers(a),body:JSON.stringify(payload)})).status,404);
  // Force audit insertion to fail. The changed CTE must roll back with it.
  await pg.query('ALTER TABLE '+schema+".events ADD CONSTRAINT test_atomic CHECK (patch->>'"+key+"' <> '"+item[key]+"')");
  assert.equal((await request(path,{method:'PATCH',headers:headers(a),body:JSON.stringify({expectedVersion:2,[key]:item[key]})})).status,503);
  const rolled=await snapshot(a);assert.equal(rolled.items.find(i=>i.id===item.id).version,2);assert.equal(rolled.activity.length,1);
  await pg.query('ALTER TABLE '+schema+'.events DROP CONSTRAINT test_atomic');
  const sessionRows=await pg.query('SELECT token_hash FROM '+schema+'.sessions');assert.ok(sessionRows.every(r=>r.token_hash.length===64));assert.ok(!sessionRows.some(r=>a.cookie.includes(r.token_hash)));
  const oldBase=app.base;await app.close();
  app=await httpApp(new PostgresStore(pg.query));process.env.APP_ORIGIN=app.base;
  const restarted=await snapshot(a);assert.equal(restarted.items.find(i=>i.id===item.id).version,2);assert.equal(restarted.activity.length,1);
  assert.equal((await request('/api/session',{method:'DELETE',headers:headers(a)})).status,200);
  assert.equal((await request('/api/snapshot',{headers:{cookie:a.cookie}})).status,401);
  assert.equal((await snapshot(b)).items.length,seed.length);
  const security=await import('../src/lib/security.js');
  await pg.query('UPDATE '+schema+'.sessions SET expires_at=now()-interval \'1 minute\' WHERE token_hash=$1',[security.hash(b.cookie.split('=')[1])]);
  const expired=await request('/api/session',{headers:{cookie:b.cookie}});assert.equal(expired.status,401);
  assert.match(expired.headers.get('set-cookie') || '',/Max-Age=0/);
  const recovered=await request('/api/session',{method:'POST',headers:{origin:app.base,cookie:b.cookie}});
  assert.equal(recovered.status,201,'An expired cookie must recover into a fresh isolated workspace.');
  assert.notEqual(recovered.headers.get('set-cookie').split(';')[0],b.cookie);
  const fresh={cookie:recovered.headers.get('set-cookie').split(';')[0],csrf:(await recovered.json()).csrfToken};
  assert.equal((await snapshot(fresh)).items.length,seed.length);
  
  Object.assign(b,fresh);
  const bSession=await store.session(b.cookie.split('=')[1]);
  const events=createEvents(()=>store,20,2000);
  const signal=new AbortController();
  const streamRequest=new Request(app.base+'/api/events',{headers:{cookie:b.cookie},signal:signal.signal});
  const response=await events(streamRequest);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  const first=decoder.decode((await reader.read()).value);assert.match(first,/event: snapshot/);
  assert.equal(JSON.parse(first.split('data: ')[1]).activity.length,0);
  const target=(await snapshot(b)).items[0],next=fields[key].find(v=>v!==target[key]);
  await store.mutate(bSession,target.id,{expectedVersion:1,[key]:next});
  let event='';while(!event.includes('event: snapshot')){event=decoder.decode((await reader.read()).value);}
  assert.equal(JSON.parse(event.split('data: ')[1]).items.find(i=>i.id===target.id).version,2);
  signal.abort();await reader.cancel();
  const limitEvents=createEvents(()=>store,1000,10000);
  const streams=[];for(let i=0;i<4;i++)streams.push(await limitEvents(new Request(app.base+'/api/events',{headers:{cookie:b.cookie}})));
  assert.equal((await limitEvents(new Request(app.base+'/api/events',{headers:{cookie:b.cookie}}))).status,429);
  for(const open of streams)await open.body.cancel();
  const reconnect=await limitEvents(new Request(app.base+'/api/events',{headers:{cookie:b.cookie}}));assert.equal(reconnect.status,200);await reconnect.body.cancel();
  
 }finally{if(app)await app.close();await pg.close();}
});
