**NT Message — production readiness review**

Reviewed September 23, 2026. Source revision: `605a33f`. Verdict: **not ready for production approval**. The project has substantial functionality and security controls, but confirmed security, delivery, storage, and deployment issues remain. Continue controlled staging with synthetic data until the release blockers are resolved.

This is a source and local verification review, not a penetration test or certification. No application code was changed. No live SMS, push notification, database migration, seed, or production-data operation was performed. The live hosting configuration and database state were not inspected.

**Verification results**

| Check | Result |
| --- | --- |
| `pnpm build` in the existing workspace | Passed: frontend TypeScript/Vite and backend Nest build |
| `pnpm lint` | Passed for both applications |
| Backend unit/regression tests | Initial run: 147 suites passed, 1 failed; 810 tests passed, 4 failed. The failures were sandbox-blocked local TCP listeners. Rerunning the entire affected attachment scanner suite outside the sandbox passed all 8 tests. All 148 suites therefore passed across the two runs, covering 814 distinct tests. |
| `pnpm --filter web test` | 337 passed |
| Tracked-file secret scanner | Passed; 932 tracked files checked. This does not establish that Git history or untracked files contain no secrets. |
| Production dependency audit | 0 critical, 0 high, 14 moderate, 2 low advisory findings |
| Isolated source compilation without ignored generated Prisma files | Failed with TS2307 missing generated Prisma modules; corroborates the deployment build omission below |
| Targeted local reproductions | Internal push URLs accepted; invalid image bytes accepted; concurrent refresh of one cookie produces one success and one rejection |

The E2E suite was not run against the configured database. Its only checked-in test starts the full application and checks `Hello World!`; initialization also starts background jobs. Running that against an unidentified database would not provide safe, isolated integration evidence.

**Release blockers and confirmed bugs, in priority order**

1. **High — push subscriptions permit server requests to user-selected internal destinations.**

   Evidence: [push DTO](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/dto/upsert-messaging-push-subscription.dto.ts:24), [subscription persistence](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/messaging-push.service.ts:116), and [delivery](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/messaging-push.service.ts:210).

   `IsUrl({ require_tld: false })` accepts localhost, loopback, and private-network URLs. The service stores that endpoint and passes it directly to `web-push`, whose installed implementation constructs an HTTPS request to the supplied hostname and port. A signed-in account can register such a destination and cause a request when it receives a notification, provided VAPID is configured. This is a server-side request forgery exposure; internal reachability and TLS validation constrain the practical impact. Response bodies are not returned to the registering user, and no internal service was contacted during review.

   Reproduction: the installed validator accepted `https://127.0.0.1/push`, `https://10.0.0.1/push`, and `https://localhost/push`. With locally generated test keys, `web-push.generateRequestDetails` successfully prepared a POST to `https://127.0.0.1:8443/private` without making a network request.

   Fix: enforce HTTPS and approved push-service destinations, reject private/reserved destinations including DNS resolution and rebinding cases, and apply outbound network restrictions. Add request timeouts and subscription quotas; delivery currently fans out through `Promise.allSettled` without an explicit timeout or per-account subscription bound.

2. **High — Emergency SMS reports success without delivering SMS.**

   Evidence: [provider binding](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/emergency-alerts/emergency-alerts.module.ts:18) and [mock success result](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/emergency-alerts/sms-providers/mock-sms.provider.ts:21).

   Every environment uses `MockSmsProvider`. Its send method logs a masked phone number and returns `SENT` with a synthetic ID. An employee could rely on an emergency alert that never reached the recipient.

   Fix: integrate a real SMS provider, distinguish provider acceptance from delivery confirmation, and reject mock-provider configuration in production. If SMS is outside the initial release scope, disable the feature visibly until delivery is implemented and tested.

