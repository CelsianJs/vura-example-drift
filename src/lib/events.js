import { authenticated } from './service.js';
import { getStore } from './store.js';
import { json, respond, sessionToken } from './security.js';
const key = Symbol.for('vura.drift.demo.connections');
const connections = globalThis[key] ||= new Map();
export function createEvents(storeFactory = getStore, pollMs = 1500, lifetimeMs = 120000) {
  return request => respond(async () => {
    const store = storeFactory(), session = await authenticated(request, store);
    const active = connections.get(session.workspaceId) || 0;
    const total = [...connections.values()].reduce((a,b) => a+b,0);
    if (active >= 4 || total >= 100) return json({ error: { code: 'STREAM_LIMIT', message: 'Too many live connections. Close another tab.' } }, 429);
    connections.set(session.workspaceId, active + 1);
    let initial;
    try { initial = await store.snapshot(session); }
    catch (error) {
      const count = (connections.get(session.workspaceId) || 1) - 1;
      if (count <= 0) connections.delete(session.workspaceId); else connections.set(session.workspaceId, count);
      throw error;
    }
    const encoder = new TextEncoder();
    let timer, ended = false, previous = JSON.stringify(initial), stop;
    const stream = new ReadableStream({
      start(controller) {
        stop = () => {
          if (ended) return;
          ended = true; clearTimeout(timer);
          request.signal.removeEventListener('abort', stop);
          const count = (connections.get(session.workspaceId) || 1) - 1;
          if (count <= 0) connections.delete(session.workspaceId); else connections.set(session.workspaceId, count);
          try { controller.close(); } catch {}
        };
        request.signal.addEventListener('abort', stop, { once: true });
        if (request.signal.aborted) { stop(); return; }
        const began = Date.now();
        controller.enqueue(encoder.encode('event: snapshot\ndata: ' + previous + '\n\n'));
        const poll = async () => {
          if (ended) return;
          if (Date.now() - began >= lifetimeMs || controller.desiredSize <= 0) { stop(); return; }
          try {
            if (!await store.session(sessionToken(request))) { stop(); return; }
            const next = JSON.stringify(await store.snapshot(session));
            if (ended) return;
            controller.enqueue(encoder.encode(next !== previous ? 'event: snapshot\ndata: ' + next + '\n\n' : ': heartbeat\n\n'));
            previous = next;
          } catch {
            if (!ended) { controller.enqueue(encoder.encode('event: storage-error\ndata: {}\n\n')); stop(); }
            return;
          }
          if (!ended) { timer = setTimeout(poll, pollMs); timer.unref?.(); }
        };
        timer = setTimeout(poll, pollMs); timer.unref?.();
      },
      cancel() { stop?.(); }
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'private, no-store', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff' } });
  });
}
export const events = createEvents();
