import fs from 'node:fs';
import path from 'node:path';

describe('cookie-authenticated CSRF architecture', () => {
  const authController = fs.readFileSync(
    path.join(__dirname, '..', 'auth', 'auth.controller.ts'),
    'utf8',
  );

  it('protects refresh and logout with the trusted-origin guard', () => {
    expect(authController).toMatch(
      /@Post\('refresh'\)\s*@UseGuards\(CookieAuthOriginGuard\)/,
    );
    expect(authController).toMatch(
      /@Post\('logout'\)\s*@UseGuards\(CookieAuthOriginGuard\)/,
    );
  });

  it('does not put cookie CSRF requirements on bearer-authenticated business APIs', () => {
    const usageCount = (
      authController.match(/@UseGuards\(CookieAuthOriginGuard\)/g) ?? []
    ).length;

    expect(usageCount).toBe(2);
  });
});
