# NT Message — Production Security Lock

This document records the Phase 5A–5H production-security boundary.

## Locked controls

- Production secret and message-crypto configuration is fail-fast validated.
- Cookie-authenticated refresh/logout endpoints enforce trusted Origin/Referer checks.
- React static hosting and the API apply production security headers.
- Trusted-proxy handling is explicit before client-IP rate limiting is used.
- Production 5xx responses are sanitized and carry server-generated request IDs.
- Error logs use the request path only; query strings are not logged.
- Native rate limiting is bounded and production is locked to one API instance until a shared backend is introduced.
- CI scans tracked source for secrets and fails on high-severity production dependency advisories.
- Patched dependency resolutions for audited transitive packages are locked in `pnpm-workspace.yaml`.
- Production browser source maps are not enabled.
- Message text and attachments retain the existing application-layer encryption/integrity architecture.

## Final verification

Run from the repository root:

```bash
node scripts/run_final_security_lock.mjs
```

The lock is valid only when every stage passes. A failed dependency audit, build,
migration check, message-security audit, architecture test, or whitespace check
must be corrected rather than bypassed.

## Scaling constraint

The current native rate limiter is process-local. Keep the production API at one
instance until a shared Redis/Valkey or approved edge/distributed rate-limit
backend is implemented and tested.
