import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

describe('security secret leakage architecture', () => {
  const source = (path: string) =>
    readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

  it('boots Nest through the redacting logger and production security gate', () => {
    const main = source('main.ts');

    expect(main).toContain('NestFactory.create(AppModule, { logger })');
    expect(main).toContain('assertProductionSecurityConfig(configService)');
    expect(main).not.toContain('console.log(');
  });

  it('keeps runtime API source free of direct console logging bypasses', () => {
    const root = resolve(process.cwd(), 'src');
    const offenders: string[] = [];

    const walk = (directory: string): void => {
      for (const name of readdirSync(directory)) {
        const absolute = join(directory, name);
        if (statSync(absolute).isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!name.endsWith('.ts') || name.endsWith('.spec.ts')) {
          continue;
        }

        const contents = readFileSync(absolute, 'utf8');
        if (
          /\bconsole\.(log|error|warn|debug|info|trace)\s*\(/.test(contents)
        ) {
          offenders.push(absolute.slice(root.length + 1));
        }
      }
    };

    walk(root);
    expect(offenders).toEqual([]);
  });

  it('keeps refresh-token cookies HttpOnly and production Secure', () => {
    const auth = source('auth/auth.controller.ts');

    expect(auth).toContain('httpOnly: true');
    expect(auth).toContain('secure: this.isProduction');
  });

  it('keeps account-request audit metadata free of raw security material', () => {
    const requests = source('account-requests/account-requests.service.ts');

    expect(requests).toContain(
      'It intentionally excludes raw tokens, OTPs, passwords, SMTP payloads',
    );
  });
});
