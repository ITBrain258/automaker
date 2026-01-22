/**
 * Database Migrations for Memory Layer
 *
 * Handles schema versioning and migrations between versions.
 */

import type Database from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, SCHEMA_SQL } from './schema.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('MemoryLayer:Migrations');

/**
 * Migration function type
 */
type MigrationFn = (db: Database.Database) => void;

/**
 * Migration definitions - keyed by target version
 * Each migration upgrades from (version - 1) to (version)
 */
const MIGRATIONS: Record<number, MigrationFn> = {
  // Version 1: Initial schema - no migration needed, created from scratch
  1: (_db: Database.Database) => {
    // Initial schema is applied via SCHEMA_SQL
    // This migration is a no-op for fresh installs
  },
};

/**
 * Get the current schema version from the database
 */
export function getSchemaVersion(db: Database.Database): number {
  try {
    const result = db
      .prepare(
        `
      SELECT version FROM schema_migrations
      ORDER BY version DESC
      LIMIT 1
    `
      )
      .get() as { version: number } | undefined;

    return result?.version ?? 0;
  } catch {
    // Table doesn't exist yet
    return 0;
  }
}

/**
 * Record a migration as applied
 */
function recordMigration(db: Database.Database, version: number): void {
  db.prepare(
    `
    INSERT INTO schema_migrations (version, applied_at)
    VALUES (?, datetime('now'))
  `
  ).run(version);
}

/**
 * Apply the initial schema to a fresh database
 */
export function applyInitialSchema(db: Database.Database): void {
  logger.info('Applying initial schema...');

  // Execute schema SQL
  db.exec(SCHEMA_SQL);

  // Record version 1 as applied
  recordMigration(db, 1);

  logger.info(`Schema initialized at version ${CURRENT_SCHEMA_VERSION}`);
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);

  if (currentVersion === 0) {
    // Fresh database - apply initial schema
    applyInitialSchema(db);
    return;
  }

  if (currentVersion === CURRENT_SCHEMA_VERSION) {
    logger.debug(`Schema is up to date (version ${currentVersion})`);
    return;
  }

  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version (${currentVersion}) is newer than supported (${CURRENT_SCHEMA_VERSION}). ` +
        `Please update the application.`
    );
  }

  // Run migrations sequentially
  logger.info(`Migrating from version ${currentVersion} to ${CURRENT_SCHEMA_VERSION}...`);

  for (let version = currentVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Missing migration for version ${version}`);
    }

    logger.info(`Applying migration to version ${version}...`);

    // Run migration in a transaction
    const runMigration = db.transaction(() => {
      migration(db);
      recordMigration(db, version);
    });

    runMigration();

    logger.info(`Migration to version ${version} complete`);
  }

  logger.info(`Migrations complete. Schema is now at version ${CURRENT_SCHEMA_VERSION}`);
}

/**
 * Check if migrations are needed
 */
export function needsMigration(db: Database.Database): boolean {
  const currentVersion = getSchemaVersion(db);
  return currentVersion < CURRENT_SCHEMA_VERSION;
}

/**
 * Validate database schema integrity
 */
export function validateSchema(db: Database.Database): boolean {
  const requiredTables = ['errors', 'solutions', 'tags', 'error_tags', 'embeddings'];

  for (const table of requiredTables) {
    const result = db
      .prepare(
        `
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `
      )
      .get(table) as { name: string } | undefined;

    if (!result) {
      logger.error(`Missing required table: ${table}`);
      return false;
    }
  }

  return true;
}
