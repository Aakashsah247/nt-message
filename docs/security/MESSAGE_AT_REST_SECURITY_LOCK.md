# NT Message — Message-at-Rest Security Architecture Lock

The messaging security model is intentionally application-layer encryption, not device-to-device E2EE.

## Locked design

- Message text/captions are encrypted with AES-256-GCM before persistence.
- The AES-GCM authenticated-data context binds ciphertext to message ID, conversation ID, sender account, content type, timestamps, and key version.
- Ed25519 signatures protect the stored encrypted message envelope and protected search tokens.
- Search uses keyed blind-search tokens; plaintext message text is not persisted for search.
- Message attachment bytes are encrypted with AES-256-GCM before physical storage.
- Attachment records carry Ed25519 signatures and SHA-256 ciphertext digests.
- Hard-deleted message evidence is copied to an append-only `message_security_tombstones` table.
- Database guards reject plaintext/version-0 active message text and legacy active attachment references after the backfills are complete.
- Encryption/signing secrets are supplied from runtime environment/secret management and are not stored in PostgreSQL.
- Authorized application users continue to see normal plaintext after server-side verification and decryption.
- MLS/OpenMLS, KeyPackages, Welcome messages, epochs, and client MLS device state are not part of the runtime architecture.

## Operational verification

Run:

```bash
pnpm message:security:final-lock
```

The command validates Prisma/migration status, verifies architecture invariants, cryptographically audits active message/tombstone/attachment records, and runs the focused security regression suite.

Never mark a failed security migration as applied unless its SQL has actually completed. Do not reset production/development data to bypass a failed security backfill.
