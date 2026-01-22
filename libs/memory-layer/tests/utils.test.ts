import { describe, it, expect } from 'vitest';
import {
  normalizeErrorMessage,
  generateErrorHash,
  extractErrorType,
  suggestSeverity,
  extractTags,
} from '../src/utils/error-hash';
import {
  cosineSimilarity,
  bufferToFloatArray,
  floatArrayToBuffer,
  jaccardSimilarity,
  levenshteinDistance,
  levenshteinSimilarity,
  tokenSimilarity,
  combinedSimilarity,
} from '../src/utils/similarity';

describe('error-hash.ts', () => {
  describe('normalizeErrorMessage', () => {
    it('should normalize file paths', () => {
      const message = 'Error in /home/user/project/src/file.ts';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('<file_path>');
      expect(normalized).not.toContain('/home/user');
    });

    it('should normalize Windows file paths', () => {
      const message = 'Error in C:\\Users\\Admin\\project\\file.ts';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('<file_path>');
      expect(normalized).not.toContain('C:\\Users');
    });

    it('should normalize line numbers', () => {
      const message = 'Error at line 42';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('line <line>');
      expect(normalized).not.toContain('42');
    });

    it('should normalize line:col format', () => {
      const message = 'Error at file.ts:123:45';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain(':<line>:<col>');
    });

    it('should normalize memory addresses', () => {
      const message = 'Segfault at 0x7fff5fbff8c8';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('<addr>');
      expect(normalized).not.toContain('0x7fff');
    });

    it('should normalize UUIDs', () => {
      const message = 'Error for request 550e8400-e29b-41d4-a716-446655440000';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('<uuid>');
    });

    it('should normalize timestamps', () => {
      const message = 'Error at 2024-01-15T10:30:00Z';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('<timestamp>');
    });

    it('should normalize large numbers (IDs)', () => {
      const message = 'User 1234567890 not found';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('<id>');
    });

    it('should normalize IP addresses', () => {
      const message = 'Connection refused from 192.168.1.100';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).toContain('<ip>');
    });

    it('should collapse multiple whitespace', () => {
      const message = 'Error    with   multiple    spaces';
      const normalized = normalizeErrorMessage(message);
      expect(normalized).not.toContain('  ');
    });

    it('should be case insensitive', () => {
      const message1 = 'TypeError: Cannot read property';
      const message2 = 'typeerror: cannot read property';
      const normalized1 = normalizeErrorMessage(message1);
      const normalized2 = normalizeErrorMessage(message2);
      expect(normalized1).toBe(normalized2);
    });
  });

  describe('generateErrorHash', () => {
    it('should generate consistent hash for same message and type', () => {
      const hash1 = generateErrorHash('Error message', 'TypeError');
      const hash2 = generateErrorHash('Error message', 'TypeError');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different types', () => {
      const hash1 = generateErrorHash('Error message', 'TypeError');
      const hash2 = generateErrorHash('Error message', 'ReferenceError');
      expect(hash1).not.toBe(hash2);
    });

    it('should generate same hash for messages that normalize to the same', () => {
      const hash1 = generateErrorHash('Error at line 10', 'SyntaxError');
      const hash2 = generateErrorHash('Error at line 99', 'SyntaxError');
      expect(hash1).toBe(hash2);
    });

    it('should generate 64 character hex string', () => {
      const hash = generateErrorHash('Test error', 'Error');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('extractErrorType', () => {
    it('should extract TypeError', () => {
      expect(extractErrorType('TypeError: Cannot read property')).toBe('TypeError');
    });

    it('should extract ReferenceError', () => {
      expect(extractErrorType('ReferenceError: foo is not defined')).toBe('ReferenceError');
    });

    it('should extract ENOENT as FileNotFound', () => {
      expect(extractErrorType('ENOENT: no such file')).toBe('FileNotFound');
    });

    it('should extract ECONNREFUSED as ConnectionRefused', () => {
      expect(extractErrorType('ECONNREFUSED: connection refused')).toBe('ConnectionRefused');
    });

    it('should extract ESLint as LintError', () => {
      expect(extractErrorType('ESLint: Unexpected token')).toBe('LintError');
    });

    it('should extract TypeScript error', () => {
      expect(extractErrorType('TypeScript error TS2304')).toBe('TypeScriptError');
    });

    it('should return default for unknown errors', () => {
      expect(extractErrorType('Something went wrong', 'Unknown')).toBe('Unknown');
    });
  });

  describe('suggestSeverity', () => {
    it('should suggest critical for security issues', () => {
      expect(suggestSeverity('SQL injection detected')).toBe('critical');
      expect(suggestSeverity('XSS vulnerability found')).toBe('critical');
      expect(suggestSeverity('Security breach detected')).toBe('critical');
    });

    it('should suggest high for crashes and auth issues', () => {
      expect(suggestSeverity('Application crash')).toBe('high');
      expect(suggestSeverity('Permission denied')).toBe('high');
      expect(suggestSeverity('Database connection failed')).toBe('high');
    });

    it('should suggest medium for general errors', () => {
      expect(suggestSeverity('Error: Something failed')).toBe('medium');
      expect(suggestSeverity('Request timeout')).toBe('medium');
      expect(suggestSeverity('Invalid input')).toBe('medium');
    });

    it('should suggest low for warnings', () => {
      expect(suggestSeverity('This is a warning')).toBe('low');
    });
  });

  describe('extractTags', () => {
    it('should extract technology tags', () => {
      const tags = extractTags('React component error', 'TypeError');
      expect(tags).toContain('react');
    });

    it('should extract multiple tags', () => {
      const tags = extractTags('TypeScript webpack build error', 'CompilationError');
      expect(tags).toContain('typescript');
      expect(tags).toContain('webpack');
      expect(tags).toContain('build');
    });

    it('should include error type as tag', () => {
      const tags = extractTags('Some error', 'TypeError');
      expect(tags).toContain('typeerror');
    });

    it('should extract domain tags', () => {
      const tags = extractTags('Authentication validation error', 'ValidationError');
      expect(tags).toContain('authentication');
      expect(tags).toContain('validation');
    });
  });
});

describe('similarity.ts', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const a = [1, 2, 3];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should throw for mismatched lengths', () => {
      expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBe(0);
    });
  });

  describe('bufferToFloatArray and floatArrayToBuffer', () => {
    it('should round-trip correctly', () => {
      const original = [1.5, -2.7, 3.14, 0, -0.001];
      const buffer = floatArrayToBuffer(original);
      const result = bufferToFloatArray(buffer);

      expect(result.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(result[i]).toBeCloseTo(original[i], 5);
      }
    });

    it('should handle empty arrays', () => {
      const buffer = floatArrayToBuffer([]);
      const result = bufferToFloatArray(buffer);
      expect(result).toEqual([]);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1 for identical sets', () => {
      const a = ['apple', 'banana', 'cherry'];
      const b = ['apple', 'banana', 'cherry'];
      expect(jaccardSimilarity(a, b)).toBe(1);
    });

    it('should return 0 for disjoint sets', () => {
      const a = ['apple', 'banana'];
      const b = ['cherry', 'date'];
      expect(jaccardSimilarity(a, b)).toBe(0);
    });

    it('should calculate partial overlap correctly', () => {
      const a = ['apple', 'banana'];
      const b = ['banana', 'cherry'];
      // Intersection: {banana} = 1, Union: {apple, banana, cherry} = 3
      expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3, 5);
    });

    it('should be case insensitive', () => {
      const a = ['Apple', 'BANANA'];
      const b = ['apple', 'banana'];
      expect(jaccardSimilarity(a, b)).toBe(1);
    });

    it('should return 1 for two empty sets', () => {
      expect(jaccardSimilarity([], [])).toBe(1);
    });
  });

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should return length of string when other is empty', () => {
      expect(levenshteinDistance('hello', '')).toBe(5);
      expect(levenshteinDistance('', 'hello')).toBe(5);
    });

    it('should calculate single character operations', () => {
      expect(levenshteinDistance('cat', 'car')).toBe(1); // substitution
      expect(levenshteinDistance('cat', 'cats')).toBe(1); // insertion
      expect(levenshteinDistance('cats', 'cat')).toBe(1); // deletion
    });

    it('should calculate multiple operations', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });
  });

  describe('levenshteinSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(levenshteinSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 1 for two empty strings', () => {
      expect(levenshteinSimilarity('', '')).toBe(1);
    });

    it('should return value between 0 and 1', () => {
      const sim = levenshteinSimilarity('hello', 'world');
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
    });
  });

  describe('tokenSimilarity', () => {
    it('should return 1 for identical sentences', () => {
      expect(tokenSimilarity('hello world', 'hello world')).toBe(1);
    });

    it('should handle different word order', () => {
      const sim = tokenSimilarity('hello world', 'world hello');
      expect(sim).toBe(1); // Same tokens, just different order
    });

    it('should be case insensitive', () => {
      expect(tokenSimilarity('Hello World', 'hello world')).toBe(1);
    });

    it('should calculate partial overlap', () => {
      const sim = tokenSimilarity('hello world', 'hello there');
      // Intersection: {hello} = 1, Union: {hello, world, there} = 3
      expect(sim).toBeCloseTo(1 / 3, 5);
    });
  });

  describe('combinedSimilarity', () => {
    it('should combine token and levenshtein similarity', () => {
      const sim = combinedSimilarity('hello world', 'hello world');
      expect(sim).toBe(1);
    });

    it('should be between 0 and 1', () => {
      const sim = combinedSimilarity('completely different', 'strings here');
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it('should respect custom weights', () => {
      const simDefault = combinedSimilarity('hello world', 'hello there');
      const simTokenHeavy = combinedSimilarity('hello world', 'hello there', {
        token: 1,
        levenshtein: 0,
      });
      const simLevenshteinHeavy = combinedSimilarity('hello world', 'hello there', {
        token: 0,
        levenshtein: 1,
      });

      // These should be different based on weights
      expect(simTokenHeavy).not.toBe(simLevenshteinHeavy);
    });
  });
});
