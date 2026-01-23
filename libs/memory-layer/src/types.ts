/**
 * Memory Layer Types
 * TypeScript interfaces for the cross-project memory layer
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Severity levels for errors
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Input for recording a new error
 */
export interface ErrorInput {
  message: string;
  errorType: string;
  severity: ErrorSeverity;
  stackTrace?: string;
  filePath?: string;
  projectName?: string;
  tags?: string[];
}

/**
 * Stored error record
 */
export interface ErrorRecord {
  id: number;
  hash: string;
  message: string;
  normalizedMessage: string;
  errorType: string;
  severity: ErrorSeverity;
  stackTrace: string | null;
  filePath: string | null;
  projectName: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

/**
 * Error with associated tags
 */
export interface ErrorWithTags extends ErrorRecord {
  tags: string[];
}

// ============================================================================
// Solution Types
// ============================================================================

/**
 * Source of a solution
 */
export type SolutionSource = 'auto_mode' | 'agent' | 'manual';

/**
 * Input for recording a new solution
 */
export interface SolutionInput {
  errorId: number;
  content: string;
  codeSnippet?: string;
  source: SolutionSource;
  projectName?: string;
}

/**
 * Stored solution record
 */
export interface SolutionRecord {
  id: number;
  errorId: number;
  content: string;
  codeSnippet: string | null;
  successCount: number;
  failureCount: number;
  successRate: number;
  source: SolutionSource;
  projectName: string | null;
  createdAt: string;
}

// ============================================================================
// Tag Types
// ============================================================================

/**
 * Tag category for organization
 */
export type TagCategory = 'error_type' | 'technology' | 'framework' | 'domain' | 'custom';

/**
 * Tag record
 */
export interface TagRecord {
  id: number;
  name: string;
  category: TagCategory | null;
}

// ============================================================================
// Embedding Types
// ============================================================================

/**
 * Embedding record for semantic search
 */
export interface EmbeddingRecord {
  id: number;
  errorId: number;
  embedding: Buffer;
  model: string;
  dimensions: number;
}

// ============================================================================
// Search Types
// ============================================================================

/**
 * Options for searching errors
 */
export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  tags?: string[];
  projectName?: string;
  errorType?: string;
  severity?: ErrorSeverity;
  includeEmbeddings?: boolean;
}

/**
 * Search result for an error
 */
export interface ErrorSearchResult {
  error: ErrorWithTags;
  solutions: SolutionRecord[];
  similarity?: number;
  matchType: 'exact' | 'hash' | 'semantic' | 'tag';
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Task context for retrieving relevant memories
 */
export interface TaskContext {
  featureTitle?: string;
  featureDescription?: string;
  errorMessage?: string;
  filePath?: string;
  projectName?: string;
  tags?: string[];
}

/**
 * Formatted memory context for agent prompts
 */
export interface MemoryContext {
  relevantErrors: ErrorSearchResult[];
  formattedPrompt: string;
  totalMatches: number;
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Overall statistics for the memory layer
 */
export interface MemoryLayerStats {
  totalErrors: number;
  totalSolutions: number;
  totalTags: number;
  totalEmbeddings: number;
  topErrorTypes: Array<{ type: string; count: number }>;
  averageSuccessRate: number;
  errorsWithSolutions: number;
  errorsByProject: Array<{ project: string; count: number }>;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for the memory layer
 */
export interface MemoryLayerConfig {
  dataDir?: string;
  enableEmbeddings?: boolean;
  embeddingModel?: string;
  maxSearchResults?: number;
  minSimilarityThreshold?: number;
}

// ============================================================================
// Database Types
// ============================================================================

/**
 * Raw row from errors table
 */
export interface ErrorRow {
  id: number;
  hash: string;
  message: string;
  normalized_message: string;
  error_type: string;
  severity: string;
  stack_trace: string | null;
  file_path: string | null;
  project_name: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

/**
 * Raw row from solutions table
 */
export interface SolutionRow {
  id: number;
  error_id: number;
  content: string;
  code_snippet: string | null;
  success_count: number;
  failure_count: number;
  success_rate: number;
  source: string;
  project_name: string | null;
  created_at: string;
}

/**
 * Raw row from tags table
 */
export interface TagRow {
  id: number;
  name: string;
  category: string | null;
}

/**
 * Raw row from embeddings table
 */
export interface EmbeddingRow {
  id: number;
  error_id: number;
  embedding: Buffer;
  model: string;
  dimensions: number;
}
