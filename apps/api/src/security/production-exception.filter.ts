import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import type { CorrelatedRequest } from './request-correlation';
import { REQUEST_ID_HEADER } from './request-correlation';

interface ErrorLogger {
  error(message: unknown, ...optionalParams: unknown[]): void;
}

interface SafeErrorDetails {
  name: string;
  message: string;
  stack?: string;
}

function safeErrorDetails(exception: unknown): SafeErrorDetails {
  if (exception instanceof Error) {
    return {
      name: exception.name,
      message: exception.message,
      ...(exception.stack ? { stack: exception.stack } : {}),
    };
  }

  return {
    name: 'UnknownError',
    message: typeof exception === 'string' ? exception : 'Non-Error exception',
  };
}

function requestIdFor(request: CorrelatedRequest, response: Response): string {
  const header = response.getHeader(REQUEST_ID_HEADER);
  return (
    request.requestId ?? (typeof header === 'string' ? header : 'unavailable')
  );
}

function preservedHttpExceptionBody(
  exception: HttpException,
  statusCode: number,
  requestId: string,
): Record<string, unknown> {
  const response = exception.getResponse();

  if (typeof response === 'string') {
    return {
      statusCode,
      message: response,
      requestId,
    };
  }

  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return {
      ...(response as Record<string, unknown>),
      requestId,
    };
  }

  return {
    statusCode,
    message: exception.message,
    requestId,
  };
}

@Catch()
export class ProductionExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: ErrorLogger,
    private readonly isProduction: boolean,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = requestIdFor(request, response);

    if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error('Unhandled HTTP exception.', {
        requestId,
        method: request.method,
        // Never log the raw URL here: activation/reset/query credentials may
        // legitimately appear in a query string. Express `path` excludes it.
        path: request.path,
        statusCode,
        exception: safeErrorDetails(exception),
      });
    }

    if (
      exception instanceof HttpException &&
      (!this.isProduction ||
        statusCode < Number(HttpStatus.INTERNAL_SERVER_ERROR))
    ) {
      response
        .status(statusCode)
        .json(preservedHttpExceptionBody(exception, statusCode, requestId));
      return;
    }

    response.status(statusCode).json({
      statusCode,
      message: 'Internal server error.',
      requestId,
    });
  }
}
