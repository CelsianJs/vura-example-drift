import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new AppError(status, code, message); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function origin() {
  const value = process.env.APP_ORIGIN || '';
  try { const url = new URL(value); if (url.origin !== value || !['http:', 'https:'].includes(url.protocol)) throw Error(); return url; }
  catch { fail(503, 'CONFIG_UNAVAILABLE', 'Set APP_ORIGIN to the exact browser origin.'); }
}
export function cookieName() { return origin().protocol === 'https:' ? '__Host-drift-demo' : 'drift-demo'; }
export function cookie(value, clear = false) {
  return cookieName() + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (clear ? '0' : '604800') + (origin().protocol === 'https:' ? '; Secure' : '');
}
export function sessionToken(request) {
  const name = cookieName();
  const matches = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function sameOrigin(request) {
  if (request.headers.get('origin') !== origin().origin) fail(403, 'ORIGIN_REJECTED', 'This write must come from the application origin.');
  if (!['same-origin', 'none', null].includes(request.headers.get('sec-fetch-site'))) fail(403, 'ORIGIN_REJECTED', 'Cross-site writes are rejected.');
}
export function csrf(request, expectedHash) {
  sameOrigin(request);
  const value = request.headers.get('x-demo-csrf') || '';
  const actual = hash(value);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash))) fail(403, 'CSRF_REJECTED', 'Reload this workspace before writing.');
}
export function boundedBody(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail(415, 'JSON_REQUIRED', 'Send application/json.');
  const body = request.parsedBody;
  if (Number(request.headers.get('content-length') || 0) > 8192 || Buffer.byteLength(JSON.stringify(body ?? null)) > 8192) fail(413, 'BODY_TOO_LARGE', 'Request exceeds 8 KiB.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_BODY', 'Send one JSON object.');
  return body;
}
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', ...headers } });
}
export async function respond(action) {
  try { return await action(); }
  catch (error) {
    const known = error instanceof AppError;
    const headers=known&&error.code==='SESSION_EXPIRED'?{'set-cookie':cookie('',true)}:{};
    return json({ error: { code: known ? error.code : 'STORAGE_UNAVAILABLE', message: known ? error.message : 'Storage response unavailable; outcome unconfirmed. Refresh before retrying.' } }, known ? error.status : 503,headers);
  }
}

const limits = new Map();
export function limitSessionCreation(request) {
  const key = request.ip || 'unknown-peer';
  const now = Date.now();
  for (const [ip, entry] of limits) if (now > entry.until) limits.delete(ip);
  if (!limits.has(key) && limits.size >= 1000) fail(429, 'SESSION_RATE_LIMIT', 'Session creation is temporarily limited.');
  const entry = limits.get(key) || { until: now + 3600000, count: 0 };
  if (++entry.count > 20) fail(429, 'SESSION_RATE_LIMIT', 'Too many workspaces created. Try again later.');
  limits.set(key, entry);
}
