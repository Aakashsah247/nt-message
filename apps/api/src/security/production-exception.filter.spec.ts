import {
  BadRequestException,
  type ArgumentsHost,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Response } from 'express';

import { ProductionExceptionFilter } from './production-exception.filter';
import type { CorrelatedRequest } from './request-correlation';

function harness() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const getHeader = jest.fn(() => undefined);
  const response = {
    status,
    getHeader,
  } as unknown as Response;
  const request = {
    requestId: 'request-123',
    method: 'POST',
    originalUrl: '/api/v1/example',
    url: '/api/v1/example',
  } as CorrelatedRequest;
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
  const logger = { error: jest.fn() };

  return { host, json, logger, request, status };
}

describe('production exception filter', () => {
  it('preserves normal 4xx validation/auth errors and adds only the request id', () => {
    const { host, json, logger, status } = harness();
    const filter = new ProductionExceptionFilter(logger, true);

    filter.catch(
      new BadRequestException({
        statusCode: 400,
        message: ['name must be a string'],
        error: 'Bad Request',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: ['name must be a string'],
      error: 'Bad Request',
      requestId: 'request-123',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not expose explicit 5xx exception details in production', () => {
    const { host, json, logger, status } = harness();
    const filter = new ProductionExceptionFilter(logger, true);

    filter.catch(
      new InternalServerErrorException(
        'Prisma query failed at /private/server/path with DATABASE_URL',
      ),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error.',
      requestId: 'request-123',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('Prisma');
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      '/private/server/path',
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain('DATABASE_URL');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('does not expose an unexpected Error in production', () => {
    const { host, json, logger } = harness();
    const filter = new ProductionExceptionFilter(logger, true);

    filter.catch(
      new Error(
        'password=secret SMTP_PASS=secret /Users/example/project/file.ts',
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error.',
      requestId: 'request-123',
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('password=secret');
    expect(JSON.stringify(json.mock.calls)).not.toContain('SMTP_PASS');
    expect(JSON.stringify(json.mock.calls)).not.toContain('/Users/example');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicit HttpException body outside production for debugging', () => {
    const { host, json } = harness();
    const filter = new ProductionExceptionFilter({ error: jest.fn() }, false);

    filter.catch(
      new InternalServerErrorException('development diagnostic'),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'development diagnostic',
        requestId: 'request-123',
      }),
    );
  });
});
