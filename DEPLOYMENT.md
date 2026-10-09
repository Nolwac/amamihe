# Shared VPS Deployment

For the Contabo host and `amamihe.online`, use the [dedicated tunnel and host-side polling installation](deploy/contabo/README.md). Those templates extend this release system without reserving public ports or sharing VPS credentials with GitHub. Installation and public verification remain pending until host access is available.

The shared-host pipeline delivers an immutable application image to an existing Linux VPS while preserving its current services. PostgreSQL persists in a dedicated Docker volume; only the application publishes a port, bound to `127.0.0.1`. The pipeline does not change DNS, the public web server, firewall rules, SSH, or other Compose projects.

## Inventory Before Installation

Record the existing containers, volumes, listeners, reverse proxy, available memory/disk, and backup arrangements before choosing the installation directory or port. The reserved Compose project is `amamihe`, with the marker `io.amamihe.deployment=shared-vps-v1`. A conflicting project, container, network, or volume causes deployment to stop; existing resources are never adopted or removed.

Use a currently unused loopback port between 1024 and 65535. There is no default port and no binding to public ports 80 or 443. The first deployment checks the selected port before starting services. The application and database have respective memory limits of 512 MiB and 768 MiB; the VPS must have additional capacity for its existing workloads and Docker.

Install Bash, Python 3.9+, GNU coreutils, `flock`, `curl`, OpenSSL, Docker Engine, and Docker Compose with `up --wait` support. The script uses the local rootful daemon at `/var/run/docker.sock`; remote Docker contexts are ignored. Grant daemon access through the host's existing administration policy. Do not change SSH authentication or host-key verification to enable deployment.

## Private Host Configuration

Keep immutable releases and private shared state separate, outside Git checkouts:

```text
/srv/amamihe/
  releases/<commit>/     # Reviewed image archive and public runtime files
  shared/               # Private directory, mode 0700
    deployment.env      # Private configuration, mode 0600
    tls/                # Private PostgreSQL CA and server certificate/key
    init-db.sh          # Stable initializer installed during bootstrap
    releases.json       # Current/previous release and verification state
    deploy.lock
```

Adapt the base path after inventory, using only letters, digits, slash, dot, dash, or underscore. Copy `.env.shared.example` into the private shared directory, select the unused port, pin an approved official `postgres:17-bookworm@sha256:<digest>` image, and generate two independent passwords with `openssl rand -hex 32`. Enter values in the private file without printing them in logs. The file accepts exactly the documented literal `KEY=value` settings; it is validated as data and never sourced as shell code.

Generate PostgreSQL TLS material outside releases using the reviewed `scripts/vps-db-tls.sh` helper, setting `VPS_TLS_DIR` to the private TLS directory. It requires host administration privileges to give `server.key` to PostgreSQL container UID 999. The certificate must validate against `ca.crt`, include the DNS name `postgres`, and remain valid for at least another day. Keep the CA private key on the host or in an approved private backup. The application mounts only the public CA certificate and verifies PostgreSQL's certificate and hostname.

Pull or preload the approved PostgreSQL digest separately before the first deployment. PostgreSQL has no published host port. Its initial application role cannot administer the server or create roles/databases. Back up the database and private configuration before future upgrades; deployment never restores, deletes, or reinitializes an existing database.

## Build and Transfer a Release

The GitHub Actions verification workflow builds an image after successful checks on pushes to `main`, packages the release, and uploads a release artifact to the private repository. It does not connect to the VPS. Once installed, the Contabo host-side timer downloads successful main artifacts over authenticated GitHub transport and promotes them using the reviewed host helper. Alternatively, download the artifact through an authenticated GitHub session and preserve its manifest digest from the trusted workflow output.

For a manual build, use the repository Dockerfile and a committed revision. Managed-cloud Docker builds must use the environment's documented proxy and CA trust configuration. Package an already-built local image:

```bash
bash scripts/build-release.sh \
  --image amamihe:release \
  --output /tmp/amamihe-release \
  --commit "$(git rev-parse HEAD)"
```

The output directory must be new and outside the checkout. The builder saves an immutable image ID, copies a fixed allowlist of public deployment files, and writes a versioned manifest containing their SHA256 hashes. It excludes private environment files, database data, TLS material, and workspace memory. The supplied image must independently have trusted provenance and contain no embedded secrets; hashing cannot establish that. The CI path builds from the controlled Dockerfile rather than accepting an arbitrary external image.

Record the printed **manifest SHA256** through a trusted channel. `SHA256SUMS` is a convenience check; the pinned manifest authenticates the archive and every public runtime file. Transfer the immutable directory to its approved host release path using the existing SSH account and verified host key. Keep SSH destinations and credential paths in private operator configuration.

## Promote and Verify

Run the deployment script from a trusted, reviewed checkout or bootstrap installation. Before using the bundled script instead, verify the manifest against the trusted digest and that script against its manifest entry; executing an unverified script cannot establish its own integrity.

```bash
bash scripts/deploy-release.sh \
  --release /srv/amamihe/releases/<commit> \
  --shared-config /srv/amamihe/shared/deployment.env \
  --manifest-sha256 <trusted-manifest-sha256>
```

The same command can be invoked over the authorized SSH connection. A host-local `flock` serializes deployments. Validation rejects modified release files, changed private configuration, foreign project resources, mismatched image platforms, and mutable image tags in the archive. Bootstrap creates only the isolated database and application. Subsequent promotions replace only the application container; they do not restart PostgreSQL.

A successful command confirms `/api/health` through the configured loopback port and records PostgreSQL-backed health. Public verification remains pending. Inspect the existing proxy, firewall, private virtual hosts, and any tunnel before choosing a public ingress route; do not expose all existing services by opening a shared listener. Add only an `amamihe.online` virtual host or hostname-scoped tunnel route through the normal reviewed configuration process, forwarding to the selected loopback port and preserving `Host`, `X-Forwarded-Proto`, and WebSocket upgrades. Test the complete proxy configuration before its normal reload.

The public application must use HTTPS with a browser-trusted, hostname-valid certificate. Redirect HTTP to HTTPS or refuse HTTP, preserve secure session cookies, and enable HSTS after verifying TLS. Configure DNS and browser HTTPS separately without replacing unrelated hosts, changing private routes, or publishing the application/database ports directly.

Verify the public browser journey, secure cookies, course enrollment, progress submission, and persistence after application restart before announcing a working deployment. Loopback health and CI success do not establish public reachability.

## Rollback and Maintenance

If application startup, health verification, or state recording fails after promotion begins, the script restores only the prior application image. A failed first deployment stops its application and preserves its database for diagnosis. PostgreSQL volumes, images, backups, and unrelated services are never pruned or deleted.

For an intentional application rollback, supply the previous release directory and its trusted manifest digest to the same command with `--rollback`. Keep both current and previous release archives available. The shared initialization script remains independent of release retention, so PostgreSQL restart does not depend on the first release directory.

The current release format accepts schema version 1. Database schema upgrades, password rotation, port changes, certificate renewal, and backup restoration require separate reviewed maintenance; changing private configuration causes ordinary promotion to stop. An image rollback cannot reverse a destructive schema change. The optional Contabo poller keeps its read-only GitHub credential on the VPS; no registry credential, SSH secret, or Tailscale credential is needed in GitHub.
