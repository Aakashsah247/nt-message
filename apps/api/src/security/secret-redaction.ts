const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|token|access.?token|refresh.?token|session.?token|password|passphrase|otp|one.?time|secret|api.?key|private.?key|client.?secret|smtp.?password|database.?url|redis.?url|valkey.?url|encryption.?key|signing.?key)/i;

const STRING_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/\bBasic\s+[A-Za-z0-9+/=]+/gi, `Basic ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED],
  [
    /\b(postgres(?:ql)?|redis|rediss):\/\/([^\s:@/]+):([^\s@/]+)@/gi,
    '$1://$2:[REDACTED]@',
  ],
  [
    /([?&](?:token|access_token|refresh_token|session_token|api_key|apikey|secret|password|otp)=)[^&#\s]*/gi,
    '$1[REDACTED]',
  ],
];

export function redactSensitiveString(value: string): string {
  return STRING_REPLACEMENTS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );
}

export function redactSensitiveValue(
  value: unknown,
  keyHint?: string,
  seen: WeakSet<object> = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (typeof value === 'symbol' || typeof value === 'function') {
    return '[NON_SERIALIZABLE]';
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  if (value instanceof Date) {
    return value;
  }

  if (depth >= 8) {
    return '[MAX_DEPTH]';
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[CIRCULAR]';
    }

    seen.add(value);

    if (value instanceof Error) {
      const safeError = {
        name: value.name,
        message: redactSensitiveString(value.message),
        ...(value.stack ? { stack: redactSensitiveString(value.stack) } : {}),
      };
      seen.delete(value);
      return safeError;
    }

    if (Array.isArray(value)) {
      const safeArray = value.map((entry) =>
        redactSensitiveValue(entry, undefined, seen, depth + 1),
      );
      seen.delete(value);
      return safeArray;
    }

    const safeObject: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      safeObject[key] = redactSensitiveValue(entry, key, seen, depth + 1);
    }
    seen.delete(value);
    return safeObject;
  }

  return value;
}

export const SECRET_REDACTION_MARKER = REDACTED;
