export interface MessagingSendAttempt {
  key: string;
  clientMessageId: string;
}

/**
 * A logical send keeps one client message ID across transport retries.
 * Changing the logical payload/context changes the key and therefore creates
 * a new ID. The API already enforces sender + clientMessageId uniqueness.
 */
export function resolveMessagingSendAttempt(
  current: MessagingSendAttempt | null,
  key: string,
  createClientMessageId: () => string = () => crypto.randomUUID(),
): MessagingSendAttempt {
  if (current?.key === key) {
    return current;
  }

  return {
    key,
    clientMessageId: createClientMessageId(),
  };
}
