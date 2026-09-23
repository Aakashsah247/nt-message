import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

export const MESSAGE_ATTACHMENT_SECURITY_VERSION = 1;

export interface MessageAttachmentSecurityContext {
  id: string;
  messageId: string;
  storageKey: string;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentType: string;
}

export interface StoredMessageAttachmentSecurityFields {
  contentSecurityVersion: number;
  contentEncryptionKeyVersion: number | null;
  contentEncryptionIv: string | null;
  contentEncryptionTag: string | null;
  contentSignatureKeyVersion: number | null;
  contentSignature: string | null;
  ciphertextSha256: string | null;
  encryptedSizeBytes: number | null;
}

export interface ProtectedAttachmentContent {
  ciphertext: Buffer;
  fields: StoredMessageAttachmentSecurityFields;
}

export class MessageAttachmentIntegrityError extends Error {
  constructor(message = 'Stored attachment failed integrity verification.') {
    super(message);
    this.name = 'MessageAttachmentIntegrityError';
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
    throw new Error(`${name} is required for attachment encryption.`);
  }

  const decoded = Buffer.from(value.trim(), 'base64');
  if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
    throw new Error(`${name} must decode to exactly ${expectedBytes} bytes.`);
  }
  return decoded;
}

function encryptionAad(storageKey: string, keyVersion: number): Buffer {
  return Buffer.from(
    JSON.stringify({
      purpose: 'nt-message-attachment-content-v1',
      storageKey,
      keyVersion,
    }),
    'utf8',
  );
}

function signaturePayload(
  context: MessageAttachmentSecurityContext,
  fields: StoredMessageAttachmentSecurityFields,
): Buffer {
  return Buffer.from(
    JSON.stringify({
      version: fields.contentSecurityVersion,
      attachmentId: context.id,
      messageId: context.messageId,
      storageKey: context.storageKey,
      originalFileName: context.originalFileName,
      mimeType: context.mimeType,
      fileSizeBytes: context.fileSizeBytes,
      contentType: context.contentType,
      encryptionKeyVersion: fields.contentEncryptionKeyVersion,
      iv: fields.contentEncryptionIv,
      tag: fields.contentEncryptionTag,
      ciphertextSha256: fields.ciphertextSha256,
      encryptedSizeBytes: fields.encryptedSizeBytes,
      signatureKeyVersion: fields.contentSignatureKeyVersion,
    }),
    'utf8',
  );
}

export class MessageAttachmentContentSecurity {
  private readonly env: NodeJS.ProcessEnv;
  private readonly testFallback: {
    encryptionKey: Buffer;
    privateKey: KeyObject;
    publicKey: KeyObject;
  } | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
    if (env.NODE_ENV === 'test') {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      this.testFallback = {
        encryptionKey: randomBytes(32),
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

  private getSigningPrivateKey(version: number): KeyObject {
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
      return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    } finally {
      der.fill(0);
    }
  }

  private getSigningPublicKey(version: number): KeyObject {
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
      return createPublicKey({ key: der, format: 'der', type: 'spki' });
    } finally {
      der.fill(0);
    }
  }

  protectBuffer(
    plaintext: Buffer,
    context: MessageAttachmentSecurityContext,
  ): ProtectedAttachmentContent {
    const version = this.activeKeyVersion;
    const key = this.getEncryptionKey(version);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(encryptionAad(context.storageKey, version));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    key.fill(0);

    const unsignedFields: StoredMessageAttachmentSecurityFields = {
      contentSecurityVersion: MESSAGE_ATTACHMENT_SECURITY_VERSION,
      contentEncryptionKeyVersion: version,
      contentEncryptionIv: iv.toString('base64url'),
      contentEncryptionTag: tag.toString('base64url'),
      contentSignatureKeyVersion: version,
      contentSignature: null,
      ciphertextSha256: createHash('sha256').update(ciphertext).digest('hex'),
      encryptedSizeBytes: ciphertext.length,
    };

    const contentSignature = sign(
      null,
      signaturePayload(context, unsignedFields),
      this.getSigningPrivateKey(version),
    ).toString('base64url');

    return {
      ciphertext,
      fields: {
        ...unsignedFields,
        contentSignature,
      },
    };
  }

