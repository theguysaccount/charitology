import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { verifiedNeonConnectionString } from '../lib/connection.mjs';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: verifiedNeonConnectionString(process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL) });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Newsletter schema ready. No contacts changed and no email sent.');
} catch { await client.query('ROLLBACK').catch(() => {}); console.error('Newsletter migration failed. Inspect private database diagnostics.'); process.exitCode = 1; }
finally { await client.end(); }
