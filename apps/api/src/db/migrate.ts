import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, db, sql } from './client.js';

/**
 * Applies pending migrations. Run explicitly (pnpm db:migrate) — the API server
 * never migrates on boot, so a rolling deploy cannot half-apply a schema change.
 */
async function main(): Promise<void> {
  // Extensions the schema depends on. Safe to run repeatedly.
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
  await sql`CREATE EXTENSION IF NOT EXISTS unaccent`;

  await migrate(db, { migrationsFolder: './drizzle' });
  // eslint-disable-next-line no-console
  console.log('Migrations applied.');
  await closeDb();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