  signExistingProtectedReference(
    context: MessageAttachmentSecurityContext,
    fields: Omit<StoredMessageAttachmentSecurityFields, 'contentSignature'>,
  ): StoredMessageAttachmentSecurityFields {
    if (fields.contentSecurityVersion !== MESSAGE_ATTACHMENT_SECURITY_VERSION) {
      return { ...fields, contentSignature: null };
    }
    const signatureKeyVersion = fields.contentSignatureKeyVersion;
    if (!signatureKeyVersion) {
      throw new MessageAttachmentIntegrityError(
        'Protected attachment is missing its signature key version.',
      );
    }
    const unsigned = { ...fields, contentSignature: null };
    return {
      ...unsigned,
      contentSignature: sign(
        null,
        signaturePayload(context, unsigned),
        this.getSigningPrivateKey(signatureKeyVersion),
      ).toString('base64url'),
    };
  }

  unprotectBuffer(
    stored: Buffer,
    context: MessageAttachmentSecurityContext,
    fields: StoredMessageAttachmentSecurityFields,
  ): Buffer {
    if (!fields.contentSecurityVersion) {
      throw new MessageAttachmentIntegrityError(
        'Legacy plaintext attachment content is not permitted after the security cutover.',
      );
    }
    if (fields.contentSecurityVersion !== MESSAGE_ATTACHMENT_SECURITY_VERSION) {
      throw new MessageAttachmentIntegrityError(
        `Unsupported attachment security version ${fields.contentSecurityVersion}.`,
      );
    }

    const encryptionKeyVersion = fields.contentEncryptionKeyVersion;
    const signatureKeyVersion = fields.contentSignatureKeyVersion;
    if (
      !encryptionKeyVersion ||
      !signatureKeyVersion ||
      !fields.contentEncryptionIv ||
      !fields.contentEncryptionTag ||
      !fields.contentSignature ||
      !fields.ciphertextSha256 ||
      fields.encryptedSizeBytes === null
    ) {
      throw new MessageAttachmentIntegrityError(
        'Protected attachment is missing required security metadata.',
      );
    }

    if (stored.length !== fields.encryptedSizeBytes) {
      throw new MessageAttachmentIntegrityError(
        'Attachment size integrity check failed.',
      );
    }
    const digest = createHash('sha256').update(stored).digest('hex');
    if (digest !== fields.ciphertextSha256) {
      throw new MessageAttachmentIntegrityError(
        'Attachment digest is invalid.',
      );
    }

    const signatureValid = verify(
      null,
      signaturePayload(context, fields),
      this.getSigningPublicKey(signatureKeyVersion),
      Buffer.from(fields.contentSignature, 'base64url'),
    );
    if (!signatureValid) {
      throw new MessageAttachmentIntegrityError(
        'Attachment signature is invalid.',
      );
    }

    const key = this.getEncryptionKey(encryptionKeyVersion);
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(fields.contentEncryptionIv, 'base64url'),
      );
      decipher.setAAD(encryptionAad(context.storageKey, encryptionKeyVersion));
      decipher.setAuthTag(
        Buffer.from(fields.contentEncryptionTag, 'base64url'),
      );
      const plaintext = Buffer.concat([
        decipher.update(stored),
        decipher.final(),
      ]);
      if (plaintext.length !== context.fileSizeBytes) {
        throw new MessageAttachmentIntegrityError(
          'Attachment plaintext size integrity check failed.',
        );
      }
      return plaintext;
    } catch (error) {
      if (error instanceof MessageAttachmentIntegrityError) throw error;
      throw new MessageAttachmentIntegrityError(
        'Attachment authenticated decryption failed.',
      );
    } finally {
      key.fill(0);
    }
  }
}
