import type { NextFunction, Request, Response } from 'express';

import {
  type CorrelatedRequest,
  REQUEST_ID_HEADER,
  requestCorrelationMiddleware,
} from './request-correlation';

describe('request correlation middleware', () => {
  it('creates a server-controlled request id and returns it in the response', () => {
    const request = {
      headers: {
        'x-request-id': 'attacker-controlled-id',
      },
    } as unknown as Request;
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;
    const next = jest.fn() as NextFunction;

    requestCorrelationMiddleware(request, response, next);

    const requestId = (request as CorrelatedRequest).requestId;
    expect(requestId).toEqual(expect.any(String));
    expect(requestId).not.toBe('attacker-controlled-id');
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('creates a different id for separate requests', () => {
    const first = {} as Request;
    const second = {} as Request;
    const response = {
      setHeader: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    requestCorrelationMiddleware(first, response, next);
    requestCorrelationMiddleware(second, response, next);

    expect((first as CorrelatedRequest).requestId).not.toBe(
      (second as CorrelatedRequest).requestId,
    );
  });
});
