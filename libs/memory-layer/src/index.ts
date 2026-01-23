/**
 * @automaker/memory-layer
 *
 * Cross-project memory layer for storing and retrieving error-solution pairs.
 * Uses SQLite for persistent storage with support for semantic search via embeddings.
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Error types
  ErrorSeverity,
  ErrorInput,
  ErrorRecord,
  ErrorWithTags,
  // Solution types
  SolutionSource,
  SolutionInput,
  SolutionRecord,
  // Tag types
  TagCategory,
  TagRecord,
  // Embedding types
  EmbeddingRecord,
  // Search types
  SearchOptions,
  ErrorSearchResult,
  // Context types
  TaskContext,
  MemoryContext,
  // Stats types
  MemoryLayerStats,
  // Config types
  MemoryLayerConfig,
} from './types.js';

// ============================================================================
// High-Level API (Memory Service)
// ============================================================================

export {
  // Initialization
  initialize,
  isInitialized,
  shutdown,
  // Configuration
  setEmbeddingGenerator,
  // Error recording
  captureError,
  // Solution recording
  captureSolution,
  reportOutcome,
  // Convenience methods
  recordErrorWithSolution,
  tagError,
  // Search
  findSimilar,
  findByTags,
  getRelevantMemories,
  checkForKnownSolutions,
  // Statistics
  getStats,
  // Export
  exportData,
} from './services/memory-service.js';

// ============================================================================
// Error Service (Lower-level)
// ============================================================================

export {
  recordError,
  getErrorById,
  getErrorByHash,
  findErrorByMessage,
  searchErrors,
  findSimilarErrors,
  getRecentErrors,
  getFrequentErrors,
  deleteError,
  getErrorCount,
  getErrorTypeStats,
  getErrorsByProjectStats,
} from './services/error-service.js';

// ============================================================================
// Solution Service (Lower-level)
// ============================================================================

export {
  recordSolution,
  recordSolutionOutcome,
  getSolutionById,
  getSolutionsForError,
  getBestSolutionForError,
  getSuccessfulSolutions,
  getRecentSolutions,
  updateSolution,
  deleteSolution,
  deleteSolutionsForError,
  getSolutionCount,
  getAverageSuccessRate,
  getErrorsWithSolutionsCount,
  getSolutionsBySource,
} from './services/solution-service.js';

// ============================================================================
// Tag Service (Lower-level)
// ============================================================================

export {
  createTag,
  getTagByName,
  getTagById,
  getOrCreateTags,
  getAllTags,
  getTagsByCategory,
  getTagsByErrorId,
  addTagsToError,
  removeTagsFromError,
  setErrorTags,
  getErrorIdsByTag,
  getErrorIdsByTags,
  getPopularTags,
  updateTagCategory,
  deleteTag,
  getTagCount,
  searchTags,
} from './services/tag-service.js';

// ============================================================================
// Embedding Service (Lower-level)
// ============================================================================

export {
  DEFAULT_EMBEDDING_DIMENSIONS,
  storeEmbedding,
  getEmbeddingByErrorId,
  getEmbeddingVector,
  deleteEmbedding,
  findSimilarByEmbedding,
  hasEmbedding,
  getEmbeddingCount,
  getErrorsWithoutEmbeddings,
  batchStoreEmbeddings,
  MockEmbeddingGenerator,
  type EmbeddingGenerator,
} from './services/embedding-service.js';

// ============================================================================
// Database (Low-level)
// ============================================================================

export {
  initializeDatabase,
  getDatabase,
  isDatabaseInitialized,
  getDatabasePath,
  closeDatabase,
  getDefaultDataDir,
  withTransaction,
  getDatabaseStats,
  optimizeDatabase,
} from './database/connection.js';

export { CURRENT_SCHEMA_VERSION, SCHEMA_VERSIONS } from './database/schema.js';

export {
  getSchemaVersion,
  runMigrations,
  needsMigration,
  validateSchema,
} from './database/migrations.js';

// ============================================================================
// Utilities
// ============================================================================

export {
  normalizeErrorMessage,
  generateErrorHash,
  extractErrorType,
  suggestSeverity,
  extractTags,
} from './utils/error-hash.js';

export {
  cosineSimilarity,
  bufferToFloatArray,
  floatArrayToBuffer,
  jaccardSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  tokenSimilarity,
  combinedSimilarity,
  findMostSimilar,
} from './utils/similarity.js';

export {
  buildMemoryPrompt,
  buildMemoryContext,
  buildMemorySummary,
  extractContextKeywords,
} from './utils/context-builder.js';
