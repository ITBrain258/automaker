/**
 * Error Hash Utilities
 *
 * Provides functions for normalizing error messages and generating
 * hashes for deduplication.
 */

import crypto from 'crypto';

/**
 * Patterns to normalize in error messages
 */
const NORMALIZATION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // File paths - normalize to placeholder
  { pattern: /(?:\/[\w.-]+)+(?:\/[\w.-]+)*\.\w+/g, replacement: '<FILE_PATH>' },
  { pattern: /(?:[A-Z]:\\[\w\\.-]+)+/gi, replacement: '<FILE_PATH>' },

  // Line numbers
  { pattern: /(?:line|ln|L)\s*:?\s*\d+/gi, replacement: 'line <LINE>' },
  { pattern: /:\d+:\d+/g, replacement: ':<LINE>:<COL>' },

  // Memory addresses and pointers
  { pattern: /0x[0-9a-fA-F]+/g, replacement: '<ADDR>' },

  // UUIDs
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, replacement: '<UUID>' },

  // Timestamps
  { pattern: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, replacement: '<TIMESTAMP>' },

  // Numbers that look like IDs (more than 4 digits)
  { pattern: /\b\d{5,}\b/g, replacement: '<ID>' },

  // IP addresses
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '<IP>' },

  // Port numbers after colon
  { pattern: /:(\d{2,5})(?=\s|$|\/)/g, replacement: ':<PORT>' },

  // Quoted strings (keep short ones, normalize long ones)
  { pattern: /"[^"]{50,}"/g, replacement: '"<LONG_STRING>"' },
  { pattern: /'[^']{50,}'/g, replacement: "'<LONG_STRING>'" },

  // Multiple whitespace
  { pattern: /\s+/g, replacement: ' ' },
];

/**
 * Normalize an error message for comparison
 * Removes variable parts like file paths, line numbers, timestamps, etc.
 */
