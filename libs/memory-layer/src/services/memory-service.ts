/**
 * Memory Service - High-Level API
 *
 * Provides the main interface for the memory layer,
 * coordinating between error, solution, tag, and embedding services.
 */

import { createLogger } from '@automaker/utils';
import {
  initializeDatabase,
  closeDatabase,
  isDatabaseInitialized,
  getDefaultDataDir,
} from '../database/connection.js';
import type {
  ErrorInput,
  ErrorSearchResult,
  MemoryContext,
  MemoryLayerConfig,
  MemoryLayerStats,
  SearchOptions,
  SolutionInput,
  TaskContext,
} from '../types.js';
import {
  recordError,
  getErrorById,
  findSimilarErrors,
  searchErrors,
  getErrorCount,
  getErrorTypeStats,
  getErrorsByProjectStats,
} from './error-service.js';
import {
  recordSolution,
  recordSolutionOutcome,
  getSolutionsForError,
  getSolutionCount,
  getAverageSuccessRate,
  getErrorsWithSolutionsCount,
} from './solution-service.js';
import { getTagCount, getOrCreateTags, addTagsToError, getTagByName } from './tag-service.js';
import {
  getEmbeddingCount,
  findSimilarByEmbedding,
  storeEmbedding,
  type EmbeddingGenerator,
} from './embedding-service.js';
import { buildMemoryContext, extractContextKeywords } from '../utils/context-builder.js';
import { normalizeErrorMessage } from '../utils/error-hash.js';

const logger = createLogger('MemoryLayer:MemoryService');

/**
 * Memory layer configuration state
 */
let config: MemoryLayerConfig = {};
let embeddingGenerator: EmbeddingGenerator | null = null;

/**
 * Initialize the memory layer
 */
export async function initialize(options: MemoryLayerConfig = {}): Promise<void> {
  config = options;

  const dataDir = options.dataDir || getDefaultDataDir();
  logger.info(`Initializing memory layer at: ${dataDir}`);

  await initializeDatabase(dataDir);

  logger.info('Memory layer initialized successfully');
}

/**
 * Set the embedding generator for semantic search
 */
export function setEmbeddingGenerator(generator: EmbeddingGenerator): void {
  embeddingGenerator = generator;
  logger.info(`Embedding generator set: ${generator.model} (${generator.dimensions} dimensions)`);
}

/**
 * Check if the memory layer is initialized
 */
export function isInitialized(): boolean {
  return isDatabaseInitialized();
}

/**
 * Shutdown the memory layer
 */
export function shutdown(): void {
  logger.info('Shutting down memory layer...');
  closeDatabase();
  embeddingGenerator = null;
  logger.info('Memory layer shut down');
}

/**
 * Record an error
 */
export async function captureError(input: ErrorInput): Promise<number> {
  const errorId = recordError(input);

  // Generate embedding if enabled and generator is available
  if (config.enableEmbeddings && embeddingGenerator) {
    try {
      const embedding = await embeddingGenerator.generate(input.message);
      storeEmbedding(errorId, embedding, embeddingGenerator.model);
    } catch (error) {
      logger.warn(`Failed to generate embedding for error ${errorId}:`, error);
    }
  }

  return errorId;
}

/**
 * Record a solution for an error
 */
export function captureSolution(input: SolutionInput): number {
  return recordSolution(input);
}

/**
 * Record the outcome of a solution attempt
 */
export function reportOutcome(solutionId: number, success: boolean): void {
  recordSolutionOutcome(solutionId, success);
}

/**
 * Find similar errors to a given message
 */
export async function findSimilar(
  errorMessage: string,
  options: SearchOptions = {}
): Promise<ErrorSearchResult[]> {
  const results: ErrorSearchResult[] = [];
  const seenIds = new Set<number>();

  // Try semantic search if embeddings are enabled
  if (config.enableEmbeddings && embeddingGenerator && options.includeEmbeddings !== false) {
    try {
      const embedding = await embeddingGenerator.generate(errorMessage);
      const semanticResults = findSimilarByEmbedding(embedding, {
        limit: options.limit || 5,
        minSimilarity: options.minSimilarity || 0.7,
      });

      for (const result of semanticResults) {
        if (!seenIds.has(result.error.id)) {
          seenIds.add(result.error.id);
          const solutions = getSolutionsForError(result.error.id);
          results.push({
            error: result.error,
            solutions,
            similarity: result.similarity,
            matchType: 'semantic',
          });
        }
      }
    } catch (error) {
      logger.warn('Semantic search failed, falling back to text similarity:', error);
    }
  }

  // Text similarity search
  const textResults = findSimilarErrors(errorMessage, {
    ...options,
    limit: (options.limit || 10) - results.length,
  });

  for (const result of textResults) {
    if (!seenIds.has(result.error.id)) {
      seenIds.add(result.error.id);
      const solutions = getSolutionsForError(result.error.id);
      results.push({
        error: result.error,
        solutions,
        similarity: result.similarity,
        matchType: result.similarity === 1.0 ? 'exact' : 'hash',
      });
    }
  }

  // Sort by similarity
  results.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  return results.slice(0, options.limit || 10);
}

