import {
  MessageAttachmentContentSecurity,
  MessageAttachmentIntegrityError,
} from './message-attachment-content-security';

describe('MessageAttachmentContentSecurity', () => {
  const context = {
    id: '11111111-1111-4111-8111-111111111111',
    messageId: '22222222-2222-4222-8222-222222222222',
    storageKey: 'conversation/object',
    originalFileName: 'evidence.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 18,
    contentType: 'FILE',
  };

  it('encrypts stored attachment bytes and restores the original bytes', () => {
    const security = new MessageAttachmentContentSecurity({ NODE_ENV: 'test' });
    const plaintext = Buffer.from('confidential-data!');
    const protectedContent = security.protectBuffer(plaintext, context);

    expect(protectedContent.ciphertext.equals(plaintext)).toBe(false);
    expect(protectedContent.fields.contentSecurityVersion).toBe(1);
    expect(protectedContent.fields.contentSignature).toEqual(
      expect.any(String),
    );

    const restored = security.unprotectBuffer(
      protectedContent.ciphertext,
      context,
      protectedContent.fields,
    );
    expect(restored.equals(plaintext)).toBe(true);
  });

  it('rejects modified ciphertext', () => {
    const security = new MessageAttachmentContentSecurity({ NODE_ENV: 'test' });
    const plaintext = Buffer.from('confidential-data!');
    const protectedContent = security.protectBuffer(plaintext, context);
    const tampered = Buffer.from(protectedContent.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;

    expect(() =>
      security.unprotectBuffer(tampered, context, protectedContent.fields),
    ).toThrow(MessageAttachmentIntegrityError);
  });

  it('rejects attachment-row metadata tampering', () => {
    const security = new MessageAttachmentContentSecurity({ NODE_ENV: 'test' });
    const plaintext = Buffer.from('confidential-data!');
    const protectedContent = security.protectBuffer(plaintext, context);

    expect(() =>
      security.unprotectBuffer(
        protectedContent.ciphertext,
        { ...context, originalFileName: 'changed.pdf' },
        protectedContent.fields,
      ),
    ).toThrow(MessageAttachmentIntegrityError);
  });
  it('rejects legacy plaintext attachment bytes after the storage cutover', () => {
    const security = new MessageAttachmentContentSecurity({ NODE_ENV: 'test' });

    expect(() =>
      security.unprotectBuffer(Buffer.from('legacy-plaintext'), context, {
        contentSecurityVersion: 0,
        contentEncryptionKeyVersion: null,
        contentEncryptionIv: null,
        contentEncryptionTag: null,
        contentSignatureKeyVersion: null,
        contentSignature: null,
        ciphertextSha256: null,
        encryptedSizeBytes: null,
      }),
    ).toThrow(MessageAttachmentIntegrityError);
  });
});
