import { boundedBody, cookie, csrf, fail, json, respond, sameOrigin, sessionToken, limitSessionCreation } from './security.js';
import { getStore } from './store.js';
export async function authenticated(request, store) {
  const secret = sessionToken(request);
  if (!secret) fail(401, 'SESSION_REQUIRED', 'Create a private demo workspace first.');
  const session = await store.session(secret);
  if (!session) fail(401, 'SESSION_EXPIRED', 'Your workspace session has expired.');
  return { ...session, secret };
}
export function createService(storeFactory = getStore) {
  return {
    session: request => respond(async () => {
      if (request.method === 'POST') {
        sameOrigin(request);
        limitSessionCreation(request);
        const store=storeFactory(), previous=sessionToken(request);
        if (previous&&await store.session(previous)) fail(409, 'SESSION_EXISTS', 'End the existing session before creating another workspace.');
        const created = await store.create();
        return json({ csrfToken: created.csrfToken, storage: 'postgres', isolation: 'private-session' }, 201, { 'set-cookie': cookie(created.secret) });
      }
      const store = storeFactory(), session = await authenticated(request, store);
      if (request.method === 'DELETE') { csrf(request, session.csrfHash); await store.revoke(session.secret); return json({ ended: true }, 200, { 'set-cookie': cookie('', true) }); }
      return json({ csrfToken: session.csrfToken, storage: 'postgres', isolation: 'private-session' });
    }),
    snapshot: request => respond(async () => { const store = storeFactory(); return json(await store.snapshot(await authenticated(request, store))); }),
    mutate: request => respond(async () => {
      const store = storeFactory(), session = await authenticated(request, store);
      csrf(request, session.csrfHash);
      if (!/^[a-z0-9-]{1,80}$/.test(request.params.id || '')) fail(400, 'INVALID_ID', 'Invalid item identifier.');
      return json(await store.mutate(session, request.params.id, boundedBody(request)));
    })
  };
}
export const service = createService();
