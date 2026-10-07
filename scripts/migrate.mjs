import { readFile,readdir } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
if(process.env.ALLOW_DEMO_MIGRATION!=='yes')throw Error('Set ALLOW_DEMO_MIGRATION=yes only after isolated database scope approval.');
if(!process.env.MIGRATION_DATABASE_URL)throw Error('MIGRATION_DATABASE_URL is required; never migrate with the runtime role.');
const sql=neon(process.env.MIGRATION_DATABASE_URL),directory=new URL('../db/',import.meta.url);
for(const file of (await readdir(directory)).filter(name=>/^\d{3}\.sql$/.test(name)).sort()){
 const text=await readFile(new URL(file,directory),'utf8');
 const statements=text.split(text.includes('-- statement-breakpoint')?'-- statement-breakpoint':';').map(value=>value.trim()).filter(Boolean);
 // Explicit markers keep function-body semicolons intact. One batch transaction
 // per migration file; no migration credentials are logged.
 await sql.transaction(statements.map(statement=>sql.query(statement)));
}
console.log('Isolated schema migrations completed. Admission remains closed until owner opt-in.');
