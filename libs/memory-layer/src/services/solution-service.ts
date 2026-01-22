/**
 * Solution Service
 *
 * Handles recording, retrieving, and managing solutions for errors.
 */

import { createLogger } from '@automaker/utils';
import { getDatabase } from '../database/connection.js';
import type { SolutionInput, SolutionRecord, SolutionRow, SolutionSource } from '../types.js';

const logger = createLogger('MemoryLayer:SolutionService');

/**
 * Convert database row to SolutionRecord
 */
function rowToSolutionRecord(row: SolutionRow): SolutionRecord {
  return {
    id: row.id,
    errorId: row.error_id,
    content: row.content,
    codeSnippet: row.code_snippet,
    successCount: row.success_count,
    failureCount: row.failure_count,
    successRate: row.success_rate,
    source: row.source as SolutionSource,
    projectName: row.project_name,
    createdAt: row.created_at,
  };
}

/**
 * Record a new solution for an error
 * Returns the solution ID
 */
export function recordSolution(input: SolutionInput): number {
  const db = getDatabase();

  // Verify the error exists
  const error = db
    .prepare(
      `
    SELECT id FROM errors WHERE id = ?
  `
    )
    .get(input.errorId) as { id: number } | undefined;

  if (!error) {
    throw new Error(`Error with id ${input.errorId} not found`);
  }

  // Insert the solution
  const result = db
    .prepare(
      `
    INSERT INTO solutions (error_id, content, code_snippet, source, project_name)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(
      input.errorId,
      input.content,
      input.codeSnippet || null,
      input.source,
      input.projectName || null
    );

  const solutionId = Number(result.lastInsertRowid);

  logger.info(`Recorded solution (id: ${solutionId}) for error ${input.errorId}`);
  return solutionId;
}

/**
 * Record the outcome of a solution attempt
 */
export function recordSolutionOutcome(solutionId: number, success: boolean): void {
  const db = getDatabase();

  const column = success ? 'success_count' : 'failure_count';

  const result = db
    .prepare(
      `
    UPDATE solutions
    SET ${column} = ${column} + 1
    WHERE id = ?
  `
    )
    .run(solutionId);

  if (result.changes === 0) {
    throw new Error(`Solution with id ${solutionId} not found`);
  }

  logger.debug(`Recorded ${success ? 'success' : 'failure'} for solution ${solutionId}`);
}

/**
 * Get a solution by ID
 */
export function getSolutionById(id: number): SolutionRecord | null {
  const db = getDatabase();

  const row = db
    .prepare(
      `
    SELECT * FROM solutions WHERE id = ?
  `
    )
    .get(id) as SolutionRow | undefined;

  if (!row) {
    return null;
  }

  return rowToSolutionRecord(row);
}

/**
 * Get all solutions for an error
 */
export function getSolutionsForError(errorId: number): SolutionRecord[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM solutions
    WHERE error_id = ?
    ORDER BY success_rate DESC, success_count DESC
  `
    )
    .all(errorId) as SolutionRow[];

  return rows.map(rowToSolutionRecord);
}

/**
 * Get the best solution for an error (highest success rate)
 */
export function getBestSolutionForError(errorId: number): SolutionRecord | null {
  const db = getDatabase();

  const row = db
    .prepare(
      `
    SELECT * FROM solutions
    WHERE error_id = ?
    ORDER BY success_rate DESC, success_count DESC
    LIMIT 1
  `
    )
    .get(errorId) as SolutionRow | undefined;

  if (!row) {
    return null;
  }

  return rowToSolutionRecord(row);
}

/**
 * Get solutions with high success rates
 */
export function getSuccessfulSolutions(
  minSuccessRate: number = 0.7,
  limit: number = 20
): SolutionRecord[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM solutions
    WHERE success_rate >= ? AND (success_count + failure_count) >= 2
    ORDER BY success_rate DESC, success_count DESC
    LIMIT ?
  `
    )
    .all(minSuccessRate, limit) as SolutionRow[];

  return rows.map(rowToSolutionRecord);
}

/**
 * Get recent solutions
 */
export function getRecentSolutions(limit: number = 20): SolutionRecord[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM solutions
    ORDER BY created_at DESC
    LIMIT ?
  `
    )
    .all(limit) as SolutionRow[];

  return rows.map(rowToSolutionRecord);
}

/**
 * Update solution content
 */
export function updateSolution(
  id: number,
  updates: { content?: string; codeSnippet?: string }
): boolean {
  const db = getDatabase();

  const setParts: string[] = [];
  const params: (string | number)[] = [];

  if (updates.content !== undefined) {
    setParts.push('content = ?');
    params.push(updates.content);
  }

  if (updates.codeSnippet !== undefined) {
    setParts.push('code_snippet = ?');
    params.push(updates.codeSnippet);
  }

  if (setParts.length === 0) {
    return false;
  }

  params.push(id);

  const result = db.prepare(`UPDATE solutions SET ${setParts.join(', ')} WHERE id = ?`).run(...params);

  return result.changes > 0;
}

/**
 * Delete a solution
 */
export function deleteSolution(id: number): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    DELETE FROM solutions WHERE id = ?
  `
    )
    .run(id);

  return result.changes > 0;
}

/**
 * Delete all solutions for an error
 */
export function deleteSolutionsForError(errorId: number): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    DELETE FROM solutions WHERE error_id = ?
  `
    )
    .run(errorId);

  return result.changes;
}

/**
 * Get total solution count
 */
export function getSolutionCount(): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM solutions
  `
    )
    .get() as { count: number };

  return result.count;
}

/**
 * Get average success rate across all solutions
 */
export function getAverageSuccessRate(): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT AVG(success_rate) as avg_rate
    FROM solutions
    WHERE (success_count + failure_count) > 0
  `
    )
    .get() as { avg_rate: number | null };

  return result.avg_rate || 0;
}

/**
 * Get count of errors that have at least one solution
 */
export function getErrorsWithSolutionsCount(): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT COUNT(DISTINCT error_id) as count FROM solutions
  `
    )
    .get() as { count: number };

  return result.count;
}

/**
 * Get solutions by source
 */
export function getSolutionsBySource(source: SolutionSource): SolutionRecord[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT * FROM solutions
    WHERE source = ?
    ORDER BY success_rate DESC
  `
    )
    .all(source) as SolutionRow[];

  return rows.map(rowToSolutionRecord);
}
