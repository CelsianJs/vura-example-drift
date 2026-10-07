import test from 'node:test';
import assert from 'node:assert/strict';
import { cookie, cookieName, csrf, hash, sessionToken, token, boundedBody } from '../src/lib/security.js';
import { validatePatch, fields } from '../src/lib/domain.js';
import { service } from '../src/lib/service.js';
process.env.APP_ORIGIN = 'https://demo.example';
test('opaque sessions have secure host-only cookies and reject duplicate/forged tokens', () => {
 const value=token(),header=cookie(value);
 for(const part of ['__Host-drift-demo=','HttpOnly','Secure','SameSite=Lax'])assert.ok(header.includes(part));
 assert.ok(!header.includes('Domain'));
 assert.equal(sessionToken(new Request('https://demo.example',{headers:{cookie:cookieName()+'='+value}})),value);
 assert.equal(sessionToken(new Request('https://demo.example',{headers:{cookie:cookieName()+'='+value+'; '+cookieName()+'='+value}})),null);
 assert.equal(sessionToken(new Request('https://demo.example',{headers:{cookie:cookieName()+'=forged'}})),null);
});
test('brand cookies coexist on localhost without claiming port isolation',()=>{
 const previous=process.env.APP_ORIGIN;process.env.APP_ORIGIN='http://127.0.0.1:3000';
 try{
  const own=token(),foreign=token(),ownName=cookieName(),foreignName='harbor-demo';
  assert.equal(ownName,'drift-demo');assert.notEqual(ownName,foreignName);
  const sharedHeader=ownName+'='+own+'; '+foreignName+'='+foreign;
  for(const port of [3000,4744])assert.equal(sessionToken(new Request('http://127.0.0.1:'+port+'/api/session',{headers:{cookie:sharedHeader}})),own);
  assert.equal(sessionToken(new Request('http://127.0.0.1:4744/api/session',{headers:{cookie:foreignName+'='+foreign}})),null);
  assert.ok(cookie(own).startsWith('drift-demo='));
 }finally{process.env.APP_ORIGIN=previous;}
});
test('writes require exact origin and genuine CSRF',()=>{
 const value=token();
 assert.doesNotThrow(()=>csrf(new Request('https://demo.example',{headers:{origin:'https://demo.example','x-demo-csrf':value}}),hash(value)));
 for(const headers of [{origin:'https://evil.example','x-demo-csrf':value},{origin:'https://demo.example'},{origin:'https://demo.example','x-demo-csrf':token()},{origin:'https://demo.example','x-demo-csrf':value,'sec-fetch-site':'cross-site'}])assert.throws(()=>csrf(new Request('https://demo.example',{headers}),hash(value)),e=>e.status===403);
});
test('patches whitelist fields and require integer optimistic versions',()=>{
 const key=Object.keys(fields)[0],value=fields[key][0];
 assert.equal(validatePatch({[key]:value,expectedVersion:1}).patch[key],value);
 for(const body of [{[key]:value,expectedVersion:0},{[key]:value,expectedVersion:1.2},{[key]:value,expectedVersion:1,workspaceId:'someone-else'},{[key]:'unknown',expectedVersion:1},{expectedVersion:1}])assert.throws(()=>validatePatch(body),e=>e.status===422);
});
test('large/non-object mutation payloads fail',()=>{
 const key=Object.keys(fields)[0],value=fields[key][0];
 for(const expectedVersion of [502,2147483648,Number.MAX_SAFE_INTEGER])assert.throws(()=>validatePatch({[key]:value,expectedVersion}),e=>e.status===422);
 assert.throws(()=>boundedBody({headers:new Headers({'content-type':'application/json'}),parsedBody:{text:'x'.repeat(9000)}}),e=>e.status===413);
 assert.throws(()=>boundedBody({headers:new Headers({'content-type':'application/json'}),parsedBody:[]}),e=>e.status===400);
});
test('missing DATABASE_URL gives 503 without cookies or fabricated success',async()=>{
 const previous=process.env.DATABASE_URL;delete process.env.DATABASE_URL;
 try{
 const response=await service.session(new Request('https://demo.example/api/session',{method:'POST',headers:{origin:'https://demo.example'}}));
 assert.equal(response.status,503);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal((await response.json()).error.code,'STORAGE_UNAVAILABLE');
 }finally{if(previous!==undefined)process.env.DATABASE_URL=previous;}
});
