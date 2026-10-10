# Preview Hosting

## Recommended deployment

Use **Render Free for the Node/Fastify application and Neon Free for PostgreSQL**. Render serves the browser build and API at the same HTTPS origin; Neon retains learner profiles, assessment evidence, and rewards across service restarts. This preserves the current stack and avoids cross-site session cookies.

The browser renders the Babylon.js world on the learner's device. Server GPU hosting is unnecessary. The backend processes small assessment records and the mock classifier; model-training environments are a separate future workload.

`render.yaml` requests one free Node service, Node.js 24, the existing production build, and `/api/health`. `DATABASE_URL` must be supplied privately. No managed Render database, paid disk, paid instance, or OpenRouter key is requested.

## Verified allowances and tradeoffs

Provider documentation was checked on 2026-10-09. Official repository sources were used where direct documentation access was blocked. Allowances apply to the provider account/project, not each player.

| Service                 | Verified allowance                                                                                                                                                       | Effect on this prototype                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Render Free web service | 512 MB RAM, 0.1 CPU, 750 instance-hours per workspace/month; sleeps after 15 minutes without traffic                                                                     | Suitable for a bounded preview, with cold starts. Runtime files are ephemeral; free services cannot use a persistent disk. The current numeric bandwidth allowance and card-verification policy still require confirmation in the dashboard.                 |
| Neon Free PostgreSQL    | 1 GB per project, 20 GB account storage total; 100 CU-hours per project/month; 5 GB public network transfer per project/month; scales up to 2 CU, approximately 8 GB RAM | Suspends after 5 idle minutes and wakes for a connection. At 0.25 CU, 100 CU-hours corresponds to 400 active hours, not unlimited always-on operation. Compute/transfer exhaustion suspends service until renewal or an upgrade; it does not delete records. |
| Cloudflare Pages Free   | Static requests free and unlimited; 500 builds/month, 20,000 files, 25 MiB per asset                                                                                     | Useful later for distributing larger game assets. Pages alone does not run the present Fastify service. A separate API or an edge adapter is required.                                                                                                       |
| Cloudflare Workers Free | 100,000 requests/day, 10 ms CPU/request, 128 MB memory                                                                                                                   | An alternative architecture requiring runtime integration and remote storage, rather than a drop-in persistent Node server.                                                                                                                                  |
| Supabase Free           | Two active projects; 500 MB PostgreSQL per project; shared CPU with up to approximately 0.5 GB RAM; 1 GB file storage; 5 GB egress plus 5 GB cached egress               | Alternative database/object-storage provider. Projects with low activity over 7 days can pause and require dashboard resumption. Use its connection pooler when the host lacks IPv6.                                                                         |
| GitHub Pages            | 1 GB published site, 100 GB/month soft bandwidth limit                                                                                                                   | Static hosting only. Free public-repository availability does not imply free private-repository Pages. This repository is private, and the current integration cannot access its Pages API.                                                                  |

Neon's CU-hours and database-transfer allowances cover database work, not browser downloads of the game's GLB files, textures, or JavaScript. Those downloads count against the application/static host. As asset traffic grows, introduce a CDN while preserving same-origin API routing and durable backend authority.

Koyeb remains an unselected alternative: its current official free-instance quotas, account verification, and storage policy could not be retrieved in this environment. Historical quota figures are not treated as verified.

## Classification and training services

The implemented mock classifier has no inference charge or external model dependency. A future OpenRouter free-model endpoint is limited to 20 requests/minute and 50 requests/day without purchased credits. Ten graded response chunks plus one routing call use at least eleven requests, allowing approximately four such assessments per day before retries. This is a small trial allowance, not community-scale inference capacity. A qualifying educational classification model still needs tutor-reviewed benchmarking; Jev Router's catalogue entry does not establish that suitability.

Google Colab and Kaggle notebooks remain candidates for the later small-model training curriculum. Current account eligibility, free compute quotas, and available sessions have not been verified. They must not be treated as guaranteed GPU hosting or required to render the browser game.

