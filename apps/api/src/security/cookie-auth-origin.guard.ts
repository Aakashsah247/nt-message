import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Protects endpoints that authenticate with the HttpOnly refresh cookie.
 *
 * Normal NT Message business APIs use an Authorization bearer token and do
 * not need cookie CSRF protection. Refresh/logout are different: browsers
 * attach the refresh cookie automatically, so production requests must prove
 * that they originated from the configured NT Message web application.
 */
@Injectable()
export class CookieAuthOriginGuard implements CanActivate {
  private readonly enforceTrustedOrigin: boolean;
  private readonly trustedOrigin: string;

  constructor(configService: ConfigService) {
    this.enforceTrustedOrigin =
      configService.get<string>('NODE_ENV') === 'production';

    this.trustedOrigin = this.normalizeOrigin(
      configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173',
    );
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enforceTrustedOrigin) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const requestOrigin = this.readRequestOrigin(request);

    if (requestOrigin !== this.trustedOrigin) {
      throw new ForbiddenException('Request origin is not allowed.');
    }

    return true;
  }

  private readRequestOrigin(request: Request): string | null {
    const origin = request.get('origin')?.trim();

    if (origin) {
      return this.safeNormalizeOrigin(origin);
    }

    /*
     * Some privacy/security middleware can omit Origin. Referer is accepted as
     * a conservative fallback, but only its origin is compared; paths and
     * query strings are ignored and are never logged here.
     */
    const referer = request.get('referer')?.trim();

    if (!referer) {
      return null;
    }

    return this.safeNormalizeOrigin(referer);
  }

  private safeNormalizeOrigin(value: string): string | null {
    try {
      return this.normalizeOrigin(value);
    } catch {
      return null;
    }
  }

  private normalizeOrigin(value: string): string {
    const url = new URL(value);

    if (url.username || url.password) {
      throw new Error('Origin must not contain credentials.');
    }

    return url.origin;
  }
}
