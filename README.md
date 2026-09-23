# NT Message

NT Message is an internal communication and operations platform for Nepal Telecom employees. It combines employee messaging, office and organization management, work assignments, duty schedules, announcements, and operational reporting in a React web application backed by a NestJS API and PostgreSQL.

**Production status: not approved for production as of September 23, 2026.** The application builds and its checked regression suites pass, but the review identified security, SMS delivery, deployment, storage, and testing gaps. This README describes the current implementation and a proposed Nepal Telecom server deployment procedure. Following the procedure does not fix the application defects or constitute production acceptance.

Repository version: `0.1.0`. The deployment examples use placeholder hostnames, identities, and credentials; replace them with Nepal Telecom-approved values. Linux examples target Ubuntu Server 24.04 LTS. Other Linux distributions require equivalent package, service, and firewall configuration. A Nepal Telecom server has not been provisioned or tested by this documentation change.

**Navigation**

- [Features and access model](#features)
- [Architecture and technologies](#architecture)
- [Security model](#security)
- [Known problems and release blockers](#readiness)
- [macOS prerequisites](#macos)
- [Linux prerequisites](#linux)
- [Local setup on either OS](#local)
- [Configuration reference](#configuration)
- [Nepal Telecom server preparation](#server)
- [Database provisioning](#database)
- [Production environment and storage](#production-env)
- [ClamAV configuration](#clamav)
- [Build, migrate, and bootstrap](#release)
- [systemd service](#systemd)
- [Nginx, HTTPS, and WebSocket proxy](#nginx)
- [Acceptance tests](#acceptance)
- [Maintenance, backups, and rollback](#operations)
- [Troubleshooting and reference material](#reference)

<a id="features"></a>

**1. Features and access model**

| Area | Implemented capabilities |
| --- | --- |
| Accounts | Unified login, account requests and approval workflows, activation invitations, email OTP activation, password recovery, password changes, session revocation |
| Organization | Offices, hierarchical organization units, memberships, leadership assignments, office heads, delegated permissions, employee transfers and identity corrections |
| Employee directory | Search, organization context, employee profiles, protected avatars |
| Messaging | Private conversations, message requests, personal and official groups, text and attachments, forwarding, reactions, editing/deletion rules, read/delivery receipts, typing and presence, starred/pinned messages, chat folders, search, location/live-location messages |
| Messaging preferences | Privacy and notification preferences, profile descriptions/photos, browser push subscription support |
| Announcements | Scoped audiences, publication lifecycle, attachments, read status and acknowledgements |
| Work management | Work types and information fields, tickets, employee/team assignments, status transitions, support/help requests, sales communication, completion evidence, review, SLA and retention controls |
| Duty management | Shift templates, schedules, coverage requirements, leave, holidays, weekly off and availability |
| Reporting | Work reports, exports, oversight dashboards, activity monitoring and analytics |
| Interface | English/Nepali translation infrastructure, Nepal calendar utilities, role/capability-aware navigation |
| Emergency SMS | Recipient selection and workflow exist, but delivery uses a mock provider; do not rely on it for actual emergencies |

The stable platform account classes are `SUPER_ADMIN` and `OFFICE_USER`. Office Head, Org Unit Head, team leadership, membership, and delegated authority determine operational scope. A platform account class alone does not grant all operational actions. Super Admin oversight does not imply authorization to perform every work/duty mutation. Server-side scope checks remain authoritative.

Active sessions are scheduled to be revoked at **18:00 Asia/Kathmandu**. Users may log in again afterward. This is application policy implemented in code, not an environment switch. Account activation/change/recovery passwords require 12–128 characters, including uppercase, lowercase, a number, and a special character. The seed requires a bootstrap password of at least 16 characters; choose one that also satisfies the normal policy.

<a id="architecture"></a>

**2. Architecture and technologies**

```text
Employee browser
      |
      | HTTPS / WSS, one public origin
      v
Nepal Telecom reverse proxy (Nginx)
      |-- / and static assets --> built React application
      |-- /api/v1/* -----------> NestJS API on 127.0.0.1:4000
      `-- /socket.io/* --------> same API, Socket.IO /messaging namespace
                                      |
                                      |-- PostgreSQL
                                      |-- persistent protected file storage
                                      |-- ClamAV over private TCP
                                      |-- approved SMTP relay
                                      `-- browser push providers, if enabled
```

| Layer | Technology / repository baseline |
| --- | --- |
| Runtime | Node.js **24.x** (`>=24 <25`; `.nvmrc` is `24`) |
| Package manager | pnpm **11.6.0**, pinned in `package.json`; workspace lockfile |
| Frontend | React 19, React Router 7, TypeScript 6, Vite 8, Tailwind CSS 4, i18next/react-i18next, Socket.IO client, Nepali date converter |
| Backend | NestJS 11, Express adapter, TypeScript 5.7-compatible range, Passport/JWT, class-validator/class-transformer, RxJS |
| Database | PostgreSQL; local Compose pins `postgres:18.4-alpine`; Prisma 7.8 client/CLI with `@prisma/adapter-pg` |
| Realtime | Socket.IO 4; authenticated account rooms and session revalidation |
| Cryptography | Node.js crypto, Argon2id, AES-256-GCM, Ed25519, HMAC, SHA-256 |
| Email / push | Nodemailer and `web-push` |
| File scanning | ClamAV `clamd` INSTREAM protocol |
| File storage | Filesystem driver or Supabase storage adapter; on-premises example uses persistent filesystem storage |
| Local infrastructure | Docker Engine/Desktop and Compose; PostgreSQL, Valkey 9.1, Mailpit 1.30.1 |
| Checks | Jest/ts-jest, Node test runner, ESLint, TypeScript, dependency audit and project security scripts |
| Proposed Linux operations | Nginx, systemd, approved TLS certificates, PostgreSQL backups and protected key storage |

Exact resolved application dependencies are in `pnpm-lock.yaml`; package manifests often specify version ranges. The local review used Node 24.16.0. Qualify any newer Node 24 patch with the same tests before promotion.

**Valkey is included in local infrastructure, but current rate limiting, cache, Bloom filter and presence implementations are process-local. Starting Valkey does not make them distributed.** The API supports one production process/instance today. Do not use PM2 cluster mode, multiple systemd replicas, or multiple containers for this API without implementing and testing shared state, Socket.IO delivery, and job coordination.

```text
apps/api/                 NestJS application, Prisma schema/migrations, scripts
apps/api/src/security/    Production configuration, rate limits, logging guards
apps/api/src/conversations/ Messaging, files, notifications, message cryptography
apps/api/prisma/          Schema, migration history, bootstrap seed
apps/web/                 React application and frontend tests
packages/contracts/      Shared TypeScript contracts
scripts/                 Security checks, key generation, source backup tools
docs/                    Architecture, security and readiness documentation
deploy/                  Historical staging and cutover instructions
compose.yaml             LOCAL supporting services; not a full production stack
render.yaml              Temporary external staging deployment; not NTC production
```

No complete production Dockerfile/Compose application deployment is supplied. The server procedure below uses a native Node process supervised by systemd.

<a id="security"></a>

**3. Security model and its limits**

| Control | Current implementation |
| --- | --- |
| Password storage | Argon2id hashes |
| API authentication | Signed JWT access tokens, persisted sessions, enabled-account and session validation |
| Refresh sessions | HttpOnly cookie, Secure in production, single-use hash-checked rotation; strict SameSite outside the special staging profile |
| Cookie request protection | Trusted Origin/Referer checks on cookie-authenticated refresh/logout routes |
| OTP / activation | HMAC-protected OTP storage, expiry, attempt and resend limits, signed activation flows |
| Authorization | Account classes plus office, organization, leadership, membership, delegation and resource scope checks |
| Input handling | Global DTO validation, transformation, unknown-field rejection |
| Message text/captions | Application-layer AES-256-GCM encryption with contextual authenticated data |
| Stored message integrity | Ed25519 envelope signatures; keyed blind-search tokens avoid plaintext message search storage |
| Message attachment security | AES-256-GCM encrypted bytes, signed metadata and SHA-256 ciphertext digests |
| Deletion audit | Message security tombstones and database guards for the secured message architecture |
| Upload controls | File limits/format validation and ClamAV support; photo-path gaps remain, documented below |
| HTTP and logging | Helmet, explicit CORS/proxy handling, sanitized production errors, request IDs, secret-redacting logger |
| Abuse controls | Login lockout and selected-route native rate limits; bounded local cache/Bloom structures |
| Supply chain | Lockfile, tracked-file secret scan, dependency audit and selected CI regression checks |

Message encryption is **server-side application-layer encryption at rest**, not device-to-device end-to-end encryption. The authorized API decrypts content. Server/key compromise remains relevant. This encryption description applies to the secured message subsystem; do not assume every employee record, photo, work attachment, announcement or backup is encrypted by that subsystem. Use approved database/storage/backup encryption and access controls as additional infrastructure measures.

TLS termination, certificates, host patching, backup encryption, intrusion monitoring and network access control are operator responsibilities. Never disable certificate verification to make database/SMTP connections succeed. Use the approved internal CA trust configuration where needed.

Keys belong outside PostgreSQL and Git. Preserve every historical key version still needed by stored messages and backups. Generating replacement version-1 keys on a redeploy can make historical messages unreadable. A database backup without matching keys and files is not a complete recovery set.

<a id="readiness"></a>

**4. Known problems and production release gates**

The September 23 review found:

| Priority | Finding | Required response |
| --- | --- | --- |
| High | Push endpoints accept internal destinations, creating server-side request forgery exposure when push is enabled | Fix destination validation and outbound restrictions before enabling push |
| High | Emergency SMS always binds the mock provider and returns synthetic success | Implement/test actual delivery or remove/disable the feature visibly; no existing environment flag switches to a real provider |
| High | Render build omits Prisma generation | Generate explicitly before building; the procedure below does this |
| High on ephemeral hosting | Profile/group photos bypass remote storage and write locally | Use persistent explicit photo paths or fix storage integration; this on-premises guide sets persistent paths |
| High | External staging profile allows unscanned attachments | Do not use the staging exception in production; require healthy ClamAV |
| Medium | Photo validation accepts arbitrary bytes labeled as images and bypasses scanning | Fix both photo paths; enabling ClamAV alone does not fix them |
| Medium | Refresh coordination is tab-local | Fix and test simultaneous browser-tab refresh/login/logout |
| Medium | Liveness returns OK without checking dependencies | Monitor database health separately and add proper readiness/outage checks |
| Release assurance | CI omits full backend/frontend/lint/browser integration checks | Expand the release gate and run browser/database acceptance tests |

Review evidence: existing-workspace builds and lint passed; frontend tests passed **337/337**; backend tests passed across the initial run and sandbox-related scanner rerun, covering **148 suites / 814 tests**. The production dependency audit reported **0 critical, 0 high, 14 moderate and 2 low** advisory findings. Advisory counts are time-sensitive and are not counts of proven exploitable application defects; rerun before every release.

Full evidence and remediation details: `docs/PRODUCTION_READINESS_REVIEW_2026-09-23.md`. Historical files called “lock” or “completion” document particular checks; they do not override unresolved findings or prove the installed production system is ready.

<a id="macos"></a>

**5. macOS prerequisites**

Install Apple's command-line tools if missing:

```bash
xcode-select --install
```

Using an existing approved [Homebrew installation](https://brew.sh/):

```bash
brew install git node@24 python
export PATH="$(brew --prefix node@24)/bin:$PATH"
npm install --global pnpm@11.6.0
node --version
pnpm --version
```

Keep the `node@24` PATH entry in your shell startup file if necessary. If your organization provides Node through a version manager instead, select Node 24 using `.nvmrc` and install the pinned pnpm version there.

Install and start [Docker Desktop for your Mac architecture](https://docs.docker.com/desktop/setup/install/mac-install/) through the organization's approved software process. Then verify:

```bash
docker version
docker compose version
```

Continue with the common local setup below. A macOS development machine is not the production host described in this guide.

<a id="linux"></a>

**6. Linux prerequisites — Ubuntu 24.04**

Install basic development tools:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates xz-utils build-essential python3 openssl
```

Install an approved Node **24.x** distribution from [Node.js](https://nodejs.org/download/release/latest-v24.x/). One reproducible installation pattern follows. `24.21.0` is an example available at documentation time, not a claim that this repository was tested on that patch. Record and qualify the selected version. On an existing server, reconcile any previous Node installation rather than blindly replacing it.

```bash
NT_NODE_VERSION=24.21.0
case "$(uname -m)" in
  x86_64) NT_NODE_ARCH=x64 ;;
  aarch64|arm64) NT_NODE_ARCH=arm64 ;;
  *) echo 'Use the official Node build for this architecture'; exit 1 ;;
esac
NT_NODE_ARCHIVE="node-v${NT_NODE_VERSION}-linux-${NT_NODE_ARCH}.tar.xz"
mkdir -p /tmp/nt-message-node-install
cd /tmp/nt-message-node-install
curl -fSLO "https://nodejs.org/dist/v${NT_NODE_VERSION}/${NT_NODE_ARCHIVE}"
curl -fSLO "https://nodejs.org/dist/v${NT_NODE_VERSION}/SHASUMS256.txt"
grep " ${NT_NODE_ARCHIVE}$" SHASUMS256.txt | sha256sum --check -
# Continue only when checksum verification reports OK.
sudo tar -xJf "$NT_NODE_ARCHIVE" -C /usr/local --strip-components=1
sudo /usr/local/bin/npm install --global pnpm@11.6.0
node --version
pnpm --version
```

For local infrastructure, install Docker Engine and Compose using [Docker's Ubuntu repository instructions](https://docs.docker.com/engine/install/ubuntu/). On a fresh Ubuntu host without conflicting Docker packages:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF_DOCKER
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF_DOCKER
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Local commands below assume your account can access Docker. Use `sudo docker compose ...` if it cannot. Membership in the Docker group is effectively privileged host access; grant it only according to your server policy. Docker is needed for the local Compose path, not for the native production API deployment.

<a id="local"></a>

**7. Full local setup — common to macOS and Linux**

**7.1 Obtain the code and configuration**

```bash
git clone <APPROVED_REPOSITORY_URL> nt-message
cd nt-message
cp .env.example .env
cp apps/web/.env.example apps/web/.env
chmod 600 .env apps/web/.env
pnpm install --frozen-lockfile
```

Replace `<APPROVED_REPOSITORY_URL>` before executing; this README does not assume a public repository URL. Run subsequent `pnpm` commands from the repository root unless a step explicitly changes directories. Use pnpm rather than creating npm/yarn lockfiles.

Edit `.env`. At minimum:

- Set `POSTGRES_PASSWORD` and the matching URL-encoded password in `DATABASE_URL`; both must use the same host port.
- Set `VALKEY_PASSWORD` and the matching `VALKEY_URL` if starting the full Compose stack.
- Replace the four authentication/OTP/activation secrets with distinct random values.
- Add `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PHONE`, and `SUPER_ADMIN_INITIAL_PASSWORD`. These required seed fields are missing from the root example. `INITIAL_ADMIN_PASSWORD` in that example is not consumed by the current seed.
- Keep local SMTP pointed at Mailpit: `localhost:1025`, no TLS, with its UI at `localhost:8025`.
- Either configure valid VAPID keys or set all three `WEB_PUSH_VAPID_*`/subject values to empty. Placeholder strings are not valid keys. Leave push disabled until its destination validation issue is fixed.

Example additions/changes; substitute a real test identity and a unique local password:

```dotenv
NODE_ENV=development
API_HOST=127.0.0.1
API_PORT=4000
WEB_ORIGIN=http://localhost:5173
SUPER_ADMIN_NAME="Local Test Administrator"
SUPER_ADMIN_EMAIL=local-admin@ntc.net.np
SUPER_ADMIN_PHONE=9800000000
SUPER_ADMIN_INITIAL_PASSWORD="REPLACE_WITH_UNIQUE_STRONG_PASSWORD"
ATTACHMENT_SCAN_MODE=disabled
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=
```

`9800000000` is illustrative only. Use synthetic development data. Development scanning may be disabled; production scanning must be enabled.

Generate random auth secrets locally, one per variable, using a password manager or `openssl rand -hex 32`; store them directly in the protected environment file. Do not paste secrets into tickets or source control.

**7.2 Generate and install message encryption keys**

```bash
pnpm message:security:generate-keys
```

This creates `.env.message-security.generated` with mode `0600` and refuses to overwrite it. Replace the five `MESSAGE_*` placeholder values in `.env` with the generated assignments. The generated file is **not loaded automatically**. Keep one assignment per key in `.env`, retain a protected backup, and never regenerate keys for a database containing messages merely to solve a startup problem.

**7.3 Start local services**

```bash
docker compose up -d
docker compose ps
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Default host ports: PostgreSQL `5432`, Valkey `6379`, SMTP `1025`, Mailpit UI `8025`; all are bound to loopback. The checked-in example uses `5432`, even though an older database connection error message mentions `5433`. If changing `POSTGRES_PORT`, also change `DATABASE_URL`. Container initialization variables apply only to a new database volume; editing the password in `.env` does not change an existing database role password.

The Compose PostgreSQL initialization account is suitable for local development, not the least-privilege production role layout below.

**7.4 Generate Prisma, apply migrations, seed**

```bash
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma validate
pnpm --filter api exec prisma migrate deploy
pnpm --filter api db:seed
```

For a new development database, applying checked-in migrations with `migrate deploy` reproduces the existing schema. Use `pnpm --filter api db:migrate` only when intentionally authoring a new migration on an isolated development database.

The seed creates or updates the Super Admin identity and restores default work types for existing active offices. It does not provision a complete employee organization. An existing Super Admin password is preserved, but its identity/enabled state can be updated; do not run the seed automatically on every production restart. Sign in with `SUPER_ADMIN_EMAIL`, not necessarily the legacy username `admin`.

**7.5 Start both applications**

Terminal 1, repository root:

```bash
pnpm dev:api
```

Terminal 2, repository root:

```bash
pnpm dev:web
```

| Endpoint | Local address |
| --- | --- |
| Web | `http://localhost:5173` |
| API prefix | `http://localhost:4000/api/v1` |
| Liveness | `http://localhost:4000/api/v1/health` |
| Database health | `http://localhost:4000/api/v1/health/database` |
| Mailpit email inbox | `http://localhost:8025` |

Keep the browser origin consistent with `WEB_ORIGIN`; `localhost` and `127.0.0.1` are different origins. `apps/web/.env` uses `/api/v1` for the Vite development HTTP proxy and `http://127.0.0.1:4000` for the direct Socket.IO connection. Restart Vite after changing frontend environment values.

After logging in, create the required offices and office heads, then organization units/memberships/teams, and exercise account requests and activation. Check Mailpit for local activation/password-reset emails. Test both permitted and denied actions with different account scopes.

**7.6 Validate and stop**

```bash
pnpm lint
pnpm --filter api test --runInBand
pnpm --filter web test
pnpm build
node scripts/security_scan_tracked_files.mjs
pnpm audit --prod
```

Root `pnpm test` runs only backend tests. Run frontend tests explicitly. For integration tests, use a disposable database and dedicated environment: the current E2E test initializes the full application, including background jobs.

Stop API/web with Ctrl+C; stop infrastructure with `docker compose down`. Named volumes remain. `docker compose down -v`, database reset commands and `phase15:reset-dev-data` destroy data and are not normal shutdown/upgrade steps.

<a id="configuration"></a>

**8. Configuration reference**

Backend configuration normally loads root `.env` via `../../.env` when the API runs from `apps/api`. Prisma and seed commands also assume that working directory. Exported process variables take precedence over dotenv values. The systemd service below provides an explicit environment file and working directory. Avoid stale `.env` files inside production release folders.

Frontend `VITE_*` values are compiled into public assets. They are not secrets and require a rebuild when changed. Never put database credentials, JWT secrets, private VAPID keys, or message keys in a `VITE_*` variable.

| Group | Variables and meaning |
| --- | --- |
| API | `NODE_ENV`; `API_HOST` (default loopback); `API_PORT` then `PORT` then 4000; `WEB_ORIGIN` (one exact origin, HTTPS in production) |
| Database | `DATABASE_URL`; local Compose also uses `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT` |
| Proxy | `TRUST_PROXY_MODE=none`, `hop-count`, or `render`; `TRUST_PROXY_HOPS` for hop-count. Use `1` only for the one-proxy topology below |
| Rate limiting | `RATE_LIMIT_STORE=native`, `API_INSTANCE_COUNT=1`, `NATIVE_RATE_LIMIT_MAX_BUCKETS=100000` (production permitted range 1000–1000000) |
| Local cache | `NATIVE_CACHE_MAX_ENTRIES` (default 1000) |
| Bloom hints | `NATIVE_BLOOM_BIT_COUNT` (1048576), `NATIVE_BLOOM_HASH_COUNT` (7), `NATIVE_BLOOM_ROTATION_MS` (900000); never authoritative authorization/replay decisions |
| Login/session | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL_SECONDS=900`, `REFRESH_TOKEN_TTL_SECONDS=604800`, `AUTH_COOKIE_NAME`, `LOGIN_MAX_ATTEMPTS=5`, `LOGIN_LOCK_MINUTES=15` |
| OTP | `OTP_HASH_SECRET`, `OTP_TTL_MINUTES=10`, `OTP_RESEND_COOLDOWN_SECONDS=60`, `OTP_MAX_ATTEMPTS=5` |
| Activation | `ACTIVATION_TOKEN_SECRET`, `ACTIVATION_TOKEN_TTL_SECONDS=600`, `ACTIVATION_INVITATION_TTL_HOURS=72` |
| Seed only | `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PHONE`, `SUPER_ADMIN_INITIAL_PASSWORD`; optional legacy `INITIAL_ADMIN_USERNAME` |
| Message keys | `MESSAGE_CRYPTO_ACTIVE_KEY_VERSION`; versioned `MESSAGE_ENCRYPTION_KEY_Vn_B64`, `MESSAGE_SEARCH_INDEX_KEY_Vn_B64`, `MESSAGE_SIGNING_PRIVATE_KEY_Vn_DER_B64`, `MESSAGE_SIGNING_PUBLIC_KEY_Vn_DER_B64` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `SMTP_FROM`, paired `SMTP_USER`/`SMTP_PASSWORD`; connection/greeting/socket timeouts default 10000/10000/30000 ms |
| Storage | `ATTACHMENT_STORAGE_DRIVER=filesystem`, absolute `ATTACHMENT_STORAGE_ROOT`, `ATTACHMENT_UPLOAD_TEMP_DIR`, explicit `PROFILE_PHOTO_STORAGE_DIR`, `GROUP_PHOTO_STORAGE_DIR` |
| Legacy paths | `MESSAGE_ATTACHMENT_STORAGE_DIR`, `WORK_ATTACHMENT_STORAGE_DIR` are fallback paths when the unified storage root is absent; prefer the explicit root for new deployments |
| Scanning | `ATTACHMENT_SCAN_MODE=clamav`, `CLAMAV_HOST`, `CLAMAV_PORT=3310`, `CLAMAV_TIMEOUT_MS` (default 30000) |
| Retention | `MESSAGE_PRIVATE_ATTACHMENT_RETENTION_DAYS=90`, `MESSAGE_PERSONAL_GROUP_ATTACHMENT_RETENTION_DAYS=30`, `MESSAGE_OFFICIAL_GROUP_ATTACHMENT_RETENTION_DAYS=30`, `ANNOUNCEMENT_ATTACHMENT_RETENTION_DAYS=90` |
| Push | `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`, `WEB_PUSH_TTL_SECONDS=300`; omit all key/subject values to disable |
| Web build | `VITE_API_URL=/api/v1`; `VITE_SOCKET_URL=https://APPROVED_HOST` (origin only, no `/messaging` or `/socket.io`) |
| Optional remote storage | `ATTACHMENT_STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`, private `SUPABASE_STORAGE_BUCKET`, `SUPABASE_SIGNED_URL_TTL_SECONDS`, `ATTACHMENT_STORAGE_MAX_OBJECT_BYTES`; not used in this on-premises guide |
| Forbidden production exception | Do not set `DEPLOYMENT_PROFILE=temporary_external_staging` or `ALLOW_UNSCANNED_STAGING_ATTACHMENTS=true` on the NTC production service |

Message upload limits are currently 10 files, 200 MiB per file and 250 MiB total, with smaller content-type limits. Work completion/sales uploads allow 5 files, 25 MiB per file and 50 MiB total. Photos allow 5 MiB. Align proxy body limits, scanner stream limits, temporary disk capacity and storage limits. Work attachment retention includes a code-defined 90-day period after terminal status; changing environment retention values does not change every subsystem's policy. Confirm retention requirements with the data owner before rollout.

The historical `deploy/.env.staging.example` contains outdated/inconsistent values, including a malformed `WEB_ORIGIN`, duplicate `DATABASE_URL`, and misspelled photo-path key. It is not a production template. Use the explicit configuration below and verify each value.

<a id="server"></a>

**9. Nepal Telecom server preparation**

Use an approved Linux host, a dedicated service account, persistent storage and a protected PostgreSQL service. The proposed topology is **one API process behind one Nginx proxy**, with the frontend on the same HTTPS origin. This avoids cross-site refresh-cookie dependencies.

Before provisioning, record the actual application hostname, Linux distribution/architecture, database owner/host/version, storage mount, SMTP relay, TLS issuer, firewall routes, backup destination, expected concurrency, recovery time/data-loss objectives and responsible operators. These details are site-specific; `messages.example.ntc.net.np` below is only a placeholder. Keep the service accessible only to the approved NTC network/VPN until acceptance completes.

A starting lab budget is 4 vCPU, 8 GiB RAM and SSD capacity sized for database/files/backups, with additional memory for build jobs and ClamAV. This is an unbenchmarked planning estimate, not a capacity guarantee. Prefer building on a compatible Linux CI worker and qualify memory/CPU under realistic traffic before production sizing.

| Network path | Access |
| --- | --- |
| Browser → Nginx | TCP 443; TCP 80 only for redirect/certificate workflow if approved |
| Administrative access | SSH restricted to approved management network |
| Nginx → API | Loopback TCP 4000; no direct employee access |
| API → PostgreSQL | Private TCP 5432, source-restricted; verified TLS for network connections |
| API → ClamAV | Loopback/private TCP 3310, never public |
| API → SMTP | Approved relay port 587/465 or approved equivalent |
| Optional browser push | Approved HTTPS push destinations; browsers also need their platform push connectivity |
| Infrastructure updates | Approved package/container registry mirror, ClamAV signature updates, DNS and time synchronization |

Do not expose PostgreSQL, Valkey, ClamAV, Mailpit or the API listener to the public network. For restricted/offline networks, mirror packages and signatures through an approved channel; browser push may be unavailable without external connectivity. Normal in-app Socket.IO delivery can operate on the internal network.

Install Node/pnpm as above. On a fresh Ubuntu application server:

```bash
sudo apt-get update
sudo apt-get install -y nginx clamav clamav-daemon clamav-freshclam git curl ca-certificates python3 build-essential
sudo useradd --system --home-dir /var/lib/nt-message --shell /usr/sbin/nologin ntmessage
sudo install -d -o root -g ntmessage -m 0750 /etc/nt-message
sudo install -d -o root -g root -m 0755 /opt/nt-message /opt/nt-message/releases
sudo install -d -o ntmessage -g ntmessage -m 0750 /var/lib/nt-message
sudo install -d -o ntmessage -g ntmessage -m 0750 /var/lib/nt-message/attachments /var/lib/nt-message/incoming /var/lib/nt-message/profile-photos /var/lib/nt-message/group-photos
```

Provision/mount the durable volume **before** creating production data. Ensure it mounts at boot before the API starts. Keep release directories separate from mutable data. Use an approved deploy account to prepare releases; the runtime account should not own or modify application code. Do not add it to the Docker group.

<a id="database"></a>

**10. Provision PostgreSQL**

Prefer the NTC-managed PostgreSQL service. The reference development version is 18.4; validate migrations and backups on the selected supported production version. Provision PostgreSQL through the DBA's normal package/cluster process rather than assuming Ubuntu's default package installs that major version. Install matching `psql`, `pg_dump`, and `pg_restore` client tools on the operations/backup host.

For a **new empty** database, a DBA can run this in `psql` as the database administrator. Password prompts avoid putting actual passwords in the SQL file/history:

```sql
CREATE ROLE nt_message_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password nt_message_migrator
CREATE ROLE nt_message_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
\password nt_message_app
CREATE DATABASE nt_message OWNER nt_message_migrator;
\connect nt_message
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO nt_message_migrator;
GRANT USAGE ON SCHEMA public TO nt_message_app;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
ALTER DEFAULT PRIVILEGES FOR ROLE nt_message_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nt_message_app;
ALTER DEFAULT PRIVILEGES FOR ROLE nt_message_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO nt_message_app;
```

Run migrations as `nt_message_migrator`, and the API as `nt_message_app`. After migration, grant access to existing objects as well:

```sql
\connect nt_message
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nt_message_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO nt_message_app;
```

These grants are a baseline; the DBA should review them against the actual schema and verify runtime behavior. Do not give the API superuser or role/database creation privileges. Restrict `pg_hba.conf`/firewalls to approved sources, use SCRAM credentials, and configure server certificates and client trust for remote database access. Test certificate verification with the actual Node `pg` adapter; do not assume adding a URL flag proves verification works.

The project uses only `DATABASE_URL`, not an automatic `DIRECT_URL` migration override. Supply the migration credential explicitly to migration commands through a protected operator environment. The runtime service must retain the runtime credential. Percent-encode special characters in URL credentials; do not include Prisma-only query options when using PostgreSQL CLI connection strings.

<a id="production-env"></a>

**11. Production environment, secrets and persistent paths**

Create `/etc/nt-message/api.env`, owned by `root:ntmessage` with mode `0640`, using a secure editor or secret-management deployment. Start from this template, replace all `REPLACE_*` values, and append the generated message-key assignments. No `REPLACE_*` value is usable configuration.

```dotenv
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=4000
WEB_ORIGIN=https://messages.example.ntc.net.np
TRUST_PROXY_MODE=hop-count
TRUST_PROXY_HOPS=1
RATE_LIMIT_STORE=native
API_INSTANCE_COUNT=1
NATIVE_RATE_LIMIT_MAX_BUCKETS=100000
DATABASE_URL=postgresql://nt_message_app:REPLACE_URL_ENCODED_PASSWORD@REPLACE_DB_HOST:5432/nt_message
JWT_ACCESS_SECRET=REPLACE_WITH_RANDOM_ACCESS_SECRET
JWT_REFRESH_SECRET=REPLACE_WITH_DIFFERENT_RANDOM_REFRESH_SECRET
OTP_HASH_SECRET=REPLACE_WITH_RANDOM_OTP_SECRET
ACTIVATION_TOKEN_SECRET=REPLACE_WITH_RANDOM_ACTIVATION_SECRET
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=604800
AUTH_COOKIE_NAME=nt_message_refresh
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
OTP_TTL_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_MAX_ATTEMPTS=5
ACTIVATION_TOKEN_TTL_SECONDS=600
ACTIVATION_INVITATION_TTL_HOURS=72
SMTP_HOST=REPLACE_APPROVED_SMTP_HOST
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_FROM="NT Message <REPLACE_APPROVED_SENDER>"
SMTP_USER=REPLACE_SMTP_USER
SMTP_PASSWORD=REPLACE_WITH_SMTP_PASSWORD
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=30000
ATTACHMENT_STORAGE_DRIVER=filesystem
ATTACHMENT_STORAGE_ROOT=/var/lib/nt-message/attachments
ATTACHMENT_UPLOAD_TEMP_DIR=/var/lib/nt-message/incoming
PROFILE_PHOTO_STORAGE_DIR=/var/lib/nt-message/profile-photos
GROUP_PHOTO_STORAGE_DIR=/var/lib/nt-message/group-photos
ATTACHMENT_SCAN_MODE=clamav
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=180000
MESSAGE_PRIVATE_ATTACHMENT_RETENTION_DAYS=90
MESSAGE_PERSONAL_GROUP_ATTACHMENT_RETENTION_DAYS=30
MESSAGE_OFFICIAL_GROUP_ATTACHMENT_RETENTION_DAYS=30
ANNOUNCEMENT_ATTACHMENT_RETENTION_DAYS=90
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=
WEB_PUSH_TTL_SECONDS=300
```

For a relay that authenticates by source IP, omit both SMTP credentials only if that is its approved configuration. For port 465, normally set `SMTP_SECURE=true`; for STARTTLS on 587 use the settings above. Add approved DB TLS parameters/trust for the chosen database; the template deliberately cannot supply its CA policy.

Generate fresh production message keys **once**, on a secure provisioning host, with `node scripts/generate_message_security_keys.mjs --output <PROTECTED_OUTPUT_FILE>`. Transfer the five generated assignments securely into `api.env` and escrow them. Generate distinct auth secrets of at least 32 characters. Do not copy development/staging secrets into production.

```bash
sudo chown root:ntmessage /etc/nt-message/api.env
sudo chmod 0640 /etc/nt-message/api.env
```

Put first-time `SUPER_ADMIN_*` values in a separate protected bootstrap environment file, not the permanent runtime file. After bootstrap, remove the deployed bootstrap password copy according to secret-management policy; retaining a deliberate recovery process is different from rerunning the seed on boot.

Both explicit photo paths above are necessary: existing photo code does not automatically use `ATTACHMENT_STORAGE_ROOT`. Back up the complete `/var/lib/nt-message` data set, excluding temporary incoming uploads if policy permits. Do not serve these directories through an Nginx `alias`; downloads require API authorization.

Optional push key generation after its security fixes are accepted:

```bash
umask 077
pnpm --filter api exec node -e 'console.log(JSON.stringify(require("web-push").generateVAPIDKeys()))' > /secure/operator/path/nt-message-vapid.json
```

Create the protected output directory first. Transfer `publicKey`/`privateKey` to the corresponding backend variables and set an operations `mailto:` subject. Keep the private key secret and verify delivery from representative managed browsers. Push subscription behavior, browser permissions and external provider access must all be tested.

<a id="clamav"></a>

**12. Configure ClamAV before starting production**

The API requires a healthy TCP ClamAV scanner at startup in strict production mode. Ubuntu commonly defaults to a Unix socket, so explicitly configure TCP loopback. Edit `/etc/clamav/clamd.conf`, replacing existing directives rather than duplicating them:

```text
TCPSocket 3310
TCPAddr 127.0.0.1
StreamMaxLength 220M
MaxFileSize 220M
MaxScanSize 400M
AlertExceedsMax yes
```

These are starting limits to support a 200 MiB message file; measure scan times and memory and review archive/decompression policy. [ClamAV INSTREAM uses `StreamMaxLength`](https://docs.clamav.net/manual/Usage/ClamdProtocol.html). Limit-exceeded conditions should reject/quarantine files rather than appear clean. Keep signatures updated; provision an approved mirror when external updates are blocked.

```bash
sudo systemctl enable --now clamav-freshclam
# Wait for a successful signature download, then start/restart clamd.
sudo systemctl enable --now clamav-daemon
sudo systemctl restart clamav-daemon
sudo systemctl status clamav-daemon --no-pager
sudo ss -ltnp | grep ':3310'
```

A read-only protocol check:

```bash
python3 - <<'PY'
import socket
with socket.create_connection(('127.0.0.1', 3310), timeout=5) as scanner:
    scanner.sendall(b'zPING\0')
    print(scanner.recv(128).decode(errors='replace'))
PY
```

Expect `PONG`. Validate real upload rejection behavior in isolated acceptance testing. This scanner configuration does not repair the known photo-path bypass.

<a id="release"></a>

**13. Build a release, migrate, and bootstrap**

Run the build on Linux with the target architecture/libc, or on the server as an approved deploy account. Do not copy macOS `node_modules` to Linux; native modules such as Argon2 must match the target. Keep build and runtime dependencies available for this initial deployment pattern; pruning requires separate artifact validation.

Choose an approved immutable tag/commit. A privileged operator creates a release directory owned by the deploy account; replace both placeholders:

```bash
NT_RELEASE=REPLACE_APPROVED_RELEASE_ID
sudo install -d -o "$USER" -g "$(id -gn)" -m 0755 "/opt/nt-message/releases/$NT_RELEASE"
git clone <APPROVED_REPOSITORY_URL> "/opt/nt-message/releases/$NT_RELEASE"
cd "/opt/nt-message/releases/$NT_RELEASE"
git checkout --detach <APPROVED_COMMIT_OR_TAG>
```

Create `apps/web/.env.production` in this release:

```dotenv
VITE_API_URL=/api/v1
VITE_SOCKET_URL=https://messages.example.ntc.net.np
```

Inspect/remove conflicting `apps/web/.env.local` or `.env.production.local` settings before building. Vite gives local override files priority. These two frontend values must match the planned public host.

Build and run source checks using a disposable build-time URL, not production secrets:

```bash
pnpm install --frozen-lockfile
DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm --filter api exec prisma generate
DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm --filter api exec prisma validate
pnpm lint
pnpm --filter api test --runInBand
pnpm --filter web test
pnpm build
node scripts/security_scan_tracked_files.mjs
pnpm audit --prod
```

Prisma generation/validation does not need a live database, but its config requires a URL. Do not set `NODE_ENV=production` while installing if that would omit build tools. Backend output is `apps/api/dist/main.js`; frontend output is `apps/web/dist/`. Generated Prisma code is ignored by Git and **must be generated before building**.

For the database steps, enter an approved operator shell and load the protected environment through your secret-management tool. If using a shell-compatible environment file, source it only when it is trusted and correctly quoted; sourcing executes shell code. Do not enable shell tracing. Set/export `DATABASE_URL` to the migration role's credential **for this shell only**. Do not edit the systemd runtime file to give it migration privileges.

For example, an operator who is authorized to read the protected files can use the following pattern. Prepare `migration.env` with only the migration `DATABASE_URL`; prepare `bootstrap.env` with only the four `SUPER_ADMIN_*` fields. Keep these outside the release tree, restrict them to the operator, and ensure values are valid for both the chosen secret loader and the shell. The `/secure/operator/path` paths are examples to replace with your actual protected locations.

```bash
set +x
set -a
. /secure/operator/path/api.env
. /secure/operator/path/migration.env
set +a
```

On upgrades, first stop writes/background jobs and take the coordinated backups described below. On a new installation, confirm the target is the intended empty database. Then, from the release root:

```bash
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma migrate status
```

Have the DBA apply the runtime grants from section 10. For a new installation only, load the protected bootstrap identity fields and run:

```bash
set -a
. /secure/operator/path/bootstrap.env
set +a
pnpm --filter api db:seed
unset SUPER_ADMIN_INITIAL_PASSWORD
```

Run post-migration checks with the intended runtime database credential and the correct message-key environment:

```bash
# Reload the runtime environment to replace the migration DATABASE_URL.
set -a
. /secure/operator/path/api.env
set +a
pnpm message:security:architecture-lock
pnpm message:security:audit
pnpm message:security:final-lock
```

For an existing installation with legacy data, use the relevant cutover/backfill runbook first. `message:security:backfill` and `message:security:backfill-attachments` write data; do not run blindly or mark failed migrations applied. Never use `migrate reset`, `migrate dev`, `db push`, or development reset scripts on production.

After checks, make the release readable but not writable by the runtime account. Verify that the Nginx user can traverse to `apps/web/dist` and that `ntmessage` can read dependencies and the API build. No secrets should remain in the release tree.

For the initial activation (or a maintenance-window upgrade with the API stopped), select the completed release:

```bash
sudo ln -sfn "/opt/nt-message/releases/$NT_RELEASE" /opt/nt-message/current
```

`current` must be a symlink, not an existing directory. Record the previous target before switching on upgrades. Keep the previous artifact until acceptance and the compatible rollback window have ended.

<a id="systemd"></a>

**14. Run the API under systemd**

Save the following as `/etc/systemd/system/nt-message-api.service`. Verify that Node is actually installed at `/usr/local/bin/node`; change the path if needed. Do not point systemd to a version-manager binary inside an administrator's home directory.

```ini
[Unit]
Description=NT Message API
Wants=network-online.target
After=network-online.target clamav-daemon.service
RequiresMountsFor=/var/lib/nt-message

[Service]
Type=simple
User=ntmessage
Group=ntmessage
WorkingDirectory=/opt/nt-message/current/apps/api
EnvironmentFile=/etc/nt-message/api.env
ExecStart=/usr/local/bin/node /opt/nt-message/current/apps/api/dist/main.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0027
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/nt-message
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nt-message-api

[Install]
WantedBy=multi-user.target
```

The service does not run migrations or seed on startup. Deployments run those as explicit operations. Retention, scheduled announcements, socket checks and session policy jobs execute within the API process; do not start a second independent API as an improvised worker.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nt-message-api
sudo systemctl status nt-message-api --no-pager
sudo journalctl -u nt-message-api -n 100 --no-pager
curl --fail http://127.0.0.1:4000/api/v1/health
curl --fail http://127.0.0.1:4000/api/v1/health/database
```

Startup must fail when production secrets/keys, required storage or scanner configuration is invalid. Correct the cause; do not enable staging exceptions to bypass it. Validate shutdown/restart under active transfers; the current bootstrap does not explicitly enable Nest shutdown hooks, so do not assume graceful draining of every background operation.

<a id="nginx"></a>

**15. Nginx, HTTPS and WebSocket configuration**

Provision DNS and an approved certificate/full chain and private key for the actual hostname. Use the NTC PKI or approved ACME process; distribute internal CA trust to client devices if needed. The example assumes TLS ends at this Nginx and it is the only proxy. If a load balancer sits before it, redesign the trusted-client-IP chain and hop count with the network team.

Save this configuration under `/etc/nginx/sites-available/nt-message`. Replace the hostname and certificate paths. Its `map` and `log_format` directives belong in the Nginx `http` context; Ubuntu normally includes `sites-enabled/*` there. Explicit [WebSocket upgrade headers](https://nginx.org/en/docs/http/websocket.html) are required.

```nginx
map $http_upgrade $nt_message_connection_upgrade {
    default upgrade;
    ''      close;
}

# Do not log query strings: media access URLs can carry bearer-like tokens.
log_format nt_message_safe '$remote_addr [$time_local] '
                           '"$request_method $uri $server_protocol" '
                           '$status $body_bytes_sent $request_time';

server {
    listen 80;
    server_name messages.example.ntc.net.np;
    return 301 https://messages.example.ntc.net.np$request_uri;
}

server {
    listen 443 ssl;
    server_name messages.example.ntc.net.np;
    ssl_certificate /etc/nt-message/tls/fullchain.pem;
    ssl_certificate_key /etc/nt-message/tls/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /opt/nt-message/current/apps/web/dist;
    index index.html;
    client_max_body_size 260m;
    access_log /var/log/nginx/nt-message-access.log nt_message_safe;
    # Error diagnostics can include request URLs; restrict and redact them.
    error_log /var/log/nginx/nt-message-error.log warn;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header Referrer-Policy no-referrer always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header Permissions-Policy "camera=(), microphone=(self), geolocation=(self), payment=(), usb=()" always;
    add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' wss://messages.example.ntc.net.np; media-src 'self' blob: https:; frame-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests" always;

    location /api/v1/ {
        # No trailing slash on proxy_pass: preserve the /api/v1 prefix.
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $nt_message_connection_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }

    location /assets/ {
        try_files $uri =404;
        expires 7d;
    }

    # SPA navigation and service-worker updates must reach the current release.
    location / {
        expires -1;
        try_files $uri $uri/ /index.html;
    }
}
```

Private API files stay outside the web root. Ensure proxy temporary-body storage has room for concurrent 250 MiB uploads. The frontend service worker and HTML should revalidate after deployment; hashed assets can be cached. Account for old open tabs requesting old chunks during a release switch, and test the upgrade experience.

```bash
sudo ln -s /etc/nginx/sites-available/nt-message /etc/nginx/sites-enabled/nt-message
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl --fail https://messages.example.ntc.net.np/api/v1/health
curl --fail https://messages.example.ntc.net.np/api/v1/health/database
```

Create the symlink only if absent. Resolve conflicting virtual hosts before enabling. Never use Vite's development server or `vite preview` as the production web server. Verify there are no redirects, logs or analytics that retain sensitive activation/media query tokens; default proxy error logs can include request URLs even when access logs omit them.

<a id="acceptance"></a>

**16. Production acceptance and launch**

Keep access restricted to the acceptance group until the release owner approves evidence for all applicable checks:

- All high-priority review findings fixed or the affected feature removed with an explicit release-scope decision; verify the implementation, not only this README.
- Fresh Linux checkout installs, generates Prisma, builds, lints and passes both test suites; audit findings have a recorded disposition.
- Database migrations succeed on a restored test database before production; migration and message-security audit results are recorded.
- Login, email activation/recovery, password change, multi-tab refresh, logout-all and the 18:00 Kathmandu session policy work with representative browsers.
- Employees cannot access other office/organization resources outside their authorization; office heads, team leaders and Super Admin oversight behave as intended.
- Private/group messaging, notifications, receipts, attachment uploads/downloads, voice/media, and unauthorized download rejection work through HTTPS and WebSockets.
- Scanner rejection, scanner outage, disk-full behavior and retained-file access are exercised with controlled test data.
- Photos/files remain available after API restart, server reboot and release replacement.
- Work creation/assignment/completion/review, duty changes, announcements and report export work end to end.
- SMS is genuinely delivered and its status semantics are verified if included in the release; browser push is tested if enabled.
- Monitor database health separately from liveness; test database/SMTP/scanner failure and recovery, alerts and log handling.
- Backup restore, historical message decryption, capacity/load, fail/restart behavior, certificate renewal and the rollback procedure are demonstrated.

There is no proven user-count capacity or high-availability guarantee in this repository. If the required service objectives need multiple API replicas, shared state and coordinated jobs must be implemented before that topology is used.

<a id="operations"></a>

**17. Operations, backups, upgrades and rollback**

**Routine operations**

```bash
sudo systemctl status nt-message-api nginx clamav-daemon --no-pager
sudo journalctl -u nt-message-api --since '30 minutes ago'
curl --fail http://127.0.0.1:4000/api/v1/health/database
df -h /var/lib/nt-message
```

Monitor availability, API latency/error rate, database connections/slow queries, disk/inodes, upload failures, scanner signature age/timeouts, SMTP failures, realtime disconnects, retention failures and backup age/restore results. Forward logs to the approved NTC platform with restricted access and retention. No central monitoring/alerting service is installed by the repository. Configure time synchronization; application calendar/session logic relies on accurate time.

Retention jobs delete eligible files. Backups and retention policy must be agreed together; a backup can retain data longer than the live application. Define storage quotas and capacity alerts before enabling broad file sharing.

**Complete recovery set**

Back up and protect all of:

1. PostgreSQL data and migration history, with a tested restore procedure and, where required, DBA-managed point-in-time recovery.
2. Persistent message, announcement, work, profile and group file paths, plus ownership/permissions.
3. Current and historical message encryption/search/signing keys, required application secrets and configuration, under separate controlled secret storage.
4. The exact compatible application commit/build, runtime/dependency versions and server/proxy configuration.

`pnpm backup:source` creates a sanitized source ZIP. It intentionally excludes `.env`, runtime storage, database dumps, dependencies and generated clients. **It is not a production-data backup.**

The repository also supplies `phase13:backup-db` and `phase13:restore-db`; review `deploy/PHASE13_CUTOVER_ROLLBACK.md` before using them. They require PostgreSQL client tools. A successful archive listing is not a successful restore rehearsal.

For an operator-managed PostgreSQL backup, use a protected libpq service/password configuration (`PGSERVICE` and `PGPASSFILE`, password file mode `0600`) rather than putting credentials in command arguments. After configuring a backup role with the required read rights, a typical sequence is:

```bash
umask 077
NT_BACKUP_DIR=/secure/nt-message/backups/REPLACE_BACKUP_ID
mkdir -p "$NT_BACKUP_DIR"
PGSERVICE=nt_message_backup pg_dump --format=custom --file "$NT_BACKUP_DIR/database.dump"
pg_restore --list "$NT_BACKUP_DIR/database.dump" > "$NT_BACKUP_DIR/database.contents"
sha256sum "$NT_BACKUP_DIR/database.dump" > "$NT_BACKUP_DIR/database.dump.sha256"
```

The service `nt_message_backup` must be configured by the DBA; it is not provided by this repo. Use matching PostgreSQL tools. Coordinate the database dump with a storage snapshot while writes/background jobs are stopped, or use an approved consistent snapshot design. A live DB dump plus an unrelated later file copy is not necessarily a consistent recovery point. Encrypt/copy backups off-host and alert on failure.

For a restore drill, create a separate empty database and isolated file storage, restore with the appropriate owner/role mapping, then run the matching application revision with the correct keys. Never point a rehearsal at the production database or production writable file paths. Confirm login, message decryption, attachment retrieval, organization scope and work state, then record achieved recovery times.

**Upgrade procedure**

1. Prepare a new immutable release directory and validate it without changing `current`.
2. Record the current release, migration state, config/key versions and recovery owner. Rehearse migrations and compatible rollback on restored data.
3. Put the service into an approved maintenance window, block new traffic and stop `nt-message-api` so background jobs stop too. Allow time for active requests to finish before stopping; do not assume the current process provides complete graceful draining.
4. Take/verify coordinated database, storage and configuration/key backups.
5. Run `prisma migrate deploy` exactly once using the migration credential; verify migration status and runtime grants.
6. Run applicable security/data checks, switch `current`, start the API and verify liveness/database health, then publish/reload the frontend proxy as needed.
7. Complete the acceptance smoke tests before reopening employee traffic. Keep the previous release and recovery set until the rollback window closes.

Do not put migrations, seeds, data resets or key generation in the systemd startup command. Do not overwrite a running release in place.

**Rollback rule**

Code-only rollback is safe only when the earlier code is compatible with the current database and stored data. Migration `20260913032500_remove_phase13_legacy_schema` is a destructive boundary: reverting to code before it requires the matching pre-migration database restoration, not merely changing the release symlink. A restore can discard newer writes. Preserve incident data, stop writers and obtain the designated recovery decision before restoring. Follow the existing Phase 13 runbook and the release-specific migration plan.

**Key rotation**

Generate a new numbered key version into a protected file; retain older required versions. Rehearse loading both versions, new writes, old message reads/search/integrity checks and backup restoration. Key generation alone does not re-encrypt historical records. Change `MESSAGE_CRYPTO_ACTIVE_KEY_VERSION` only as part of the tested rotation procedure. Never remove old keys just because the active version changed.

<a id="reference"></a>

**18. Troubleshooting**

| Symptom | Check / action |
| --- | --- |
| Missing `generated/prisma/client` or enums | Run `pnpm --filter api exec prisma generate` with a configured `DATABASE_URL` before build |
| Database connection failure | Verify actual host/port, credentials, URL encoding, service health, firewall and CA trust; do not assume the error text's historical 5433 port |
| Seed says Super Admin fields missing | Add the four `SUPER_ADMIN_*` variables; `INITIAL_ADMIN_PASSWORD` is obsolete for the current seed |
| Cannot log in as `admin` | Seed uses the official Super Admin email as username |
| Encrypted messages fail after restart | Restore the original matching key versions; do not generate replacements over existing keys |
| API refuses production startup | Verify HTTPS origin, strong/distinct auth secrets, valid matching message keys, storage paths, proxy settings, single-instance policy, SMTP TLS and ClamAV health |
| Browser calls localhost in production | Correct both `VITE_API_URL` and `VITE_SOCKET_URL`, inspect local override files, rebuild/redeploy the frontend |
| Refresh fails / cookie absent | Check exact HTTPS origin, same-origin proxy, cookie path, Origin/Referer guard and multi-tab race; do not switch to staging mode as a workaround |
| UI loads but realtime does not | Check `/socket.io/` proxy, Upgrade/Connection headers, WSS hostname/CSP, token/session validity and firewall |
| Upload returns 413 or scanner limit error | Align Nginx body limit, application file/total limits, ClamAV stream/archive limits, temp storage and timeouts |
| Photos disappear | Verify explicit persistent `PROFILE_PHOTO_STORAGE_DIR` and `GROUP_PHOTO_STORAGE_DIR`; Supabase attachment selection does not migrate them |
| Email fails | Check relay reachability, sender authorization, paired SMTP credentials, STARTTLS/implicit TLS selection and trusted certificates |
| No background push | Blank/missing keys intentionally disable it; also check fixed endpoint security, valid VAPID keys, HTTPS, browser permission and provider connectivity |
| SMS says sent but nothing arrives | Current provider is a mock; infrastructure configuration cannot make it deliver real SMS |
| Health is OK but application fails | Query `/api/v1/health/database`, inspect dependency errors and scanner/storage health; liveness alone is insufficient |
| Wrong translations or untranslated labels | Run `pnpm --filter web i18n:check`; some work screens still contain literal English labels |
| systemd cannot read/write files | Verify working directory, Node path, release traversal permissions, mounted data ownership and `ReadWritePaths`; do not make secrets/world directories writable |

**19. Useful project commands and documentation**

| Command | Purpose / scope |
| --- | --- |
| `pnpm dev:web`, `pnpm dev:api` | Development processes |
| `pnpm infra:up`, `pnpm infra:status`, `pnpm infra:down` | Local supporting containers |
| `pnpm build`, `pnpm lint` | Both applications; Prisma must already be generated |
| `pnpm --filter api test --runInBand` | Backend unit/regression suites |
| `pnpm --filter web test` | Frontend Node tests, including source-contract checks |
| `pnpm --filter api test:e2e` | Current limited E2E suite; isolated test database only |
| `pnpm --filter web i18n:check` | Translation catalog checks |
| `node scripts/run_security_gate.mjs` | Secret scan, high-severity audit gate, selected security tests, API build |
| `node scripts/run_final_security_lock.mjs` | Additional build and database-dependent cryptographic checks; configure the intended environment first |
| `pnpm message:security:audit` | Audit stored message/tombstone/attachment cryptographic state |
| `pnpm --filter api phase13:cutover-postflight` | Historical Phase 13-specific postflight checks; use with the corresponding runbook |
| `pnpm backup:source` | Sanitized source archive, not operational data backup |

Repository reference files:

- `docs/PRODUCTION_READINESS_REVIEW_2026-09-23.md`: current reviewed findings and limits.
- `docs/security/PRODUCTION_SECURITY_LOCK.md`: security controls and single-instance constraint.
- `docs/security/MESSAGE_AT_REST_SECURITY_LOCK.md`: message encryption/integrity architecture.
- `deploy/PHASE13_CUTOVER_ROLLBACK.md`: destructive migration and restore rules.
- `docs/hierarchy-work-v3/`: organization/work migration history and design checkpoints.
- `deploy/RENDER_SUPABASE_STAGING.md` and `render.yaml`: temporary external staging only.
- `apps/api/prisma/schema.prisma`, package manifests and `pnpm-lock.yaml`: implementation/version source of truth.

Official operational references: [Node 24 distributions](https://nodejs.org/download/release/latest-v24.x/), [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/), [Docker Desktop for macOS](https://docs.docker.com/desktop/setup/install/mac-install/), [Nginx WebSockets](https://nginx.org/en/docs/http/websocket.html), [ClamAV scanning](https://docs.clamav.net/manual/Usage/Scanning.html), and [PostgreSQL psql](https://www.postgresql.org/docs/current/app-psql.html).

This is a private project; the API package declares `UNLICENSED`. Confirm internal ownership and third-party license requirements through the normal organization process before distributing it. Keep deployment credentials, real employee data, private keys, logs and backups out of source archives and issue reports.