Hugging Face Docker Spaces is excluded from the zero-purchase deployment. Its current documentation requires a paid personal PRO or organization plan to create Docker/Gradio compute Spaces, although CPU Basic hardware itself has no hourly cost. Static Spaces remain free. Protected visibility, which keeps source private while publishing an app, is also a paid-plan feature.

## Deploy the prepared configuration

1. Create or use a **Neon Free** project near the chosen Render region. Select a pooled PostgreSQL connection string with TLS and set conservative compute limits. Keep the free plan; do not enable a paid fallback.
2. Connect the private GitHub repository to a Render account. Create a Blueprint from `render.yaml` and supply `DATABASE_URL` as a secret environment variable. Confirm the selected service remains **Free**, with no disk or paid database.
3. Allow the build and health check to finish. Open the actual Render HTTPS URL and exercise guest registration, avatar movement, the authored questions, post-clearance mock classification, and refresh recovery.
4. Restart/redeploy the service and repeat recovery with the same browser cookie. Verify that evidence and points remain in external PostgreSQL rather than local ephemeral files.
5. Record the deployed URL and browser evidence only after those checks pass. A configuration file or healthy local server does not establish public deployment.

The implementation selects external PostgreSQL when `DATABASE_URL` is provided and retains PGlite for local development. The configured production service must not fall back to a local database. Use a pooled connection and an idle timeout. Database-backed health polling can keep Neon active while the application is awake, so autosuspend timing depends on all connection activity, not just learner requests.

The Docker image follows the same production requirement: supply `DATABASE_URL` at runtime. It does not mount a local database volume. Build with `docker build -t amamihe-preview .`, then run with a private environment file: `docker run --rm -p 3000:3000 --env-file .env amamihe-preview`.

A prior image snapshot was built and exercised against a disposable local PostgreSQL server: production health, static HTML/GLB delivery, guest creation, checkpoint completion, idempotent rewards, and recovery after container restart passed. Startup without `DATABASE_URL` was rejected, and no local `.data` directory was created. The local build needed the platform's public interception CA mounted temporarily through BuildKit; TLS verification stayed enabled and the CA was absent from the resulting image. Details are recorded in `evidence/reports/docker-hosting-smoke.json`; they do not establish a Neon account or public deployment. The current Dockerfile assigns runtime artifacts to the `node` user and runs without root, including when source files have restrictive permissions. Its fresh image passed local Compose health, verified TLS/HTTPS, checkpoint, restart, and backup/restore checks; see `evidence/reports/vps-compose-local-smoke.json`.

## Access and cost controls

No Render, Neon, Supabase, Koyeb, or Cloudflare account credential is currently available in the execution environment. Account sign-up and card-verification behavior have not been tested. Keep the selected services on their free plans and do not enable paid upgrades or fallback billing.

For automated provisioning, the missing supported credentials are `RENDER_API_KEY` for `api.render.com` and `NEON_API_KEY` for `console.neon.tech`. Those requirements have been saved to the cloud environment draft without values, alongside permission to verify eventual `*.onrender.com` previews. Existing install/start instructions and unrelated network rules were preserved. The bindings remain unfilled and the draft requires publication; saving it does not apply runtime access or deploy the application.

With pre-created resources, only Render deployment access and its privately configured `DATABASE_URL` are needed. Values belong in secure environment/provider settings, never the repository or chat. The real database URL must be configured in Render rather than declared as an HTTPS proxy secret: PostgreSQL needs the actual connection credentials. Native GitHub access already works, but that authentication does not authorize another hosting provider. Render must separately connect to GitHub and receive access to this private repository. API keys alone do not establish repository access, account eligibility, or deployment success.

### Optional API provisioning

The provider-maintained API references establish the request types; provisioning has not been executed. Once credentials and provider access are usable:

