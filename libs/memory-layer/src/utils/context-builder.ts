/**
 * Context Builder Utilities
 *
 * Builds formatted context from memory layer data for agent prompts.
 */

import type { ErrorSearchResult, MemoryContext, SolutionRecord } from '../types.js';

/**
 * Format a single error-solution pair for the prompt
 */
function formatErrorSolution(result: ErrorSearchResult, index: number): string {
  const { error, solutions, matchType, similarity } = result;

  const lines: string[] = [];

  // Header with match info
  const matchInfo =
    matchType === 'semantic' && similarity ? ` (${Math.round(similarity * 100)}% similar)` : '';
  lines.push(`### ${index + 1}. ${error.errorType}${matchInfo}`);
  lines.push('');

  // Error details
  lines.push('**Error Message:**');
  lines.push('```');
  lines.push(error.message.slice(0, 500) + (error.message.length > 500 ? '...' : ''));
  lines.push('```');
  lines.push('');

  // Tags if present
  if (error.tags.length > 0) {
    lines.push(`**Tags:** ${error.tags.join(', ')}`);
    lines.push('');
  }

  // Occurrence info
  if (error.occurrenceCount > 1) {
    lines.push(`**Seen ${error.occurrenceCount} times** (last: ${error.lastSeenAt})`);
    lines.push('');
  }

  // Solutions (sorted by success rate)
  if (solutions.length > 0) {
    const sortedSolutions = [...solutions].sort((a, b) => b.successRate - a.successRate);

    lines.push('**Solutions:**');
    lines.push('');

    for (const solution of sortedSolutions.slice(0, 3)) {
      const successInfo = formatSuccessInfo(solution);
      lines.push(`${successInfo}`);
      lines.push('');
      lines.push(solution.content);

      if (solution.codeSnippet) {
        lines.push('');
        lines.push('```');
        lines.push(solution.codeSnippet);
        lines.push('```');
      }
      lines.push('');
    }
  } else {
    lines.push('*No verified solutions yet.*');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format success rate information for a solution
 */
function formatSuccessInfo(solution: SolutionRecord): string {
  const total = solution.successCount + solution.failureCount;

  if (total === 0) {
    return '- *Untested solution*';
  }

  const percentage = Math.round(solution.successRate * 100);
  const emoji = percentage >= 80 ? '✅' : percentage >= 50 ? '⚠️' : '❌';

  return `- ${emoji} **${percentage}% success rate** (${solution.successCount}/${total} attempts) from ${solution.source}`;
}

/**
 * Build a formatted prompt section from memory context
 */
export function buildMemoryPrompt(results: ErrorSearchResult[]): string {
  if (results.length === 0) {
    return '';
  }

  const lines: string[] = [];

  lines.push('# Relevant Past Errors & Solutions');
  lines.push('');
  lines.push('The following errors and solutions from past work may be relevant to your current task.');
  lines.push('**Review these before proceeding to avoid repeating known issues.**');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (let i = 0; i < results.length; i++) {
    lines.push(formatErrorSolution(results[i], i));
    if (i < results.length - 1) {
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

/**
 * Build a complete memory context from search results
 */
export function buildMemoryContext(results: ErrorSearchResult[]): MemoryContext {
  return {
    relevantErrors: results,
    formattedPrompt: buildMemoryPrompt(results),
    totalMatches: results.length,
  };
}

/**
 * Build a summary of memory layer contents for display
 */
export function buildMemorySummary(results: ErrorSearchResult[]): string {
  if (results.length === 0) {
    return 'No relevant memories found.';
  }

  const lines: string[] = [];

  lines.push(`Found ${results.length} relevant error(s):`);
  lines.push('');

  for (const result of results.slice(0, 5)) {
    const solutionCount = result.solutions.length;
    const avgSuccess =
      solutionCount > 0
        ? Math.round(
            (result.solutions.reduce((sum, s) => sum + s.successRate, 0) / solutionCount) * 100
          )
        : 0;

    const shortMessage =
      result.error.message.slice(0, 60) + (result.error.message.length > 60 ? '...' : '');

    lines.push(`• [${result.error.errorType}] ${shortMessage}`);
    lines.push(
      `  ${solutionCount} solution(s)${solutionCount > 0 ? `, avg ${avgSuccess}% success` : ''}`
    );
  }

  if (results.length > 5) {
    lines.push(`  ... and ${results.length - 5} more`);
  }

  return lines.join('\n');
}

/**
 * Extract keywords from task context for memory search
 */
export function extractContextKeywords(context: {
  featureTitle?: string;
  featureDescription?: string;
  errorMessage?: string;
  filePath?: string;
}): string[] {
  const keywords = new Set<string>();

  const text = [
    context.featureTitle,
    context.featureDescription,
    context.errorMessage,
    context.filePath,
  ]
    .filter(Boolean)
    .join(' ');

  // Extract meaningful words (skip common words)
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'is',
    'it',
    'this',
    'that',
    'be',
    'as',
    'are',
    'was',
    'were',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  for (const word of words) {
    keywords.add(word);
  }

  return Array.from(keywords);
}
