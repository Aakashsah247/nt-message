import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

export const MESSAGE_TEXT_SECURITY_VERSION = 1;
export const MESSAGE_INTEGRITY_FAILURE_TEXT =
  'Message integrity verification failed.';

export interface MessageTextSecurityContext {
  id: string;
  conversationId: string;
  senderAccountId: string;
  contentType: string;
  sentAt: Date;
  editedAt: Date | null;
}

export interface StoredMessageTextSecurityFields {
  textContent: string | null;
  textSecurityVersion: number;
  textEncryptionKeyVersion: number | null;
  textEncryptionIv: string | null;
  textEncryptionTag: string | null;
  textSignatureKeyVersion: number | null;
  textSignature: string | null;
  textSearchTokens: string[];
}

export type SecuredMessageTextFields = StoredMessageTextSecurityFields;

export class MessageContentIntegrityError extends Error {
  constructor(
    message = 'Stored message content failed integrity verification.',
  ) {
    super(message);
    this.name = 'MessageContentIntegrityError';
  }
}

function parsePositiveVersion(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeBase64Secret(
  value: string | undefined,
  name: string,
  expectedBytes?: number,
): Buffer {
  if (!value?.trim()) {
    throw new Error(`${name} is required for message encryption.`);
  }

  const decoded = Buffer.from(value.trim(), 'base64');
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    throw new Error(`${name} must decode to exactly ${expectedBytes} bytes.`);
  }

  return decoded;
}

function canonicalContext(
  context: MessageTextSecurityContext,
  encryptionKeyVersion: number,
): string {
  return JSON.stringify({
    version: MESSAGE_TEXT_SECURITY_VERSION,
    encryptionKeyVersion,
    messageId: context.id,
    conversationId: context.conversationId,
    senderAccountId: context.senderAccountId,
    contentType: context.contentType,
    sentAt: context.sentAt.toISOString(),
    editedAt: context.editedAt?.toISOString() ?? null,
  });
}

function signaturePayload(
  context: MessageTextSecurityContext,
  fields: Pick<
    StoredMessageTextSecurityFields,
    | 'textSecurityVersion'
    | 'textEncryptionKeyVersion'
    | 'textEncryptionIv'
    | 'textEncryptionTag'
    | 'textContent'
    | 'textSignatureKeyVersion'
    | 'textSearchTokens'
  >,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      textSecurityVersion: fields.textSecurityVersion,
      textEncryptionKeyVersion: fields.textEncryptionKeyVersion,
      textSignatureKeyVersion: fields.textSignatureKeyVersion,
      messageId: context.id,
      conversationId: context.conversationId,
      senderAccountId: context.senderAccountId,
      contentType: context.contentType,
      sentAt: context.sentAt.toISOString(),
      editedAt: context.editedAt?.toISOString() ?? null,
      iv: fields.textEncryptionIv,
      tag: fields.textEncryptionTag,
      ciphertext: fields.textContent,
      searchTokens: [...fields.textSearchTokens].sort(),
    }),
    'utf8',
  );
}

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSearchTerms(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^\p{L}\p{N}_@.+:/-]+/u)
    .filter(Boolean);
}