/**
 * Find errors by tags
 */
export function findByTags(tags: string[]): ErrorSearchResult[] {
  const errors = searchErrors({ tags });

  return errors.map((error) => {
    const solutions = getSolutionsForError(error.id);
    return {
      error,
      solutions,
      matchType: 'tag' as const,
    };
  });
}

/**
 * Get relevant memories for a task context
 */
export async function getRelevantMemories(context: TaskContext): Promise<MemoryContext> {
  const results: ErrorSearchResult[] = [];
  const seenIds = new Set<number>();

  // Search by error message if provided
  if (context.errorMessage) {
    const errorResults = await findSimilar(context.errorMessage, {
      limit: 5,
      minSimilarity: 0.5,
    });

    for (const result of errorResults) {
      if (!seenIds.has(result.error.id)) {
        seenIds.add(result.error.id);
        results.push(result);
      }
    }
  }

  // Search by tags if provided
  if (context.tags && context.tags.length > 0) {
    const tagResults = findByTags(context.tags);
    for (const result of tagResults.slice(0, 3)) {
      if (!seenIds.has(result.error.id)) {
        seenIds.add(result.error.id);
        results.push(result);
      }
    }
  }

  // Extract keywords from context and search by tags
  const keywords = extractContextKeywords(context);
  if (keywords.length > 0) {
    const keywordTags = keywords.slice(0, 5);
    const tagResults = findByTags(keywordTags);
    for (const result of tagResults.slice(0, 3)) {
      if (!seenIds.has(result.error.id)) {
        seenIds.add(result.error.id);
        results.push(result);
      }
    }
  }

  // Prioritize results with successful solutions
  results.sort((a, b) => {
    const aScore = calculateResultScore(a);
    const bScore = calculateResultScore(b);
    return bScore - aScore;
  });

  // Limit to top 5 most relevant
  const topResults = results.slice(0, 5);

  return buildMemoryContext(topResults);
}

/**
 * Calculate a score for a search result based on various factors
 */
function calculateResultScore(result: ErrorSearchResult): number {
  let score = 0;

  // Similarity contributes to score
  score += (result.similarity || 0) * 40;

  // Having solutions is valuable
  if (result.solutions.length > 0) {
    score += 20;

    // Success rate of best solution
    const bestSolution = result.solutions.reduce((best, s) =>
      s.successRate > best.successRate ? s : best
    );
    score += bestSolution.successRate * 30;

    // More successful attempts = more confidence
    const totalAttempts = bestSolution.successCount + bestSolution.failureCount;
    score += Math.min(totalAttempts * 2, 10);
  }

  return score;
}

/**
 * Get memory layer statistics
 */
export function getStats(): MemoryLayerStats {
  return {
    totalErrors: getErrorCount(),
    totalSolutions: getSolutionCount(),
    totalTags: getTagCount(),
    totalEmbeddings: getEmbeddingCount(),
    topErrorTypes: getErrorTypeStats().slice(0, 10),
    averageSuccessRate: getAverageSuccessRate(),
    errorsWithSolutions: getErrorsWithSolutionsCount(),
    errorsByProject: getErrorsByProjectStats().slice(0, 10),
  };
}

/**
 * Add tags to an existing error
 */
export function tagError(errorId: number, tags: string[]): void {
  const tagRecords = getOrCreateTags(tags);
  addTagsToError(
    errorId,
    tagRecords.map((t) => t.id)
  );
}

/**
 * Record an error-solution pair in one call
 */
export async function recordErrorWithSolution(
  error: ErrorInput,
  solution: Omit<SolutionInput, 'errorId'>
): Promise<{ errorId: number; solutionId: number }> {
  const errorId = await captureError(error);
  const solutionId = captureSolution({ ...solution, errorId });

  return { errorId, solutionId };
}

/**
 * Convenience function to check for known solutions before attempting a task
 */
export async function checkForKnownSolutions(
  errorMessage: string
): Promise<{ found: boolean; solutions: ErrorSearchResult[] }> {
  const results = await findSimilar(errorMessage, {
    limit: 3,
    minSimilarity: 0.7,
  });

  const withSolutions = results.filter((r) => r.solutions.length > 0);

  return {
    found: withSolutions.length > 0,
    solutions: withSolutions,
  };
}

/**
 * Export memory data for backup or migration
 */
export function exportData(): {
  errors: Array<{ error: ErrorSearchResult }>;
  stats: MemoryLayerStats;
} {
  const errors = searchErrors({ limit: 10000 });

  const exportedErrors = errors.map((error) => {
    const solutions = getSolutionsForError(error.id);
    return {
      error: {
        error,
        solutions,
        matchType: 'exact' as const,
      },
    };
  });

  return {
    errors: exportedErrors,
    stats: getStats(),
  };
}