1. Check the intended Neon organization/account is on **Free** and inspect existing projects before creating another. Its REST API uses `https://console.neon.tech/api/v2/`; project creation accepts a `project` object containing fields such as `name`, `region_id`, and `pg_version`. Wait for asynchronous provisioning before obtaining a pooled connection URL. Keep that URL out of logs and configuration files committed to Git.
2. Resolve the Render workspace owner ID and verify its GitHub connection can retrieve the private `main` branch. `POST /v1/services` accepts `type: web_service`, `name`, `ownerId`, `repo`, `branch`, and `serviceDetails`. For this deployment, `serviceDetails` must explicitly select `runtime: node` and `plan: free`; `envSpecificDetails` contains `buildCommand` and `startCommand`, and `healthCheckPath` is `/api/health`. The current schema defaults an omitted plan to a paid compute plan, so omission is unacceptable.
3. Supply the pooled `DATABASE_URL` through Render's private environment-variable API or dashboard, confirm the returned service still has the free plan and no disk, and follow its deployment to a terminal successful state. Then perform the public browser and restart-persistence checks above.

The API outline follows official schemas and is not an untested deployment script. Authentication, account limits, repository authorization, database provisioning, and the final live checks remain separate prerequisites.

Sleeping free services are acceptable for this proof of concept. They are not an availability commitment for future real-time course worlds. Multiplayer rollout needs measured connection counts, message rates, CPU/memory, and provider transport limits before capacity claims are made. Do not use artificial keep-alive traffic to defeat provider inactivity rules.

## Optional single-VPS deployment

`deploy/vps/compose.yaml` runs the existing Node image, PostgreSQL 17, and Caddy on one Linux VPS. This is an optional alternative to the free Render/Neon recommendation; no VPS has been purchased or provisioned. Current advertised VPS and domain prices are summarized below; checkout totals, inventory, and registration availability require confirmation.

Start with **2 GB server RAM** for a bounded proof of concept, with room for the OS and Docker. The configured service limits total approximately 1.4 GB: app 512 MB, PostgreSQL 768 MB, Caddy 128 MB. This is a starting budget, not a concurrency guarantee. The browser still renders the 3D world; the VPS needs no GPU. Building the image can exceed available RAM while services are running: build on another machine and transfer the image, or stop the stack for an on-server build. Runtime memory limits do not constrain the image build.

For an off-server build, `docker compose --file deploy/vps/compose.yaml --env-file .env.vps build app` produces `amamihe-app:local`. Transfer it with `docker save`/`docker load`, then start the VPS stack with `docker compose --file deploy/vps/compose.yaml --env-file .env.vps up -d --no-build`.

Install Docker Engine with Compose v2 and OpenSSL on the chosen host. Point an owned DNS name at its public IP and permit inbound TCP 80/443 for Caddy's automatic HTTPS; UDP 443 is optional for HTTP/3. Preserve SSH administration access when configuring the firewall. The database and application have no published host ports.

Prepare the private configuration from the repository root:

```sh
cp deploy/vps/.env.example .env.vps
chmod 600 .env.vps
chmod 755 deploy/vps/init-db.sh
chmod 644 deploy/vps/Caddyfile
openssl rand -hex 32
openssl rand -hex 32
# Edit .env.vps with the hostname, contact email, and two independent passwords.
sudo VPS_TLS_DIR=deploy/vps/.vps/tls bash scripts/deploy/vps-db-tls.sh
docker compose --file deploy/vps/compose.yaml --env-file .env.vps config --quiet
docker compose --file deploy/vps/compose.yaml --env-file .env.vps up -d --build
docker compose --file deploy/vps/compose.yaml --env-file .env.vps ps
```

The TLS helper creates a private CA and a one-year PostgreSQL server certificate with `postgres` as its verified hostname. The app trusts the mounted public CA through `NODE_EXTRA_CA_CERTS` and uses `sslmode=verify-full`; the existing plaintext restriction remains intact. The official Debian PostgreSQL image's UID 999 owns its private key. PostgreSQL is attached only to an internal database network; Caddy cannot connect to it directly. The app runs as UID 1000 with a read-only filesystem and a writable temporary directory. Caddy exposes HTTPS for the same-origin browser/API session and keeps ACME certificates in persistent named volumes.

