/**
 * Database Connection Management for Memory Layer
 *
 * Handles SQLite database initialization, connection pooling,
 * and proper shutdown.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { createLogger } from '@automaker/utils';
import { runMigrations, validateSchema } from './migrations.js';

const logger = createLogger('MemoryLayer:Connection');

/**
 * Get the default data directory for the memory layer
 * Cross-platform: ~/.local/share/automaker-memory/ on Linux/macOS
 *                 %APPDATA%/automaker-memory/ on Windows
 */
export function getDefaultDataDir(): string {
  const platform = os.platform();

  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'automaker-memory');
  }

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'automaker-memory');
  }

  // Linux and other Unix-like systems
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(dataHome, 'automaker-memory');
}

/**
 * Database connection singleton
 */
let dbInstance: Database.Database | null = null;
let dbPath: string | null = null;

/**
 * Initialize the database connection
 */
export async function initializeDatabase(dataDir?: string): Promise<Database.Database> {
  if (dbInstance) {
    logger.debug('Database already initialized, returning existing instance');
    return dbInstance;
  }

  const targetDir = dataDir || getDefaultDataDir();
  dbPath = path.join(targetDir, 'memory.db');

  logger.info(`Initializing database at: ${dbPath}`);

  // Ensure directory exists
  await fs.mkdir(targetDir, { recursive: true });

  // Open database with WAL mode for better concurrent performance
  dbInstance = new Database(dbPath);

  // Enable WAL mode for better write performance and concurrent reads
  dbInstance.pragma('journal_mode = WAL');

  // Enable foreign keys
  dbInstance.pragma('foreign_keys = ON');

  // Run migrations if needed
  runMigrations(dbInstance);

  // Validate schema
  if (!validateSchema(dbInstance)) {
    throw new Error('Database schema validation failed');
  }

  logger.info('Database initialized successfully');

  return dbInstance;
}

/**
 * Get the database instance
 * Throws if not initialized
 */
export function getDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbInstance;
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return dbInstance !== null;
}

/**
 * Get the current database path
 */
export function getDatabasePath(): string | null {
  return dbPath;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    logger.info('Closing database connection...');

    // Checkpoint WAL before closing for clean state
    try {
      dbInstance.pragma('wal_checkpoint(TRUNCATE)');
    } catch (error) {
      logger.warn('WAL checkpoint failed during close:', error);
    }

    dbInstance.close();
    dbInstance = null;
    dbPath = null;

    logger.info('Database connection closed');
  }
}

/**
 * Execute a function within a transaction
 * Automatically rolls back on error
 */
export function withTransaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDatabase();
  const transaction = db.transaction(fn);
  return transaction(db);
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): {
  path: string | null;
  sizeBytes: number;
  walSizeBytes: number;
  pageCount: number;
  pageSize: number;
} {
  const db = getDatabase();

  const pageCount = (db.pragma('page_count') as { page_count: number }[])[0]?.page_count ?? 0;
  const pageSize = (db.pragma('page_size') as { page_size: number }[])[0]?.page_size ?? 0;

  let sizeBytes = 0;
  let walSizeBytes = 0;

  if (dbPath) {
    try {
      const stats = fs;
      // Note: This is synchronous for simplicity in stats gathering
      // In production, you might want to cache this
      sizeBytes = pageCount * pageSize;

      // WAL file size would require actual file stat, omitted for simplicity
    } catch {
      // File stat failed, use calculated size
      sizeBytes = pageCount * pageSize;
    }
  }

  return {
    path: dbPath,
    sizeBytes,
    walSizeBytes,
    pageCount,
    pageSize,
  };
}

/**
 * Optimize the database (vacuum and analyze)
 * Should be called periodically for maintenance
 */
export function optimizeDatabase(): void {
  const db = getDatabase();

  logger.info('Optimizing database...');

  // Analyze for query planner statistics
  db.exec('ANALYZE');

  // Vacuum to reclaim space (note: this can be slow for large databases)
  // Only vacuum if database has grown significantly
  const freePages = (db.pragma('freelist_count') as { freelist_count: number }[])[0]
    ?.freelist_count;

  if (freePages && freePages > 100) {
    logger.info(`Vacuuming database (${freePages} free pages)...`);
    db.exec('VACUUM');
  }

  logger.info('Database optimization complete');
}
