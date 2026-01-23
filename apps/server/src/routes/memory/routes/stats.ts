/**
 * GET /stats endpoint - Get memory layer statistics
 */

import type { Request, Response } from 'express';
import { getStats } from '@automaker/memory-layer';
import { getErrorMessage, logError } from '../common.js';

export function createStatsHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = getStats();
      res.json({ success: true, stats });
    } catch (error) {
      logError(error, 'Get stats failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
