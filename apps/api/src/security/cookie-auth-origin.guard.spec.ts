import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import { CookieAuthOriginGuard } from './cookie-auth-origin.guard';

function contextWithHeaders(
  headers: Record<string, string | undefined>,
): ExecutionContext {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  const request = {
    get(name: string): string | undefined {
      return normalized[name.toLowerCase()];
    },
  } as Request;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function guard(values: Record<string, string>): CookieAuthOriginGuard {
  return new CookieAuthOriginGuard(new ConfigService(values));
}

describe('CookieAuthOriginGuard', () => {
  it('does not alter the development workflow', () => {
    const instance = guard({
      NODE_ENV: 'development',
      WEB_ORIGIN: 'http://localhost:5173',
    });

    expect(instance.canActivate(contextWithHeaders({}))).toBe(true);
  });

  it('allows the exact configured production Origin', () => {
    const instance = guard({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://nt-message.example.test',
    });

    expect(
      instance.canActivate(
        contextWithHeaders({ origin: 'https://nt-message.example.test' }),
      ),
    ).toBe(true);
  });

  it('accepts Referer as a fallback but compares only its origin', () => {
    const instance = guard({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://nt-message.example.test',
    });

    expect(
      instance.canActivate(
        contextWithHeaders({
          referer: 'https://nt-message.example.test/dashboard?tab=work',
        }),
      ),
    ).toBe(true);
  });

  it('rejects cross-origin production requests', () => {
    const instance = guard({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://nt-message.example.test',
    });

    expect(() =>
      instance.canActivate(
        contextWithHeaders({ origin: 'https://evil.example.test' }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects production cookie requests with no trustworthy origin evidence', () => {
    const instance = guard({
      NODE_ENV: 'production',
      WEB_ORIGIN: 'https://nt-message.example.test',
    });

    expect(() => instance.canActivate(contextWithHeaders({}))).toThrow(
      ForbiddenException,
    );

    expect(() =>
      instance.canActivate(contextWithHeaders({ origin: 'not-a-url' })),
    ).toThrow(ForbiddenException);
  });
});