export function normalizeErrorMessage(message: string): string {
  let normalized = message.trim();

  for (const { pattern, replacement } of NORMALIZATION_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Lowercase for case-insensitive comparison
  normalized = normalized.toLowerCase();

  return normalized.trim();
}

/**
 * Generate a SHA-256 hash for an error message
 * Uses the normalized message for consistent deduplication
 */
export function generateErrorHash(message: string, errorType: string): string {
  const normalized = normalizeErrorMessage(message);
  const content = `${errorType}:${normalized}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extract error type from an error message
 * Attempts to identify common error types from the message
 */
export function extractErrorType(message: string, defaultType: string = 'unknown'): string {
  // Common error type patterns
  const errorTypePatterns: Array<{ pattern: RegExp; type: string }> = [
    { pattern: /TypeError/i, type: 'TypeError' },
    { pattern: /ReferenceError/i, type: 'ReferenceError' },
    { pattern: /SyntaxError/i, type: 'SyntaxError' },
    { pattern: /RangeError/i, type: 'RangeError' },
    { pattern: /URIError/i, type: 'URIError' },
    { pattern: /EvalError/i, type: 'EvalError' },
    { pattern: /ENOENT/i, type: 'FileNotFound' },
    { pattern: /EACCES/i, type: 'PermissionDenied' },
    { pattern: /ECONNREFUSED/i, type: 'ConnectionRefused' },
    { pattern: /ETIMEDOUT/i, type: 'Timeout' },
    { pattern: /ENOTFOUND/i, type: 'NotFound' },
    { pattern: /AssertionError/i, type: 'AssertionError' },
    { pattern: /ValidationError/i, type: 'ValidationError' },
    { pattern: /AuthenticationError/i, type: 'AuthenticationError' },
    { pattern: /AuthorizationError/i, type: 'AuthorizationError' },
    { pattern: /NetworkError/i, type: 'NetworkError' },
    { pattern: /DatabaseError/i, type: 'DatabaseError' },
    { pattern: /ParseError/i, type: 'ParseError' },
    { pattern: /\bESLint\b/i, type: 'LintError' },
    { pattern: /\bTypeScript\b.*error/i, type: 'TypeScriptError' },
    { pattern: /compilation failed/i, type: 'CompilationError' },
    { pattern: /test failed/i, type: 'TestFailure' },
    { pattern: /assertion failed/i, type: 'AssertionError' },
  ];

  for (const { pattern, type } of errorTypePatterns) {
    if (pattern.test(message)) {
      return type;
    }
  }

  return defaultType;
}

/**
 * Extract severity from an error message
 * Returns a suggested severity based on message content
 */
export function suggestSeverity(message: string): 'low' | 'medium' | 'high' | 'critical' {
  const lowerMessage = message.toLowerCase();

  // Critical patterns
  if (
    /(?:security|vulnerability|injection|xss|csrf|breach|leak|expose)/i.test(lowerMessage) ||
    /(?:data loss|corruption|critical|fatal|unrecoverable)/i.test(lowerMessage)
  ) {
    return 'critical';
  }

  // High severity patterns
  if (
    /(?:crash|panic|segfault|out of memory|heap|stack overflow)/i.test(lowerMessage) ||
    /(?:authentication|authorization|permission denied|access denied)/i.test(lowerMessage) ||
    /(?:database|connection failed|service unavailable)/i.test(lowerMessage)
  ) {
    return 'high';
  }

  // Medium severity patterns
  if (
    /(?:error|exception|failed|failure|invalid|unexpected)/i.test(lowerMessage) ||
    /(?:timeout|retry|not found|missing)/i.test(lowerMessage)
  ) {
    return 'medium';
  }

  // Default to low for warnings and other messages
  return 'low';
}

/**
 * Extract potential tags from an error message
 */
export function extractTags(message: string, errorType: string): string[] {
  const tags = new Set<string>();

  // Add error type as tag
  tags.add(errorType.toLowerCase());

  // Technology/framework patterns
  const techPatterns: Array<{ pattern: RegExp; tag: string }> = [
    { pattern: /\breact\b/i, tag: 'react' },
    { pattern: /\bvue\b/i, tag: 'vue' },
    { pattern: /\bangular\b/i, tag: 'angular' },
    { pattern: /\bnode(?:js)?\b/i, tag: 'nodejs' },
    { pattern: /\btypescript\b/i, tag: 'typescript' },
    { pattern: /\bjavascript\b/i, tag: 'javascript' },
    { pattern: /\bpython\b/i, tag: 'python' },
    { pattern: /\brust\b/i, tag: 'rust' },
    { pattern: /\bgo(?:lang)?\b/i, tag: 'golang' },
    { pattern: /\bwebpack\b/i, tag: 'webpack' },
    { pattern: /\bvite\b/i, tag: 'vite' },
    { pattern: /\best\b/i, tag: 'esbuild' },
    { pattern: /\bnpm\b/i, tag: 'npm' },
    { pattern: /\byarn\b/i, tag: 'yarn' },
    { pattern: /\bpnpm\b/i, tag: 'pnpm' },
    { pattern: /\bgit\b/i, tag: 'git' },
    { pattern: /\bdocker\b/i, tag: 'docker' },
    { pattern: /\bkubernetes\b|\bk8s\b/i, tag: 'kubernetes' },
    { pattern: /\baws\b/i, tag: 'aws' },
    { pattern: /\bpostgres(?:ql)?\b/i, tag: 'postgresql' },
    { pattern: /\bmysql\b/i, tag: 'mysql' },
    { pattern: /\bmongodb\b/i, tag: 'mongodb' },
    { pattern: /\bredis\b/i, tag: 'redis' },
    { pattern: /\bsqlite\b/i, tag: 'sqlite' },
    { pattern: /\bhttp\b/i, tag: 'http' },
    { pattern: /\bapi\b/i, tag: 'api' },
    { pattern: /\brest\b/i, tag: 'rest' },
    { pattern: /\bgraphql\b/i, tag: 'graphql' },
    { pattern: /\bwebsocket\b/i, tag: 'websocket' },
  ];

  for (const { pattern, tag } of techPatterns) {
    if (pattern.test(message)) {
      tags.add(tag);
    }
  }

  // Domain patterns
  const domainPatterns: Array<{ pattern: RegExp; tag: string }> = [
    { pattern: /\bauth(?:entication|orization)?\b/i, tag: 'authentication' },
    { pattern: /\bvalidation\b/i, tag: 'validation' },
    { pattern: /\bparsing\b|\bparse\b/i, tag: 'parsing' },
    { pattern: /\bnetwork\b/i, tag: 'network' },
    { pattern: /\bfile\b|\bfilesystem\b/i, tag: 'filesystem' },
    { pattern: /\bdatabase\b|\bdb\b/i, tag: 'database' },
    { pattern: /\bcache\b|\bcaching\b/i, tag: 'caching' },
    { pattern: /\basync\b|\bpromise\b/i, tag: 'async' },
    { pattern: /\btype\b|\btyping\b/i, tag: 'types' },
    { pattern: /\bimport\b|\bexport\b|\bmodule\b/i, tag: 'modules' },
    { pattern: /\bbuild\b|\bcompile\b/i, tag: 'build' },
    { pattern: /\btest\b|\btesting\b/i, tag: 'testing' },
    { pattern: /\bdeploy\b|\bdeployment\b/i, tag: 'deployment' },
  ];

  for (const { pattern, tag } of domainPatterns) {
    if (pattern.test(message)) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}