3. **High — the checked-in deployment build omits Prisma generation.**

   Evidence: [Render build command](/Users/pabansah/Documents/Projects/nt-message/render.yaml:7), [generator output](/Users/pabansah/Documents/Projects/nt-message/apps/api/prisma/schema.prisma:1), and [ignored generated files](/Users/pabansah/Documents/Projects/nt-message/.gitignore:37).

   The API imports `src/generated/prisma`, which is ignored by Git. Render runs install followed by `pnpm --filter api build`, whose script is only `nest build`. No project prebuild/postinstall generates the client, and the installed Prisma 7.8 client package has no install hook. CI explicitly runs generation, so CI's successful build does not validate Render's build sequence.

   The existing workspace build passed. An isolated source copy excluding generated files failed with missing-module errors. This was a source-only reproduction using installed dependencies, not an actual fresh Render deployment.

   Fix: run `pnpm --filter api exec prisma generate` before the API build in the deployment command or a reliable build prerequisite. Verify a clean checkout deployment with no cached generated output.

4. **High for the supplied deployment — profile and group photos are not durable.**

   Evidence: [local storage directories](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/conversations.service.ts:284), [profile write](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/conversations.service.ts:2139), [group write](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/conversations.service.ts:2200), and [deployment](/Users/pabansah/Documents/Projects/nt-message/render.yaml:5).

   These files use direct filesystem writes even when `ATTACHMENT_STORAGE_DRIVER=supabase`. The supplied Render free service has no persistent disk. Render documents that local changes disappear on restart/redeploy. Database photo keys survive while their files disappear, causing broken avatars and group images. See [Render's filesystem documentation](https://render.com/docs/disks).

   Fix: put both photo types behind the durable storage abstraction and migrate existing files, or explicitly provision supported persistent storage. Test upload, restart/redeploy, and download.

5. **Medium — photo uploads bypass content validation and malware scanning.**

   Evidence: [profile validation](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/conversations.service.ts:2105), [group validation](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/conversations.service.ts:2166), [profile upload flow](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/conversations.service.ts:7882), and [group upload flow](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/conversations/conversations.service.ts:9020).

   Validation trusts the multipart MIME type and size. These paths write bytes directly without calling the attachment scanner or verifying image content. A local call to each actual validator accepted `this is not an image` as `image/png`. Enabling ClamAV for regular attachments does not close this separate path. This demonstrates an upload policy bypass, not proven code execution or browser XSS.

   Fix: verify/decode image bytes, enforce pixel/dimension limits, re-encode approved image formats, and apply the required scan policy before persistence. Add malformed-image and scanner-rejection tests for both routes.

6. **Medium — simultaneous browser tabs can log each other out during refresh.**

   Evidence: [tab-local refresh promise](/Users/pabansah/Documents/Projects/nt-message/apps/web/src/services/auth.service.ts:11), [refresh failure clears session](/Users/pabansah/Documents/Projects/nt-message/apps/web/src/context/AuthContext.tsx:154), and [single-use rotation](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/auth/auth.service.ts:452).

   The promise deduplicates refresh only inside one JavaScript context. Browser tabs share the refresh cookie but not this promise. If two requests carry the same cookie before rotation completes, the server accepts one and rejects the other; the rejected tab clears its UI session. A local reproduction against the real service method with mocked persistence produced exactly this success/rejection pair. The multi-tab browser scenario was established from the code path, not exercised in a live browser.

   Fix: coordinate refresh across tabs using an appropriate cross-tab lock/message mechanism, and handle a competing successful rotation without weakening replay protection. Add browser tests for simultaneous reload, refresh, and logout. Also guard in-flight refresh completion so it cannot restore stale UI state after logout.

**Deployment and release assurance gaps**

7. **High release risk — the deployment manifest deliberately uses staging exceptions.** [Configuration](/Users/pabansah/Documents/Projects/nt-message/render.yaml:15) selects `temporary_external_staging`, enables unscanned attachments, and sets scanning to `disabled` at line 118. The scanner service explicitly warns to use synthetic files in this mode. This is an intentional staging configuration, not evidence that strict production mode silently disables scanning. Create and test an actual production profile with healthy ClamAV and remove the exception. Do not promote this manifest unchanged.

8. **Medium — deployment health checks do not detect database outages.** [The selected endpoint](/Users/pabansah/Documents/Projects/nt-message/render.yaml:9) calls [a handler that always returns OK](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/app.controller.ts:14). A database health endpoint exists separately, but the manifest does not use it. After startup, database failure can leave the deployment reporting healthy while core requests fail. Provide separate liveness and dependency-aware readiness checks and exercise database/scanner outage behavior.

9. **High assurance gap — CI covers only part of the release.** [The workflow](/Users/pabansah/Documents/Projects/nt-message/.github/workflows/security.yml:56) invokes [a limited gate](/Users/pabansah/Documents/Projects/nt-message/scripts/run_security_gate.mjs:18) with selected security suites and an API build. It does not run the full backend suite, frontend tests/build, or lint. Many frontend tests assert source-code strings/regular expressions rather than browser behavior. [The sole API E2E test](/Users/pabansah/Documents/Projects/nt-message/apps/api/test/app.e2e-spec.ts:26) checks the starter response and does not reproduce production bootstrap configuration. Passing these checks is useful but insufficient evidence for real login, role boundaries, message delivery, file access, and migration correctness. Add disposable-database integration tests and browser journeys, and make all application checks release gates.

10. **Medium maintenance risk — lower-severity dependency advisories remain.** The audit reports 14 moderate and 2 low findings across `hono`, `@hono/node-server`, `valibot`, `qs`, and `body-parser`. Many are brought in through Prisma development tooling, so an advisory count is not the count of remotely exploitable application flaws. The Express dependency paths include `qs` and `body-parser`; assess their actual parser options. The current high-severity CI threshold allows these findings. Upgrade compatible dependency chains, rerun the audit, and record exposure decisions for any deferred finding. Example advisory: [qs denial of service](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g).

**Capacity and maintainability observations**

- The API explicitly permits only one production instance until a shared rate limiter exists. Socket.IO delivery and presence also use process-local state. Adding instances alone would split realtime delivery and counters. This is a supported-topology constraint rather than a bug when operated as documented; it prevents claiming high availability or horizontal scalability today. See [topology validation](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/security/rate-limit-production-config.ts:31) and [socket adapter](/Users/pabansah/Documents/Projects/nt-message/apps/api/src/realtime/messaging-socket.adapter.ts:16).
- The build emits about 1.41 MB of CSS, plus approximately 679 KB and 605 KB JavaScript chunks before gzip. This warrants browser/network profiling on employee devices; no load-time benchmark was performed, so this is a performance risk rather than a measured latency defect.
- `conversations.service.ts` is 15,296 lines and `useMessageAppController.tsx` is 14,095 lines. These large modules make authorization, lifecycle changes, and regression review harder. Refactor incrementally behind behavior tests.

**What is already working well**

The project has meaningful controls: production secret/key validation, strict DTO validation, hashed passwords, single-use refresh rotation, cookie-origin checks, sanitized error logging, message encryption/integrity infrastructure, attachment scanning support, bounded native rate limiting, and numerous authorization/regression tests. Both builds, lint, and the checked unit/regression suites passed under the conditions described above. These are useful foundations, but do not eliminate the specific gaps found here.

**Requirements before approving production**

1. Fix the push destination exposure, real SMS delivery/feature gating, clean deployment build, durable photo storage, and photo validation paths.
2. Resolve the multi-tab refresh behavior and deploy with strict production configuration and dependency-aware readiness checks.
3. Expand CI and verify real browser/API workflows: activation, login/logout/refresh, cross-office authorization, private/group messages, upload/download access, announcements, work assignments, and emergency delivery.
4. Rehearse migrations on a disposable restored database and complete the project's database/message-security audit commands. Verify encrypted historical data and attachment access after any key/configuration change.
5. Demonstrate backup and restore of database, stored objects, and required historical encryption/signing keys. Existing backup scripts/documents do not prove a recoverable production installation; no restore drill was performed in this review.
6. Establish measured single-instance capacity, restart behavior, outage alerts, and a rollback procedure for the intended employee population. If multiple instances or high availability are required, implement shared realtime/rate-limit infrastructure and coordinated background jobs first.

Production readiness remains **not approved** until the blockers are fixed and the deployment/database/browser checks above supply evidence for the intended environment.
