/**
 * POST /record-solution endpoint - Record a solution for an error
 */

import type { Request, Response } from 'express';
import type { SolutionInput, SolutionSource } from '@automaker/memory-layer';
import { captureSolution, reportOutcome } from '@automaker/memory-layer';
import { getErrorMessage, logError } from '../common.js';

interface RecordSolutionRequest {
  errorId: number;
  content: string;
  codeSnippet?: string;
  source: SolutionSource;
  projectName?: string;
}

interface RecordOutcomeRequest {
  solutionId: number;
  success: boolean;
}

export function createRecordSolutionHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as RecordSolutionRequest;

      if (!body.errorId || !body.content || !body.source) {
        res.status(400).json({
          success: false,
          error: 'errorId, content, and source are required',
        });
        return;
      }

      const solutionInput: SolutionInput = {
        errorId: body.errorId,
        content: body.content,
        codeSnippet: body.codeSnippet,
        source: body.source,
        projectName: body.projectName,
      };

      const solutionId = captureSolution(solutionInput);

      res.json({ success: true, solutionId });
    } catch (error) {
      logError(error, 'Record solution failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}

export function createRecordOutcomeHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as RecordOutcomeRequest;

      if (body.solutionId === undefined || body.success === undefined) {
        res.status(400).json({
          success: false,
          error: 'solutionId and success are required',
        });
        return;
      }

      reportOutcome(body.solutionId, body.success);

      res.json({ success: true });
    } catch (error) {
      logError(error, 'Record outcome failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