Initialization creates an application database owner without superuser, role-creation, or additional-database privileges and rejects plaintext network database connections. Local maintenance uses its Unix socket. Initialization runs only for an empty PostgreSQL volume; editing passwords in `.env.vps` does not rotate an existing database's credentials. Preserve `.env.vps` and `deploy/vps/.vps/tls/` privately and renew the database leaf certificate before expiry. The helper refuses to overwrite existing TLS material. Never use `docker compose down --volumes` to stop a populated deployment: it removes the database and certificate volumes.

Health checks gate database → app → proxy startup, with automatic restart policies and bounded container logs. The PostgreSQL check runs a real query; local proxy hops stay inside the container network. The three-service configuration passed local health, trusted-CA HTTPS, secure-cookie, checkpoint, idempotency, restart, and backup/restore checks. Unknown database CAs, certificate hostname mismatches, and plaintext network connections were rejected. Local browser CA trust was not modified, and browser HTTPS verification was not counted as passed. These checks do not establish a public deployment; validate the actual public HTTPS page and restart recovery before recording a preview URL.

This ingress layout assumes ports 80/443 are available. On a shared host, preserve its existing proxy and services: publish the app on an unused loopback port and route it through the existing HTTPS proxy or an independently configured tunnel. Confirm the host inventory before choosing that integration; the local fixture does not validate coexistence with existing services.

### Database backup and restore

Create a protected logical backup and keep a copy outside the VPS:

```sh
umask 077
mkdir -p backups
backup_file="backups/amamihe-$(date -u +%Y%m%d-%H%M%S).dump"
docker compose --file deploy/vps/compose.yaml --env-file .env.vps exec -T postgres \
  pg_dump -U amamihe -d amamihe --format=custom > "$backup_file"
```

Restore replaces current learner records. Stop the app, restore the selected backup into the initialized database, then restart and verify recovery:

```sh
docker compose --file deploy/vps/compose.yaml --env-file .env.vps stop app
docker compose --file deploy/vps/compose.yaml --env-file .env.vps exec -T postgres \
  pg_restore -U amamihe -d amamihe --clean --if-exists --no-owner --exit-on-error \
  < backups/SELECTED_BACKUP.dump
docker compose --file deploy/vps/compose.yaml --env-file .env.vps start app
```

Database backups do not replace the private environment file, PostgreSQL TLS material, or Caddy certificate volumes. PostgreSQL, Caddy, and Docker security updates and a tested restore procedure remain host-maintenance responsibilities.

## Current deployment evidence

- The local production API responds with `ok: true` and `mock-classifier-v1`.
- GitHub reports a private repository and native Git read access works. The Pages endpoint returns HTTP 403, `Resource not accessible by integration`.
- A fresh Cloudflare quick-tunnel attempt used the verified official `cloudflared` 2026.10.0 release. Provisioning failed because direct DNS was unavailable; the supported HTTPS proxy request returned HTTP 403, `Your request was blocked`.
- No public preview URL has been created or browser-verified. Saved documentation-domain additions do not establish connectivity or deployment.

## Official sources

