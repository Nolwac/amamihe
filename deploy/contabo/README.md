# Contabo deployment for amamihe.online

These are installation templates, not evidence of an installed deployment. Inventory the VPS through its existing Tailscale SSH access before applying them. Reuse the shared-VPS release system in [DEPLOYMENT.md](../../DEPLOYMENT.md); do not run the root `compose.yaml`, which reserves public ports.

## Host inventory and bootstrap

Inspect `ss -ltnup`, `docker ps`, `docker compose ls`, active systemd services, available RAM/disk, existing Cloudflare tunnels and reverse proxies, and the host's firewall. Do not print environment files, full process arguments, Docker inspection environments, or full systemd unit definitions: existing services may carry credentials there. Do not stop or recreate unrelated services. Select an unused app loopback port and confirm at least 1.3 GiB of additional memory plus deployment headroom.

Prepare `/srv/amamihe/{bin,releases,shared}` with the existing authorized host administrator. Give `agents` access, keep `shared` mode 0700, and install reviewed copies of `scripts/pull-deploy.sh` and `scripts/deploy-release.sh` under `bin` with mode 0500. Follow the existing documentation to create private `deployment.env`, PostgreSQL TLS, a digest-pinned PostgreSQL image and the initial deployment. The service templates assume `/srv/amamihe`, `agents:agents`, a rootful Docker daemon, and an existing Docker access grant; adapt these only after inspection.

## Pull deployment pipeline

GitHub checks the source and browser journeys, builds an image from a successful push to `main`, and uploads the immutable `amamihe-release-<commit>` artifact. The VPS timer polls successful `checks.yml` push runs on `main`, downloads the authenticated artifact, compares its commit to the workflow, and calls the separately installed trusted deployment helper. GitHub needs no VPS SSH credential, Cloudflare token, Tailscale key, or production database password.

For this private repository, supply a fine-grained GitHub token with only **Actions: read** and repository metadata access for `Nolwac/amamihe`. Authenticate `gh` privately on the VPS using `GH_CONFIG_DIR=/srv/amamihe/shared/github`; pipe the credential to `gh auth login --with-token`, never place it in a command argument or shell history. Restrict the configuration directory to 0700 and credential file to 0600. Do not copy the cloud environment's authentication or install a broad personal token. The token must last long enough for unattended reads; document its renewal privately.

Review and install the timer/service into `/etc/systemd/system`, reload systemd, run `amamihe-deploy.service` once, and verify its result before enabling `amamihe-deploy.timer`. The pipeline accepts artifacts produced by repository maintainers: protect `main` and restrict workflow modification accordingly. Host tools are upgraded separately after review. No downloaded deployment script is executed. A new failed release can be retried at the next interval; disabling the timer is appropriate while diagnosing repeated failures. Artifacts expire after seven days, so keep promoted releases on the VPS. No automatic pruning occurs.

For a deliberate rollback, stop **only** `amamihe-deploy.timer`, then use the recorded previous release and manifest digest with `deploy-release.sh --rollback`. Leave the timer disabled until the desired main release is available; otherwise polling will promote the newest successful main artifact again.

## Public HTTPS through a dedicated Cloudflare Tunnel

Use the existing Cloudflare API credential **only on the VPS**, reading its named variable programmatically without printing its value. First verify its permissions and inspect the `amamihe.online` zone, DNS records, SSL/HTTPS settings, and existing account tunnels. Do not change another tunnel, another hostname, or overwrite a conflicting DNS record without understanding its current use.

Create a dedicated remotely managed tunnel named `amamihe`, with precisely these ingress rules:

```json
{
  "ingress": [
    {
      "hostname": "amamihe.online",
      "service": "http://127.0.0.1:<inspected-unused-app-port>"
    },
    { "service": "http_status:404" }
  ]
}
```

Create the hostname's proxied CNAME pointing to `<tunnel-id>.cfargotunnel.com`. Store its connector token directly in `/srv/amamihe/shared/cloudflared-token`, mode 0600; install the dedicated tunnel service only after checking the actual cloudflared executable supports `--token-file`. Never pass this token as a command-line argument. The connector uses outbound connections; public ingress firewall changes and public app/database ports are unnecessary. Existing port 80 and existing tunnels remain untouched. If the API credential lacks Tunnel/zone permissions, a narrowly scoped replacement must be supplied privately before provisioning.

Require Cloudflare Universal SSL to be active for the exact hostname. Set **Always Use HTTPS** on the `amamihe.online` zone and enable HSTS only after HTTPS succeeds. Do not switch an unrelated zone's SSL mode. Browser TLS terminates at Cloudflare; Cloudflare Tunnel encrypts traffic to the VPS connector, whose final HTTP hop is loopback. The database has independently verified TLS. Keep the original hostname forwarded to the app for its same-origin checks and verify that the edge sets `X-Forwarded-Proto: https`.

## Acceptance checks

Compare the existing service/listener inventory before and after installation. Confirm the dedicated connector is healthy, HTTPS certificate verification succeeds, `/api/health` reports PostgreSQL, HTTP redirects to HTTPS, and HSTS is present. Confirm app and database ports are inaccessible directly from the Internet. In a real browser, create a learner, check the Secure/HttpOnly cookie, finish a course checkpoint, refresh, and verify recovery after an app-only restart. Check timer deployment and application rollback with persistent progress. Do not announce a live deployment until these checks pass.
