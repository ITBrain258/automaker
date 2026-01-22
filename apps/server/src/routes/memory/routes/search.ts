/**
 * POST /search endpoint - Search for similar errors and solutions
 */

import type { Request, Response } from 'express';
import type { SearchOptions } from '@automaker/memory-layer';
import { findSimilar, findByTags, getRelevantMemories } from '@automaker/memory-layer';
import { getErrorMessage, logError } from '../common.js';

interface SearchRequest {
  message?: string;
  tags?: string[];
  options?: SearchOptions;
}

interface GetRelevantRequest {
  featureTitle?: string;
  featureDescription?: string;
  errorMessage?: string;
  filePath?: string;
  projectName?: string;
  tags?: string[];
}

export function createSearchHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as SearchRequest;

      if (!body.message && (!body.tags || body.tags.length === 0)) {
        res.status(400).json({
          success: false,
          error: 'Either message or tags is required',
        });
        return;
      }

      let results;
      if (body.message) {
        results = await findSimilar(body.message, body.options);
      } else {
        results = findByTags(body.tags!);
      }

      res.json({ success: true, results });
    } catch (error) {
      logError(error, 'Search failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createGetRelevantHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as GetRelevantRequest;

      const context = await getRelevantMemories({
        featureTitle: body.featureTitle,
        featureDescription: body.featureDescription,
        errorMessage: body.errorMessage,
        filePath: body.filePath,
        projectName: body.projectName,
        tags: body.tags,
      });

      res.json({ success: true, context });
    } catch (error) {
      logError(error, 'Get relevant memories failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
