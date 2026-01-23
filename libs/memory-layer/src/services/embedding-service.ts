/**
 * Embedding Service
 *
 * Handles vector embeddings for semantic search.
 * Note: Actual embedding generation requires an external API (e.g., OpenAI, Cohere)
 * This service provides the infrastructure for storing and searching embeddings.
 */

import { createLogger } from '@automaker/utils';
import { getDatabase } from '../database/connection.js';
import type { EmbeddingRecord, EmbeddingRow, ErrorWithTags } from '../types.js';
import { bufferToFloatArray, cosineSimilarity, floatArrayToBuffer } from '../utils/similarity.js';
import { getErrorById } from './error-service.js';

const logger = createLogger('MemoryLayer:EmbeddingService');

/**
 * Default embedding dimensions (matches common models like text-embedding-3-small)
 */
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * Convert database row to EmbeddingRecord
 */
function rowToEmbeddingRecord(row: EmbeddingRow): EmbeddingRecord {
  return {
    id: row.id,
    errorId: row.error_id,
    embedding: row.embedding,
    model: row.model,
    dimensions: row.dimensions,
  };
}

/**
 * Store an embedding for an error
 */
export function storeEmbedding(
  errorId: number,
  embedding: number[],
  model: string
): number {
  const db = getDatabase();

  // Verify the error exists
  const error = db
    .prepare(
      `
    SELECT id FROM errors WHERE id = ?
  `
    )
    .get(errorId) as { id: number } | undefined;

  if (!error) {
    throw new Error(`Error with id ${errorId} not found`);
  }

  // Convert embedding to buffer
  const embeddingBuffer = floatArrayToBuffer(embedding);

  // Insert or replace embedding
  const result = db
    .prepare(
      `
    INSERT INTO embeddings (error_id, embedding, model, dimensions)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(error_id) DO UPDATE SET
      embedding = excluded.embedding,
      model = excluded.model,
      dimensions = excluded.dimensions
  `
    )
    .run(errorId, embeddingBuffer, model, embedding.length);

  const embeddingId = Number(result.lastInsertRowid);

  logger.debug(`Stored embedding for error ${errorId} (dimensions: ${embedding.length})`);
  return embeddingId;
}

/**
 * Get embedding for an error
 */
export function getEmbeddingByErrorId(errorId: number): EmbeddingRecord | null {
  const db = getDatabase();

  const row = db
    .prepare(
      `
    SELECT * FROM embeddings WHERE error_id = ?
  `
    )
    .get(errorId) as EmbeddingRow | undefined;

  if (!row) {
    return null;
  }

  return rowToEmbeddingRecord(row);
}

/**
 * Get embedding vector for an error
 */
export function getEmbeddingVector(errorId: number): number[] | null {
  const embedding = getEmbeddingByErrorId(errorId);
  if (!embedding) {
    return null;
  }

  return bufferToFloatArray(embedding.embedding);
}

/**
 * Delete embedding for an error
 */
export function deleteEmbedding(errorId: number): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    DELETE FROM embeddings WHERE error_id = ?
  `
    )
    .run(errorId);

  return result.changes > 0;
}

/**
 * Find similar errors by embedding (semantic search)
 */
export function findSimilarByEmbedding(
  targetEmbedding: number[],
  options: { limit?: number; minSimilarity?: number } = {}
): Array<{ error: ErrorWithTags; similarity: number }> {
  const { limit = 10, minSimilarity = 0.7 } = options;
  const db = getDatabase();

  // Get all embeddings
  const rows = db
    .prepare(
      `
    SELECT * FROM embeddings
  `
    )
    .all() as EmbeddingRow[];

  const results: Array<{ errorId: number; similarity: number }> = [];

  for (const row of rows) {
    const embedding = bufferToFloatArray(row.embedding);

    // Skip if dimensions don't match
    if (embedding.length !== targetEmbedding.length) {
      continue;
    }

    const similarity = cosineSimilarity(targetEmbedding, embedding);

    if (similarity >= minSimilarity) {
      results.push({
        errorId: row.error_id,
        similarity,
      });
    }
  }

  // Sort by similarity and get top results
  const sorted = results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);

  // Fetch full error records
  const fullResults: Array<{ error: ErrorWithTags; similarity: number }> = [];

  for (const result of sorted) {
    const error = getErrorById(result.errorId);
    if (error) {
      fullResults.push({
        error,
        similarity: result.similarity,
      });
    }
  }

  return fullResults;
}

/**
 * Check if an error has an embedding
 */
export function hasEmbedding(errorId: number): boolean {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT 1 FROM embeddings WHERE error_id = ?
  `
    )
    .get(errorId) as { 1: number } | undefined;

  return result !== undefined;
}

/**
 * Get count of errors with embeddings
 */
export function getEmbeddingCount(): number {
  const db = getDatabase();

  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM embeddings
  `
    )
    .get() as { count: number };

  return result.count;
}

/**
 * Get errors that don't have embeddings yet
 */
export function getErrorsWithoutEmbeddings(limit: number = 100): number[] {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT e.id
    FROM errors e
    LEFT JOIN embeddings emb ON e.id = emb.error_id
    WHERE emb.id IS NULL
    ORDER BY e.last_seen_at DESC
    LIMIT ?
  `
    )
    .all(limit) as Array<{ id: number }>;

  return rows.map((r) => r.id);
}

/**
 * Batch store embeddings
 */
export function batchStoreEmbeddings(
  items: Array<{ errorId: number; embedding: number[] }>,
  model: string
): void {
  const db = getDatabase();

  const insert = db.prepare(`
    INSERT INTO embeddings (error_id, embedding, model, dimensions)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(error_id) DO UPDATE SET
      embedding = excluded.embedding,
      model = excluded.model,
      dimensions = excluded.dimensions
  `);

  const batchInsert = db.transaction((items: Array<{ errorId: number; embedding: number[] }>) => {
    for (const item of items) {
      const embeddingBuffer = floatArrayToBuffer(item.embedding);
      insert.run(item.errorId, embeddingBuffer, model, item.embedding.length);
    }
  });

  batchInsert(items);

  logger.info(`Batch stored ${items.length} embeddings`);
}

/**
 * Embedding generator interface
 * Implementations can use different providers (OpenAI, Cohere, local models, etc.)
 */
export interface EmbeddingGenerator {
  generate(text: string): Promise<number[]>;
  batchGenerate(texts: string[]): Promise<number[][]>;
  readonly model: string;
  readonly dimensions: number;
}

/**
 * Simple mock embedding generator for testing
 * Generates deterministic embeddings based on text hash
 */
export class MockEmbeddingGenerator implements EmbeddingGenerator {
  readonly model = 'mock-embedding-v1';
  readonly dimensions = 128;

  async generate(text: string): Promise<number[]> {
    // Generate deterministic embedding from text
    const embedding: number[] = [];
    const normalized = text.toLowerCase();

    for (let i = 0; i < this.dimensions; i++) {
      // Use character codes to generate deterministic values
      const charIndex = i % normalized.length;
      const charCode = normalized.charCodeAt(charIndex) || 0;
      const value = Math.sin(charCode * (i + 1)) * Math.cos(i * 0.1);
      embedding.push(value);
    }

    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    return embedding.map((v) => v / (magnitude || 1));
  }

  async batchGenerate(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.generate(text)));
  }
}
