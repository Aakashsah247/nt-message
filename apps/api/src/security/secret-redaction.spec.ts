import {
  SECRET_REDACTION_MARKER,
  redactSensitiveString,
  redactSensitiveValue,
} from './secret-redaction';

describe('secret redaction', () => {
  it('redacts authorization, cookies, tokens, passwords and API keys by key', () => {
    expect(
      redactSensitiveValue({
        authorization: 'Bearer secret-token',
        cookie: 'nt_message_refresh=secret',
        accessToken: 'access-secret',
        refreshToken: 'refresh-secret',
        password: 'Password123!',
        otp: '123456',
        apiKey: 'provider-key',
        nested: { SMTP_PASSWORD: 'smtp-secret' },
        safe: 'employee-123',
      }),
    ).toEqual({
      authorization: SECRET_REDACTION_MARKER,
      cookie: SECRET_REDACTION_MARKER,
      accessToken: SECRET_REDACTION_MARKER,
      refreshToken: SECRET_REDACTION_MARKER,
      password: SECRET_REDACTION_MARKER,
      otp: SECRET_REDACTION_MARKER,
      apiKey: SECRET_REDACTION_MARKER,
      nested: { SMTP_PASSWORD: SECRET_REDACTION_MARKER },
      safe: 'employee-123',
    });
  });

  it('redacts bearer/JWT credentials, URL tokens and connection passwords in strings', () => {
    const input =
      'Authorization: Bearer abc.def.ghi url=https://app.test/activate?token=super-secret ' +
      'db=postgresql://nt_message_app:db-secret@localhost:5432/nt_message';

    const redacted = redactSensitiveString(input);

    expect(redacted).not.toContain('abc.def.ghi');
    expect(redacted).not.toContain('super-secret');
    expect(redacted).not.toContain('db-secret');
    expect(redacted).toContain('[REDACTED]');
  });

  it('handles Error objects and circular structures without leaking credentials', () => {
    const value: Record<string, unknown> = {
      error: new Error('request failed with Bearer raw-secret'),
    };
    value.self = value;

    const redacted = redactSensitiveValue(value) as Record<string, unknown>;

    expect(JSON.stringify(redacted)).not.toContain('raw-secret');
    expect(redacted.self).toBe('[CIRCULAR]');
  });
});
