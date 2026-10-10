# Live Contabo deployment

Game: https://amamihe.online. The app and PostgreSQL run in the isolated `amamihe` Compose project. The app binds only `127.0.0.1:13001`; the database publishes no host port. Existing Caddy serves this hostname with DNS-validated automatic certificates. Cloudflare proxies the apex A record, uses Full (Strict), and redirects HTTP to HTTPS. Caddy adds HSTS; direct-origin HTTP receives the existing terminal HTTPS-required response.

Installation: `/home/agents/amamihe-deploy/{bin,source,releases,shared}`. The shared directory is outside Git, mode 0700. Database credentials, the private PostgreSQL CA, and a read-only GitHub SSH deploy key stay there. The existing Cloudflare credential stays in its original private Caddy environment file. No production secret is required in GitHub Actions.

## Verified accounts and email

Players must verify their email before entering the game. Signup collects name, email, password (12–128 characters), and outfit. Login supports either a password or a one-time email code; account settings allow password changes and sign-out. Passwords use salted scrypt hashes; session tokens are hashed in storage. Six-digit codes expire after ten minutes, are HMAC-protected in storage, allow five attempts, and can be used once. Email requests have a one-minute cooldown and a five-per-hour limit per address and purpose. Password changes revoke other sessions.

`shared/email.json` is a private, mode-0600 file mounted read-only into the app. It contains `provider`, `apiKey`, `inbox`, and a randomly generated `codeSecret` of at least 32 characters. The configured provider is `agentmail`, and the sender inbox is `amamihe@agentmail.to`. Keep this file and secret unchanged across ordinary releases so pending codes continue to work. It must never enter Git, build contexts, release archives, or browser variables. The `EmailProvider.send()` contract in `server/email.ts` separates authentication from the provider implementation; another provider can be added through that factory without changing account logic.

The additive account migration preserves the existing players, attempts, chunks, and points. An old guest cookie no longer authorizes gameplay. If that browser signs up and verifies its email, its existing player is linked to the account and progress is retained. Signing in on another device restores the same account's progress. Unknown or already-registered email requests receive a generic response; they never create an unverified session.

For local browser tests, start the API with `EMAIL_PROVIDER=test` and a private `EMAIL_TEST_OUTBOX`, then run Playwright with the same outbox path. Tests read codes from that filesystem directory; no HTTP endpoint exposes them. The test provider is forbidden in production. Production starts only with valid private email configuration. Take a private database backup before promoting the account migration.

## Pipeline

Pushes to `main` run formatting, build, Node tests, browser tests, and immutable release packaging. Only after those jobs succeed does Actions update `deploy/verified-main` to that commit. A user systemd timer on the VPS polls this reference every five minutes and confirms it still matches current `main`. It uses the read-only key, pinned GitHub SSH host keys, and the separately reviewed host deployment helper.

To trigger deployment manually, open [GitHub Actions → Deploy Amamihe](https://github.com/Nolwac/amamihe/actions/workflows/checks.yml), click **Run workflow**, select **main**, and click **Run workflow** again. The workflow runs all checks before approving the commit. The VPS picks up a newly approved commit within approximately five minutes, then builds and promotes it. Selecting another branch runs checks but does not approve a production deployment. If the approved commit is already deployed, the VPS keeps the current release without rebuilding it.

The equivalent CLI command is `gh workflow run checks.yml --repo Nolwac/amamihe --ref main`. GitHub's green workflow result confirms validation and deployment approval; the actual VPS promotion result is recorded in `journalctl --user -u amamihe-deploy.service`, and the public game is https://amamihe.online.

The VPS builds the verified source in a dedicated BuildKit builder capped at 2 GiB, 1.5 CPUs, and two concurrent operations. It packages an immutable release, validates its checksums and image metadata, then promotes only the app. The persistent database is not recreated during promotion. App failures restore the previous app image. Public health is checked after promotion. Changes to the trusted host scripts require a deliberate host installation; Git updates do not replace those scripts automatically.

Installed user units are `amamihe-deploy.service` and `amamihe-deploy.timer`; user lingering is enabled. Inspect with `systemctl --user status amamihe-deploy.timer` and `journalctl --user -u amamihe-deploy.service`. For a deliberate rollback, stop only this timer, then use the previous release and manifest hash recorded in private `shared/releases.json` with `bin/deploy-release.sh --rollback`. Leave the timer stopped until main contains the intended version.

## Operations

Preserve all unrelated services and the shared proxy. Caddy changes must preserve its other host blocks, validate before a graceful reload, and retain a backup. No new ingress firewall rules are needed because the existing public HTTPS listener already accepts Cloudflare traffic. Do not expose the app or PostgreSQL ports.

The PostgreSQL server certificate expires one year after issuance; renew it before October 10, 2027. Use private logical backups and test restoration into a separate database. Monitor host disk space: the VPS had about 29 GiB free before installation. Immutable releases accumulate, so prune only Amamihe build cache and obsolete releases after retaining the current and rollback release and their backups.

This deployment publishes the existing foundation prototype, including its clearly labeled mock classifier. It does not establish completed OpenRouter integration, final artwork acceptance, or physical low-memory-device performance.
