import { neon } from '@neondatabase/serverless';
import { AppError, hash, token } from './security.js';
import { schema, seed, validatePatch } from './domain.js';
export class PostgresStore {
  constructor(query) { this.query = query; }
  async create() {
    const secret = token(), csrfToken = token(), workspaceId = crypto.randomUUID();
    let rows;
    try {
      rows = await this.query(`SELECT ${schema}.create_workspace($1::uuid,$2,$3,$4,$5::jsonb) AS "workspaceId"`, [workspaceId,hash(secret),hash(csrfToken),csrfToken,JSON.stringify(seed)]);
    } catch (error) {
      if (error.code === 'VQ001') throw new AppError(503,'CANARY_CLOSED','Demo admission is closed until the database owner explicitly enables it.');
      if (['VQ002','VQ003'].includes(error.code)) throw new AppError(429,'CANARY_LIMIT','The shared demo creation ceiling was reached. Try another day.');
      throw error;
    }
    if (!rows.length) throw Error('session creation failed');
    return { secret, csrfToken, workspaceId };
  }
  async session(secret) {
    const rows = await this.query(`SELECT workspace_id AS "workspaceId", csrf_hash AS "csrfHash", csrf_token AS "csrfToken" FROM ${schema}.sessions WHERE token_hash=$1 AND expires_at>now()`, [hash(secret)]);
    return rows[0] || null;
  }
  async revoke(secret) { await this.query(`DELETE FROM ${schema}.workspaces WHERE id=(SELECT workspace_id FROM ${schema}.sessions WHERE token_hash=$1)`, [hash(secret)]); }
  async snapshot(session) {
    const rows = await this.query(`
      SELECT coalesce((SELECT jsonb_agg(data || jsonb_build_object('version',version) ORDER BY id) FROM ${schema}.items WHERE workspace_id=$1::uuid),'[]'::jsonb) AS items,
      coalesce((SELECT jsonb_agg(event ORDER BY sequence DESC) FROM (SELECT sequence, jsonb_build_object('sequence',sequence::text,'itemId',item_id,'version',version,'patch',patch,'at',created_at) AS event FROM ${schema}.events WHERE workspace_id=$1::uuid ORDER BY sequence DESC LIMIT 40) recent),'[]'::jsonb) AS activity
    `, [session.workspaceId]);
    return rows[0];
  }
  async mutate(session, id, body) {
    const { patch, expectedVersion } = validatePatch(body);
    const rows = await this.query(`
      WITH changed AS (
        UPDATE ${schema}.items SET data=data || $3::jsonb, version=version+1, updated_at=now()
        WHERE workspace_id=$1::uuid AND id=$2 AND version=$4 AND version<501 RETURNING id,data,version
      ), logged AS (
        INSERT INTO ${schema}.events(workspace_id,item_id,version,patch)
        SELECT $1::uuid,id,version,$3::jsonb FROM changed RETURNING sequence
      ) SELECT data || jsonb_build_object('version',version) AS item, (SELECT sequence::text FROM logged) AS sequence FROM changed
    `, [session.workspaceId, id, JSON.stringify(patch), expectedVersion]);
    if (rows[0]) return rows[0];
    const existing = await this.query(`SELECT id,version FROM ${schema}.items WHERE workspace_id=$1::uuid AND id=$2`, [session.workspaceId, id]);
    if (Number(existing[0]?.version)>=501&&Number(existing[0]?.version)===expectedVersion) throw new AppError(429,'WORKSPACE_LIMIT','This demo item reached its 500-change ceiling.');
    throw new AppError(existing.length ? 409 : 404, existing.length ? 'VERSION_CONFLICT' : 'NOT_FOUND', existing.length ? 'Another tab changed this item. Reload and retry.' : 'This item is not in your workspace.');
  }
}
let cached;
export function getStore() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new AppError(503, 'STORAGE_UNAVAILABLE', 'DATABASE_URL is not configured. No workspace or edits have been saved.');
  if (!cached || cached.url !== url) {
    const sql = neon(url);
    cached = { url, store: new PostgresStore((query, params) => sql.query(query, params, { fetchOptions: { signal: AbortSignal.timeout(10000) } })) };
  }
  return cached.store;
}
