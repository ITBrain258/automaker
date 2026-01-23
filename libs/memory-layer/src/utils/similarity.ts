/**
 * Similarity Calculation Utilities
 *
 * Provides functions for calculating similarity between vectors
 * and text strings.
 */

/**
 * Calculate cosine similarity between two vectors
 * Returns a value between -1 and 1, where 1 means identical direction
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Convert a Buffer containing float32 values to a number array
 */
export function bufferToFloatArray(buffer: Buffer): number[] {
  const floats: number[] = [];
  for (let i = 0; i < buffer.length; i += 4) {
    floats.push(buffer.readFloatLE(i));
  }
  return floats;
}

/**
 * Convert a number array to a Buffer of float32 values
 */
export function floatArrayToBuffer(arr: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) {
    buffer.writeFloatLE(arr[i], i * 4);
  }
  return buffer;
}

/**
 * Calculate Jaccard similarity between two sets of strings
 * Returns a value between 0 and 1
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));

  if (setA.size === 0 && setB.size === 0) {
    return 1; // Both empty = identical
  }

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate normalized Levenshtein similarity
 * Returns a value between 0 and 1, where 1 means identical
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLength;
}

/**
 * Calculate token-based similarity between two strings
 * Splits on whitespace and compares tokens
 */
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = a.toLowerCase().split(/\s+/).filter(Boolean);
  const tokensB = b.toLowerCase().split(/\s+/).filter(Boolean);

  return jaccardSimilarity(tokensA, tokensB);
}

/**
 * Combined similarity score using multiple metrics
 * Weights can be adjusted based on use case
 */
export function combinedSimilarity(
  a: string,
  b: string,
  weights: { token?: number; levenshtein?: number } = {}
): number {
  const { token = 0.6, levenshtein = 0.4 } = weights;

  const tokenSim = tokenSimilarity(a, b);
  const levenshteinSim = levenshteinSimilarity(a, b);

  return token * tokenSim + levenshtein * levenshteinSim;
}

/**
 * Find the most similar items from a list based on a similarity function
 */
export function findMostSimilar<T>(
  target: T,
  items: T[],
  similarityFn: (a: T, b: T) => number,
  options: { limit?: number; minSimilarity?: number } = {}
): Array<{ item: T; similarity: number }> {
  const { limit = 10, minSimilarity = 0 } = options;

  const scored = items
    .map((item) => ({
      item,
      similarity: similarityFn(target, item),
    }))
    .filter((result) => result.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, limit);
}
