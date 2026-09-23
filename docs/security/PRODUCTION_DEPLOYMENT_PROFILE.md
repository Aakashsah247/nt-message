# NT Message production deployment profile

`render.yaml` remains the temporary external staging profile. It intentionally permits synthetic-file testing without ClamAV and must not be promoted as production configuration.

Use `render.production.yaml` as the production baseline. It differs in the release-critical areas:

- generates the Prisma client before the API build;
- runs database migrations without executing the development seed on every start;
- uses the dependency-aware database health endpoint;
- requires `DEPLOYMENT_PROFILE=production`;
- requires `ATTACHMENT_SCAN_MODE=clamav` and a reachable `CLAMAV_HOST`;
- uses durable Supabase object storage for attachments, profile photos, and group photos;
- configures bounded Web Push delivery and trusted push-service host suffixes.

The production API is expected to fail closed at startup when required storage/scanner/security configuration is unavailable. Emergency SMS also fails closed until the approved Nepal Telecom SMS provider is integrated; the mock SMS provider is development-only.

Before production approval, provision the secrets marked `sync: false`, test `/api/v1/health/database`, upload/download profile and group photos across a redeploy, confirm ClamAV rejection with a safe scanner test fixture, and run the full release gate.