- Render: [free-tier configuration reference](https://github.com/render-oss/skills/blob/main/skills/render-deploy/references/configuration-guide.md#free-tier-limitations), [persistent disks](https://github.com/render-oss/skills/blob/main/skills/render-disks/references/persistent-disks.md), and [free-service documentation](https://render.com/docs/free).
- Neon: [plan table and Free-plan FAQ](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md), published at [Neon plans](https://neon.com/docs/introduction/plans).
- Provisioning APIs: [Render's generated service schema](https://github.com/render-oss/sdk/blob/main/typescript/src/generated/schema.ts), [Neon REST API setup](https://github.com/neondatabase/website/blob/main/content/docs/reference/api/get-started.md), and [Neon project-creation request examples](https://github.com/neondatabase/website/blob/main/content/docs/reference/migrate-api-client-to-sdk.md).
- Cloudflare: [Pages pricing](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/functions/pricing.mdx), [Pages limits](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/pages/platform/limits.mdx), and [Workers limits](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/workers/platform/limits.mdx).
- Supabase: [current pricing data](https://github.com/supabase/supabase/blob/master/packages/shared-data/plans.ts), [billing quotas](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/platform/billing-on-supabase.mdx), [compute](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/platform/compute-and-disk.mdx), and [pausing](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/platform/free-project-pausing.mdx).
- GitHub: [Pages limits](https://github.com/github/docs/blob/main/content/pages/getting-started-with-github-pages/github-pages-limits.md) and [plan availability](https://github.com/github/docs/blob/main/data/reusables/gated-features/pages.md).
- Hugging Face: [live Spaces overview](https://huggingface.co/docs/hub/spaces-overview) and [provider-maintained source](https://github.com/huggingface/hub-docs/blob/main/docs/hub/spaces-overview.md).
- Classification and training: [OpenRouter free-model limits](https://openrouter.ai/docs/api/reference/limits.md), [model catalogue](https://openrouter.ai/api/v1/models), [Google Colab repository](https://github.com/googlecolab/colabtools), and [Kaggle notebook repository](https://github.com/Kaggle/docker-python).

## Optional VPS and domain pricing

Advertised prices observed on **9 October 2026**. These options supplement the free hosting baseline; procurement and deployment remain separate steps. Inventory, account eligibility, regional taxes, and final checkout totals have not been verified.

| VPS                                                           | Advertised USD price                          | Resources and terms                                                                                                                                           |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OVHcloud VPS-1](https://www.ovhcloud.com/en/vps/)            | From **$4.54/month**, excluding tax           | 2 vCores, 4 GB RAM, 40 GB NVMe; daily backup included. The commitment needed for the starting price was not established from the public page.                 |
| [IONOS VPS S+](https://www.ionos.com/servers/vps)             | **$2/month for three months**                 | 1 vCore, 2 GB RAM, 60 GB NVMe; one-year term and no setup fee advertised. The remaining-term and renewal rates need confirmation; $2 is an introductory rate. |
| [Hetzner CX23](https://www.hetzner.com/cloud/cost-optimized/) | **$7.09/month with primary IPv4**, before tax | Current public pricing lists $6.49 for the server plus $0.60 for IPv4. This exceeds a $6.50 monthly budget.                                                   |

Hetzner values come from its [public price data](https://www.hetzner.com/_resources/app/data/app/live_data_prices.json), using `CLOUD_132` and `CLOUD_21`. Server inventory and provisioning were not tested. The VPS runs the API, database, and HTTPS proxy; the learner's browser renders the 3D world.

### Domain options below $2.50 for the first year

| Non-premium extension | Registrar | First year, USD | Annual renewal, USD |
| --------------------- | --------- | --------------: | ------------------: |
| `.online`             | Spaceship |       **$1.18** |              $15.28 |
| `.click`              | Spaceship |       **$1.24** |              $10.55 |
| `.top`                | Porkbun   |       **$1.63** |               $4.63 |
| `.xyz`                | Porkbun   |       **$2.04** |              $14.21 |

[Spaceship's price table](https://www.spaceship.com/domains/) lists a separate $0.20 annual ICANN fee; the totals above include it. [Porkbun's prices](https://porkbun.com/products/domains), corroborated by its [public pricing API](https://api.porkbun.com/api/json/v3/pricing/get), include ICANN and other listed fees. Both advertise free domain privacy. These are standard one-year promotional registration prices; premium names and checkout conditions can differ.

The authoritative [`.xyz` RDAP lookup](https://rdap.centralnic.com/xyz/domain/amamihe.xyz) returned “Object not found” for `amamihe.xyz`. This suggests no current registration but does not establish standard-price checkout availability. Exact `amamihe.click`, `amamihe.top`, and `amamihe.online` availability remains unverified because their authoritative RDAP hosts are not accessible from this runtime.

### Free service subdomains

[DuckDNS](https://www.duckdns.org/about.jsp) provides free `duckdns.org` subdomains pointing to a chosen IP, suitable for a VPS. `amamihe.duckdns.org` would require an account and an available label; neither registration nor label availability has been verified. This is a service subdomain, not a separately owned domain. Render's `onrender.com` and Cloudflare Pages' `pages.dev` hostnames also avoid domain purchases. Exact hostname allocation occurs during provider setup.
