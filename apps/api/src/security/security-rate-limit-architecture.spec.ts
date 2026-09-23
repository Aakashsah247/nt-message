import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('security rate-limit architecture', () => {
  const source = (path: string) =>
    readFileSync(resolve(process.cwd(), 'src', path), 'utf8');

  it('protects public authentication and recovery endpoints', () => {
    const auth = source('auth/auth.controller.ts');

    expect(auth).toContain("scope: 'auth-login'");
    expect(auth).toContain("scope: 'auth-admin-login'");
    expect(auth).toContain("scope: 'auth-employee-login'");
    expect(auth).toContain("scope: 'password-reset-request'");
    expect(auth).toContain("scope: 'password-reset-verify'");
    expect(auth).toContain("scope: 'password-reset-complete'");
  });

  it('protects activation OTP and completion endpoints', () => {
    const activation = source('activation/activation.controller.ts');

    expect(activation).toContain("scope: 'activation-otp-request'");
    expect(activation).toContain("scope: 'activation-otp-verify'");
    expect(activation).toContain("scope: 'activation-complete'");
  });

  it('protects high-cost message, attachment and emergency SMS writes', () => {
    const conversations = source('conversations/conversations.controller.ts');
    const emergency = source('emergency-alerts/emergency-alerts.controller.ts');

    expect(conversations).toContain("scope: 'message-send'");
    expect(conversations).toContain("scope: 'message-location-send'");
    expect(conversations).toContain("scope: 'message-attachment-send'");
    expect(emergency).toContain("scope: 'emergency-sms-send'");
  });

  it('keeps rate limiting opt-in instead of globally throttling normal reads', () => {
    const appModule = source('app.module.ts');

    expect(appModule).toContain('SecurityModule');
    expect(appModule).not.toContain('APP_GUARD');
  });
});
