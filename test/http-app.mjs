import { createApp, nodeToWebRequest, writeWebResponse } from '@celsian/core';
import { createServer } from 'node:http';
import { createService } from '../src/lib/service.js';
export async function httpApp(store,events){
 const app=createApp({logger:false,bodyLimit:8192}),service=createService(()=>store);
 app.get('/api/session',service.session);app.post('/api/session',service.session);app.delete('/api/session',service.session);
 app.get('/api/snapshot',service.snapshot);app.patch('/api/items/:id',service.mutate);
 if(events)app.get('/api/events',events);
 const server=createServer(async(req,res)=>{try{await writeWebResponse(res,await app.fetch(nodeToWebRequest(req,'http://'+req.headers.host+req.url)));}catch{res.writeHead(500);res.end('failed');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {base:'http://127.0.0.1:'+server.address().port,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