export class MessageContentSecurity {
  private readonly env: NodeJS.ProcessEnv;
  private readonly testFallback: {
    encryptionKey: Buffer;
    searchKey: Buffer;
    privateKey: KeyObject;
    publicKey: KeyObject;
  } | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
    if (env.NODE_ENV === 'test') {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.testFallback = {
        encryptionKey: randomBytes(32),
        searchKey: randomBytes(32),
        privateKey,
        publicKey,
      };
    } else {
      this.testFallback = null;
    }
  }

  private get activeKeyVersion(): number {
    return parsePositiveVersion(this.env.MESSAGE_CRYPTO_ACTIVE_KEY_VERSION, 1);
  }

  private getEncryptionKey(version: number): Buffer {
    const configured = this.env[`MESSAGE_ENCRYPTION_KEY_V${version}_B64`];
    if (!configured?.trim() && this.testFallback) {
      return Buffer.from(this.testFallback.encryptionKey);
    }

    return decodeBase64Secret(
      configured,
      `MESSAGE_ENCRYPTION_KEY_V${version}_B64`,
      32,
    );
  }

  private getSearchKey(version: number): Buffer {
    const configured = this.env[`MESSAGE_SEARCH_INDEX_KEY_V${version}_B64`];
    if (!configured?.trim() && this.testFallback) {
      return Buffer.from(this.testFallback.searchKey);
    }

    return decodeBase64Secret(
      configured,
      `MESSAGE_SEARCH_INDEX_KEY_V${version}_B64`,
      32,
    );
  }

  private getSigningPrivateKey(version: number) {
    const configured =
      this.env[`MESSAGE_SIGNING_PRIVATE_KEY_V${version}_DER_B64`];
    if (!configured?.trim() && this.testFallback) {
      return this.testFallback.privateKey;
    }

    const der = decodeBase64Secret(
      configured,
      `MESSAGE_SIGNING_PRIVATE_KEY_V${version}_DER_B64`,
    );

    try {
      return createPrivateKey({
        key: der,
        format: 'der',
        type: 'pkcs8',
      });
    } finally {
      der.fill(0);
    }
  }

  private getSigningPublicKey(version: number) {
    const configured =
      this.env[`MESSAGE_SIGNING_PUBLIC_KEY_V${version}_DER_B64`];
    if (!configured?.trim() && this.testFallback) {
      return this.testFallback.publicKey;
    }

    const der = decodeBase64Secret(
      configured,
      `MESSAGE_SIGNING_PUBLIC_KEY_V${version}_DER_B64`,
    );

    try {
      return createPublicKey({
        key: der,
        format: 'der',
        type: 'spki',
      });
    } finally {
      der.fill(0);
    }
  }

  protectText(
    plaintext: string | null,
    context: MessageTextSecurityContext,
  ): SecuredMessageTextFields {
    if (plaintext === null) {
      return {
        textContent: null,
        textSecurityVersion: 0,
        textEncryptionKeyVersion: null,
        textEncryptionIv: null,
        textEncryptionTag: null,
        textSignatureKeyVersion: null,
        textSignature: null,
        textSearchTokens: [],
      };
    }

    const version = this.activeKeyVersion;
    const key = this.getEncryptionKey(version);
    const iv = randomBytes(12);
    const aad = Buffer.from(canonicalContext(context, version), 'utf8');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const textSearchTokens = this.buildSearchTokens(plaintext);
    const unsignedFields = {
      textContent: ciphertext.toString('base64url'),
      textSecurityVersion: MESSAGE_TEXT_SECURITY_VERSION,
      textEncryptionKeyVersion: version,
      textEncryptionIv: iv.toString('base64url'),
      textEncryptionTag: tag.toString('base64url'),
      textSignatureKeyVersion: version,
      textSearchTokens,
    };

    const signature = sign(
      null,
      signaturePayload(context, unsignedFields),
      this.getSigningPrivateKey(version),
    ).toString('base64url');

    key.fill(0);

    return {
      ...unsignedFields,
      textSignature: signature,
    };
  }

  unprotectText(
    fields: StoredMessageTextSecurityFields,
    context: MessageTextSecurityContext,
  ): string | null {
    if (fields.textContent === null) {
      return null;
    }

    if (
      fields.textSecurityVersion === 0 ||
      fields.textSecurityVersion === undefined ||
      fields.textSecurityVersion === null
    ) {
      return fields.textContent;
    }

    if (fields.textSecurityVersion !== MESSAGE_TEXT_SECURITY_VERSION) {
      throw new MessageContentIntegrityError(
        `Unsupported message text security version ${fields.textSecurityVersion}.`,
      );
    }

    const encryptionKeyVersion = fields.textEncryptionKeyVersion;
    const signatureKeyVersion = fields.textSignatureKeyVersion;
    if (
      !encryptionKeyVersion ||
      !signatureKeyVersion ||
      !fields.textEncryptionIv ||
      !fields.textEncryptionTag ||
      !fields.textSignature
    ) {
      throw new MessageContentIntegrityError(
        'Protected message text is missing required security metadata.',
      );
    }

    const signedFields = {
      textContent: fields.textContent,
      textSecurityVersion: fields.textSecurityVersion,
      textEncryptionKeyVersion: encryptionKeyVersion,
      textEncryptionIv: fields.textEncryptionIv,
      textEncryptionTag: fields.textEncryptionTag,
      textSignatureKeyVersion: signatureKeyVersion,
      textSearchTokens: fields.textSearchTokens ?? [],
    };

    const signature = Buffer.from(fields.textSignature, 'base64url');
    const signatureValid = verify(
      null,
      signaturePayload(context, signedFields),
      this.getSigningPublicKey(signatureKeyVersion),
      signature,
    );

    if (!signatureValid) {
      throw new MessageContentIntegrityError('Message signature is invalid.');
    }

    const key = this.getEncryptionKey(encryptionKeyVersion);
    const iv = Buffer.from(fields.textEncryptionIv, 'base64url');
    const tag = Buffer.from(fields.textEncryptionTag, 'base64url');
    const ciphertext = Buffer.from(fields.textContent, 'base64url');

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(
        Buffer.from(canonicalContext(context, encryptionKeyVersion), 'utf8'),
      );
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new MessageContentIntegrityError(
        'Message ciphertext authentication failed.',
      );
    } finally {
      key.fill(0);
      iv.fill(0);
      tag.fill(0);
      ciphertext.fill(0);
      signature.fill(0);
    }
  }

  buildSearchTokens(text: string): string[] {
    const version = this.activeKeyVersion;
    const searchKey = this.getSearchKey(version);
    const rawTokens = new Set<string>();

    for (const term of splitSearchTerms(text)) {
      rawTokens.add(`term:${term}`);
      if (term.length >= 3) {
        for (let length = 3; length <= term.length; length += 1) {
          rawTokens.add(`prefix:${term.slice(0, length)}`);
        }
      }
    }

    const tokens = [...rawTokens]
      .sort()
      .slice(0, 512)
      .map((token) => {
        const digest = createHmac('sha256', searchKey)
          .update(token, 'utf8')
          .digest('base64url');
        return `${version}.${digest}`;
      });

    searchKey.fill(0);
    return tokens;
  }

  buildSearchQueryTokens(text: string): string[] {
    const version = this.activeKeyVersion;
    const searchKey = this.getSearchKey(version);
    const requestedTokens = new Set<string>();

    for (const term of splitSearchTerms(text)) {
      requestedTokens.add(term.length >= 3 ? `prefix:${term}` : `term:${term}`);
    }

    const tokens = [...requestedTokens].sort().map((token) => {
      const digest = createHmac('sha256', searchKey)
        .update(token, 'utf8')
        .digest('base64url');
      return `${version}.${digest}`;
    });

    searchKey.fill(0);
    return tokens;
  }
}
