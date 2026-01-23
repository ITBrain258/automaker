/**
 * POST /record-error endpoint - Record an error in the memory layer
 */

import type { Request, Response } from 'express';
import type { ErrorInput } from '@automaker/memory-layer';
import { captureError } from '@automaker/memory-layer';
import { getErrorMessage, logError } from '../common.js';

interface RecordErrorRequest {
  message: string;
  errorType?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  stackTrace?: string;
  filePath?: string;
  projectName?: string;
  tags?: string[];
}

export function createRecordErrorHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as RecordErrorRequest;

      if (!body.message) {
        res.status(400).json({ success: false, error: 'message is required' });
        return;
      }

      const errorInput: ErrorInput = {
        message: body.message,
        errorType: body.errorType || 'unknown',
        severity: body.severity || 'medium',
        stackTrace: body.stackTrace,
        filePath: body.filePath,
        projectName: body.projectName,
        tags: body.tags,
      };

      const errorId = await captureError(errorInput);

      res.json({ success: true, errorId });
    } catch (error) {
      logError(error, 'Record error failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
