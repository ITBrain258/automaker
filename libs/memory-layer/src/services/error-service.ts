/**
 * Error Service
 *
 * Handles recording, retrieving, and searching error records.
 */

import { createLogger } from '@automaker/utils';
import { getDatabase } from '../database/connection.js';
import type {
  ErrorInput,
  ErrorRecord,
  ErrorRow,
  ErrorSeverity,
  ErrorWithTags,
  SearchOptions,
} from '../types.js';
import {
  extractErrorType,
  extractTags,
  generateErrorHash,
  normalizeErrorMessage,
  suggestSeverity,
} from '../utils/error-hash.js';
import { combinedSimilarity } from '../utils/similarity.js';
import { getTagsByErrorId, addTagsToError, getOrCreateTags } from './tag-service.js';

const logger = createLogger('MemoryLayer:ErrorService');

/**
 * Convert database row to ErrorRecord
 */
function rowToErrorRecord(row: ErrorRow): ErrorRecord {
  return {
    id: row.id,
    hash: row.hash,
    message: row.message,
    normalizedMessage: row.normalized_message,
    errorType: row.error_type,
    severity: row.severity as ErrorSeverity,
    stackTrace: row.stack_trace,
    filePath: row.file_path,
    projectName: row.project_name,
    occurrenceCount: row.occurrence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

/**
 * Record a new error or update existing one if hash matches
 * Returns the error ID
 */
export function recordError(input: ErrorInput): number {
  const db = getDatabase();

  // Extract/normalize error information
  const errorType = input.errorType || extractErrorType(input.message);
  const severity = input.severity || suggestSeverity(input.message);
  const normalizedMessage = normalizeErrorMessage(input.message);
  const hash = generateErrorHash(input.message, errorType);

  // Check for existing error with same hash
  const existing = db
    .prepare(
      `
    SELECT id FROM errors WHERE hash = ?
  `
    )
    .get(hash) as { id: number } | undefined;

  if (existing) {
    // Update existing error
    db.prepare(
      `
      UPDATE errors
      SET occurrence_count = occurrence_count + 1,
          last_seen_at = datetime('now')
      WHERE id = ?
    `
    ).run(existing.id);

    logger.debug(`Updated existing error (id: ${existing.id}, occurrences+1)`);
    return existing.id;
  }

  // Insert new error
  const result = db
    .prepare(
      `
    INSERT INTO errors (hash, message, normalized_message, error_type, severity, stack_trace, file_path, project_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      hash,
      input.message,
      normalizedMessage,
      errorType,
      severity,
      input.stackTrace || null,
      input.filePath || null,
      input.projectName || null
    );

  const errorId = Number(result.lastInsertRowid);

  // Auto-extract and add tags
  const autoTags = extractTags(input.message, errorType);
  const allTags = [...new Set([...(input.tags || []), ...autoTags])];

  if (allTags.length > 0) {
    const tagRecords = getOrCreateTags(allTags);
    const tagIds = tagRecords.map((t) => t.id);
    addTagsToError(errorId, tagIds);
  }

  logger.info(`Recorded new error (id: ${errorId}, type: ${errorType})`);
  return errorId;
}

/**
 * Get an error by ID
 */
export function getErrorById(id: number): ErrorWithTags | null {
  const db = getDatabase();

  const row = db
    .prepare(
      `
    SELECT * FROM errors WHERE id = ?
  `
    )
    .get(id) as ErrorRow | undefined;

  if (!row) {
    return null;
  }

  const error = rowToErrorRecord(row);
  const tags = getTagsByErrorId(id);

  return {
    ...error,
    tags: tags.map((t) => t.name),
  };
}

/**
 * Get an error by hash
 */
export function getErrorByHash(hash: string): ErrorWithTags | null {
  const db = getDatabase();

  const row = db
    .prepare(
      `
    SELECT * FROM errors WHERE hash = ?
  `
    )
    .get(hash) as ErrorRow | undefined;

  if (!row) {
    return null;
  }

  const error = rowToErrorRecord(row);
  const tags = getTagsByErrorId(error.id);

  return {
    ...error,
    tags: tags.map((t) => t.name),
  };
}

/**
 * Find errors by exact hash match
 */
export function findErrorByMessage(message: string, errorType?: string): ErrorWithTags | null {
  const type = errorType || extractErrorType(message);
  const hash = generateErrorHash(message, type);
  return getErrorByHash(hash);
}

/**
 * Search errors with various filters
 */
export function searchErrors(options: SearchOptions = {}): ErrorWithTags[] {
  const db = getDatabase();
  const { limit = 20, tags, projectName, errorType, severity } = options;

  let query = 'SELECT DISTINCT e.* FROM errors e';
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  // Join with tags if filtering by tags
  if (tags && tags.length > 0) {
    query += `
      INNER JOIN error_tags et ON e.id = et.error_id
      INNER JOIN tags t ON et.tag_id = t.id
    `;
    const placeholders = tags.map(() => '?').join(', ');
    conditions.push(`LOWER(t.name) IN (${placeholders})`);
    params.push(...tags.map((t) => t.toLowerCase()));
  }

  if (projectName) {
    conditions.push('e.project_name = ?');
    params.push(projectName);
  }

  if (errorType) {
    conditions.push('e.error_type = ?');
    params.push(errorType);
  }

  if (severity) {
    conditions.push('e.severity = ?');
    params.push(severity);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY e.last_seen_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as ErrorRow[];

  return rows.map((row) => {
    const error = rowToErrorRecord(row);
    const errorTags = getTagsByErrorId(error.id);
    return {
      ...error,
      tags: errorTags.map((t) => t.name),
    };
  });
}

/**
 * Find similar errors by message text
 * Uses text similarity matching
 */
export function findSimilarErrors(
  message: string,
  options: SearchOptions = {}
): Array<{ error: ErrorWithTags; similarity: number }> {
  const db = getDatabase();
  const { limit = 10, minSimilarity = 0.3, projectName, errorType, severity } = options;

  // First, try exact hash match
  const exactMatch = findErrorByMessage(message);
  if (exactMatch) {
    return [{ error: exactMatch, similarity: 1.0 }];
  }

  // Get candidate errors for similarity comparison
  let query = 'SELECT * FROM errors';
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (projectName) {
    conditions.push('project_name = ?');
    params.push(projectName);
  }

  if (errorType) {
    conditions.push('error_type = ?');
    params.push(errorType);
  }

  if (severity) {
    conditions.push('severity = ?');
    params.push(severity);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  // Get more candidates than needed for filtering
  query += ' ORDER BY last_seen_at DESC LIMIT ?';
  params.push(limit * 5);

  const rows = db.prepare(query).all(...params) as ErrorRow[];

  // Normalize the search message
  const normalizedSearch = normalizeErrorMessage(message);

  // Calculate similarity for each error
  const results: Array<{ error: ErrorWithTags; similarity: number }> = [];

  for (const row of rows) {
    const similarity = combinedSimilarity(normalizedSearch, row.normalized_message);

    if (similarity >= minSimilarity) {
      const error = rowToErrorRecord(row);
      const errorTags = getTagsByErrorId(error.id);

      results.push({
        error: {
          ...error,
          tags: errorTags.map((t) => t.name),
        },
        similarity,
      });
    }
  }

  // Sort by similarity and return top results
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/**
 * Get recent errors
 */
export function getRecentErrors(limit: number = 20): ErrorWithTags[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM errors
    ORDER BY last_seen_at DESC
    LIMIT ?
  `
    )
    .all(limit) as ErrorRow[];

  return rows.map((row) => {
    const error = rowToErrorRecord(row);
    const tags = getTagsByErrorId(error.id);
    return {
      ...error,
      tags: tags.map((t) => t.name),
    };
  });
}

/**
 * Get most frequent errors
 */
export function getFrequentErrors(limit: number = 20): ErrorWithTags[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM errors
    ORDER BY occurrence_count DESC
    LIMIT ?
  `
    )
    .all(limit) as ErrorRow[];

  return rows.map((row) => {
    const error = rowToErrorRecord(row);
    const tags = getTagsByErrorId(error.id);
    return {
      ...error,
      tags: tags.map((t) => t.name),
    };
  });
}

/**
 * Delete an error and all associated data
 */
export function deleteError(id: number): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    DELETE FROM errors WHERE id = ?
  `
    )
    .run(id);

  return result.changes > 0;
}

/**
 * Get total error count
 */
export function getErrorCount(): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM errors
  `
    )
    .get() as { count: number };

  return result.count;
}

/**
 * Get error type statistics
 */
export function getErrorTypeStats(): Array<{ type: string; count: number }> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT error_type as type, COUNT(*) as count
    FROM errors
    GROUP BY error_type
    ORDER BY count DESC
  `
    )
    .all() as Array<{ type: string; count: number }>;

  return rows;
}

/**
 * Get errors by project statistics
 */
export function getErrorsByProjectStats(): Array<{ project: string; count: number }> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT COALESCE(project_name, 'unknown') as project, COUNT(*) as count
    FROM errors
    GROUP BY project_name
    ORDER BY count DESC
  `
    )
    .all() as Array<{ project: string; count: number }>;

  return rows;
}
