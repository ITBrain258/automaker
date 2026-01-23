/**
 * Memory routes - HTTP API for cross-project memory layer
 */

import { Router } from 'express';
import { createRecordErrorHandler } from './routes/record-error.js';
import { createRecordSolutionHandler, createRecordOutcomeHandler } from './routes/record-solution.js';
import { createSearchHandler, createGetRelevantHandler } from './routes/search.js';
import { createStatsHandler } from './routes/stats.js';

export function createMemoryRoutes(): Router {
  const router = Router();

  // Error recording
  router.post('/record-error', createRecordErrorHandler());

  // Solution recording
  router.post('/record-solution', createRecordSolutionHandler());
  router.post('/record-outcome', createRecordOutcomeHandler());

  // Search
  router.post('/search', createSearchHandler());
  router.post('/relevant', createGetRelevantHandler());

  // Statistics
  router.get('/stats', createStatsHandler());

  return router;
}
