import { json } from '../lib/security.js';
export const route = { kind: 'serverless' };
export function GET() { return json({ ok: true, storageConfigured: Boolean(process.env.DATABASE_URL), durableStorageVerified: false }); }
