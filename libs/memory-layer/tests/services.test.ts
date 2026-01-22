import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  initializeDatabase,
  closeDatabase,
  getDatabase,
  isDatabaseInitialized,
} from '../src/database/connection';
import { recordError, getErrorById, findSimilarErrors, searchErrors } from '../src/services/error-service';
import {
  recordSolution,
  recordSolutionOutcome,
  getSolutionsForError,
  getBestSolutionForError,
} from '../src/services/solution-service';
import {
  createTag,
  getTagByName,
  getOrCreateTags,
  addTagsToError,
  getTagsByErrorId,
} from '../src/services/tag-service';
import {
  storeEmbedding,
  getEmbeddingVector,
  findSimilarByEmbedding,
  MockEmbeddingGenerator,
} from '../src/services/embedding-service';

// Use temp directory for test database
const TEST_DATA_DIR = path.join(os.tmpdir(), 'automaker-memory-test-' + Date.now());

describe('Memory Layer Services', () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
    await initializeDatabase(TEST_DATA_DIR);
  });

  afterAll(async () => {
    closeDatabase();
    // Clean up test directory
    try {
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Database Connection', () => {
    it('should be initialized', () => {
      expect(isDatabaseInitialized()).toBe(true);
    });

    it('should return database instance', () => {
      const db = getDatabase();
      expect(db).toBeDefined();
    });
  });

  describe('Error Service', () => {
    it('should record a new error', () => {
      const errorId = recordError({
        message: 'Test error message',
        errorType: 'TestError',
        severity: 'medium',
      });

      expect(errorId).toBeGreaterThan(0);
    });

    it('should retrieve error by id', () => {
      const errorId = recordError({
        message: 'Retrievable error',
        errorType: 'TestError',
        severity: 'low',
        stackTrace: 'at test.ts:1',
        filePath: '/test/file.ts',
        projectName: 'test-project',
        tags: ['test', 'unit'],
      });

      const error = getErrorById(errorId);

      expect(error).not.toBeNull();
      expect(error!.message).toBe('Retrievable error');
      expect(error!.errorType).toBe('TestError');
      expect(error!.severity).toBe('low');
      expect(error!.stackTrace).toBe('at test.ts:1');
      expect(error!.filePath).toBe('/test/file.ts');
      expect(error!.projectName).toBe('test-project');
      expect(error!.tags).toContain('test');
    });

    it('should increment occurrence count for duplicate errors', () => {
      const message = 'Duplicate error ' + Date.now();

      const id1 = recordError({
        message,
        errorType: 'TestError',
        severity: 'medium',
      });

      const id2 = recordError({
        message,
        errorType: 'TestError',
        severity: 'medium',
      });

      // Should return same ID (deduplication)
      expect(id2).toBe(id1);

      const error = getErrorById(id1);
      expect(error!.occurrenceCount).toBe(2);
    });

    it('should find similar errors by text', () => {
      const uniqueKey = Date.now();
      recordError({
        message: `TypeError unique${uniqueKey}: Cannot read property 'foo' of undefined`,
        errorType: 'TypeError',
        severity: 'high',
      });

      const results = findSimilarErrors(`TypeError unique${uniqueKey}: Cannot read property 'bar' of undefined`);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThan(0.5);
    });

    it('should search errors by tags', () => {
      const uniqueTag = 'unique-tag-' + Date.now();

      recordError({
        message: 'Tagged error for search',
        errorType: 'TestError',
        severity: 'low',
        tags: [uniqueTag],
      });

      const results = searchErrors({ tags: [uniqueTag] });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].tags).toContain(uniqueTag);
    });

    it('should search errors by error type', () => {
      const uniqueType = 'UniqueType' + Date.now();

      recordError({
        message: 'Error with unique type',
        errorType: uniqueType,
        severity: 'medium',
      });

      const results = searchErrors({ errorType: uniqueType });

      expect(results.length).toBe(1);
      expect(results[0].errorType).toBe(uniqueType);
    });
  });

  describe('Solution Service', () => {
    let testErrorId: number;

    beforeEach(() => {
      testErrorId = recordError({
        message: 'Error for solution test ' + Date.now(),
        errorType: 'SolutionTestError',
        severity: 'medium',
      });
    });

    it('should record a solution', () => {
      const solutionId = recordSolution({
        errorId: testErrorId,
        content: 'Fix by doing X',
        source: 'manual',
      });

      expect(solutionId).toBeGreaterThan(0);
    });

    it('should record solution with code snippet', () => {
      const solutionId = recordSolution({
        errorId: testErrorId,
        content: 'Add null check',
        codeSnippet: 'if (foo) { foo.bar(); }',
        source: 'agent',
        projectName: 'test-project',
      });

      const solutions = getSolutionsForError(testErrorId);
      const solution = solutions.find((s) => s.id === solutionId);

      expect(solution).toBeDefined();
      expect(solution!.codeSnippet).toBe('if (foo) { foo.bar(); }');
      expect(solution!.source).toBe('agent');
    });

    it('should track solution outcomes', () => {
      const solutionId = recordSolution({
        errorId: testErrorId,
        content: 'Solution with outcomes',
        source: 'auto_mode',
      });

      // Record some outcomes
      recordSolutionOutcome(solutionId, true);
      recordSolutionOutcome(solutionId, true);
      recordSolutionOutcome(solutionId, false);

      const solutions = getSolutionsForError(testErrorId);
      const solution = solutions.find((s) => s.id === solutionId);

      expect(solution!.successCount).toBe(2);
      expect(solution!.failureCount).toBe(1);
      expect(solution!.successRate).toBeCloseTo(2 / 3, 5);
    });

    it('should get best solution by success rate', () => {
      // Add multiple solutions with different success rates
      const solution1Id = recordSolution({
        errorId: testErrorId,
        content: 'Bad solution',
        source: 'manual',
      });
      recordSolutionOutcome(solution1Id, false);
      recordSolutionOutcome(solution1Id, false);

      const solution2Id = recordSolution({
        errorId: testErrorId,
        content: 'Good solution',
        source: 'agent',
      });
      recordSolutionOutcome(solution2Id, true);
      recordSolutionOutcome(solution2Id, true);

      const best = getBestSolutionForError(testErrorId);

      expect(best).not.toBeNull();
      expect(best!.content).toBe('Good solution');
      expect(best!.successRate).toBe(1);
    });
  });

  describe('Tag Service', () => {
    it('should create a tag', () => {
      const uniqueName = 'test-tag-' + Date.now();
      const tag = createTag(uniqueName, 'custom');

      expect(tag.id).toBeGreaterThan(0);
      expect(tag.name).toBe(uniqueName);
      expect(tag.category).toBe('custom');
    });

    it('should get tag by name', () => {
      const uniqueName = 'findable-tag-' + Date.now();
      createTag(uniqueName);

      const found = getTagByName(uniqueName);

      expect(found).not.toBeNull();
      expect(found!.name).toBe(uniqueName);
    });

    it('should be case insensitive', () => {
      const uniqueName = 'CaseSensitive-' + Date.now();
      createTag(uniqueName);

      const found = getTagByName(uniqueName.toLowerCase());

      expect(found).not.toBeNull();
    });

    it('should get or create tags', () => {
      const existing = 'existing-' + Date.now();
      const newTag = 'new-' + Date.now();

      createTag(existing);

      const tags = getOrCreateTags([existing, newTag]);

      expect(tags.length).toBe(2);
      expect(tags.map((t) => t.name)).toContain(existing);
      expect(tags.map((t) => t.name)).toContain(newTag);
    });

    it('should add and retrieve tags for error', () => {
      const errorId = recordError({
        message: 'Error for tagging ' + Date.now(),
        errorType: 'TestError',
        severity: 'low',
      });

      const tags = getOrCreateTags(['tag-a-' + Date.now(), 'tag-b-' + Date.now()]);
      addTagsToError(
        errorId,
        tags.map((t) => t.id)
      );

      const errorTags = getTagsByErrorId(errorId);

      expect(errorTags.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Embedding Service', () => {
    let testErrorId: number;

    beforeEach(() => {
      testErrorId = recordError({
        message: 'Error for embedding test ' + Date.now(),
        errorType: 'EmbeddingTestError',
        severity: 'medium',
      });
    });

    it('should store and retrieve embedding', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      storeEmbedding(testErrorId, embedding, 'test-model');

      const retrieved = getEmbeddingVector(testErrorId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(embedding.length);
      for (let i = 0; i < embedding.length; i++) {
        expect(retrieved![i]).toBeCloseTo(embedding[i], 5);
      }
    });

    it('should find similar by embedding', () => {
      // Create error with embedding
      const errorId = recordError({
        message: 'Similar embedding error ' + Date.now(),
        errorType: 'TestError',
        severity: 'low',
      });

      const embedding = [1, 0, 0, 0, 0];
      storeEmbedding(errorId, embedding, 'test-model');

      // Search with similar embedding
      const searchEmbedding = [0.9, 0.1, 0, 0, 0]; // Very similar to stored
      const results = findSimilarByEmbedding(searchEmbedding, {
        minSimilarity: 0.8,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThan(0.8);
    });

    it('should use mock embedding generator', async () => {
      const generator = new MockEmbeddingGenerator();

      const embedding1 = await generator.generate('hello world');
      const embedding2 = await generator.generate('hello world');
      const embedding3 = await generator.generate('different text');

      // Same text should produce same embedding
      expect(embedding1).toEqual(embedding2);

      // Different text should produce different embedding
      expect(embedding1).not.toEqual(embedding3);

      // Should have correct dimensions
      expect(embedding1.length).toBe(generator.dimensions);
    });
  });
});
