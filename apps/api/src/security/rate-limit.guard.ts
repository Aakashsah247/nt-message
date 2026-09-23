import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  RATE_LIMIT_METADATA,
  type RateLimitKeyDimension,
  type RateLimitPolicy,
} from './rate-limit.decorator';
import { NativeRateLimitService } from './native-rate-limit.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

function normalizeIp(request: Request): string {
  return (request.ip ?? request.socket.remoteAddress ?? 'unknown').trim();
}

function requestIdentity(request: Request): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  const candidates = [
    body?.identifier,
    body?.username,
    body?.officialEmail,
    body?.email,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }

  return null;
}

function opaqueKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: NativeRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy>(
      RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!policy) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();
    const decisions = policy.keys.map((dimension) =>
      this.rateLimits.consume(
        this.bucketKey(policy.scope, dimension, request),
        policy.limit,
        policy.windowMs,
      ),
    );

    const mostRestrictive = decisions.reduce((selected, current) =>
      current.remaining < selected.remaining ? current : selected,
    );

    response.setHeader('X-RateLimit-Limit', String(mostRestrictive.limit));
    response.setHeader(
      'X-RateLimit-Remaining',
      String(mostRestrictive.remaining),
    );
    response.setHeader(
      'X-RateLimit-Reset',
      String(Math.ceil(mostRestrictive.resetAt / 1000)),
    );

    const blocked = decisions.find((decision) => !decision.allowed);
    if (!blocked) {
      return true;
    }

    response.setHeader('Retry-After', String(blocked.retryAfterSeconds));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please wait and try again.',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private bucketKey(
    scope: string,
    dimension: RateLimitKeyDimension,
    request: RequestWithUser,
  ): string {
    let value: string;

    if (dimension === 'account') {
      value = request.user?.accountId ?? `ip:${normalizeIp(request)}`;
    } else if (dimension === 'identity') {
      value = requestIdentity(request) ?? `ip:${normalizeIp(request)}`;
    } else {
      value = normalizeIp(request);
    }

    return `${scope}:${dimension}:${opaqueKey(value)}`;
  }
}
