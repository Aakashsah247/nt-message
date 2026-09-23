import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export interface CorrelatedRequest extends Request {
  requestId?: string;
}

/**
 * Assigns a server-generated id to every HTTP request.
 *
 * Deliberately do not reuse a caller-provided X-Request-Id value. A value
 * controlled by an untrusted client can be used for log injection/confusion.
 */
export function requestCorrelationMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();

  (request as CorrelatedRequest).requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
