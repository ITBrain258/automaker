/**
 * SQLite Schema Definitions for Memory Layer
 *
 * Tables:
 * - errors: Stores error records with deduplication via hash
 * - solutions: Stores solutions linked to errors with success tracking
 * - tags: Tag definitions for categorization
 * - error_tags: Many-to-many relationship between errors and tags
 * - embeddings: Vector embeddings for semantic search
 * - schema_migrations: Tracks applied migrations
 */

/**
 * SQL statements to create the initial schema
 */
export const SCHEMA_SQL = `
-- Schema migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Errors table - stores unique error records
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL UNIQUE,
  message TEXT NOT NULL,
  normalized_message TEXT NOT NULL,
  error_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  stack_trace TEXT,
  file_path TEXT,
  project_name TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Solutions table - stores solutions linked to errors
CREATE TABLE IF NOT EXISTS solutions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  code_snippet TEXT,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL GENERATED ALWAYS AS (
    CASE
      WHEN (success_count + failure_count) = 0 THEN 0.0
      ELSE CAST(success_count AS REAL) / CAST((success_count + failure_count) AS REAL)
    END
  ) STORED,
  source TEXT NOT NULL CHECK (source IN ('auto_mode', 'agent', 'manual')),
  project_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (error_id) REFERENCES errors(id) ON DELETE CASCADE
);

-- Tags table - stores tag definitions
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT CHECK (category IN ('error_type', 'technology', 'framework', 'domain', 'custom'))
);

-- Error-Tag junction table - many-to-many relationship
CREATE TABLE IF NOT EXISTS error_tags (
  error_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (error_id, tag_id),
  FOREIGN KEY (error_id) REFERENCES errors(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Embeddings table - stores vector embeddings for semantic search
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  error_id INTEGER NOT NULL UNIQUE,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  FOREIGN KEY (error_id) REFERENCES errors(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_errors_hash ON errors(hash);
CREATE INDEX IF NOT EXISTS idx_errors_type ON errors(error_type);
CREATE INDEX IF NOT EXISTS idx_errors_severity ON errors(severity);
CREATE INDEX IF NOT EXISTS idx_errors_project ON errors(project_name);
CREATE INDEX IF NOT EXISTS idx_errors_last_seen ON errors(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_solutions_error_id ON solutions(error_id);
CREATE INDEX IF NOT EXISTS idx_solutions_success_rate ON solutions(success_rate);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
CREATE INDEX IF NOT EXISTS idx_embeddings_error_id ON embeddings(error_id);
`;

/**
 * Current schema version
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Schema version descriptions
 */
export const SCHEMA_VERSIONS: Record<number, string> = {
  1: 'Initial schema with errors, solutions, tags, and embeddings tables',
};
