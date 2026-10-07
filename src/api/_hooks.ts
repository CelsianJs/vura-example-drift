import { json } from '../lib/security.js';
export const onError = [];
export const onResponse = [];
export const onRequest = [async (request: Request) => {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return;
  const rejected = () => json({ error: { code: 'BODY_TOO_LARGE', message: 'Request exceeds 8 KiB.' } }, 413);
  if (Number(request.headers.get('content-length') || 0) > 8192) return rejected();
  const reader = request.clone().body!.getReader();
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) {
        void reader.cancel().catch(() => {});
        void request.body.cancel().catch(() => {});
        return rejected();
      }
    }
  } finally { reader.releaseLock(); }
}];
