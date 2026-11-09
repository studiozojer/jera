# Jera Snapback operations

`https://snapback.jera.ink` serves Snapback 0.4.33 on the current app host at `91.98.204.141` (confirmed from the live endpoint and existing service on 2026-11-05). The earlier PDS-host address is stale. Stjerneborg is the selected operator host. ATproto OAuth supplies verified DID identities; password and guest signup are disabled.

| Item | Location |
| --- | --- |
| Application/runtime | `/opt/jera-snapback` |
| Live deployment and SQLite store | `/var/lib/jera-snapback/deployment` |
| Service | `jera-snapback.service`, user `jera-snapback` |
| Listen address | `127.0.0.1:4417` |
| HTTPS route | `/etc/caddy/jera-snapback.caddy` |
| Nightly backup | `jera-snapback-backup.timer`, 04:20 UTC plus up to five minutes |
| Backup directory | `/var/backups/jera-snapback`, 14-day retention |

The service restarts after failure and starts at boot. It has an isolated writable data directory and a 1 GiB memory limit. Node 24.11.0 is installed privately under `runtime/`, with its official archive checksum checked; other services' runtimes stay separate. The lockfile pins the server and patches its JavaScript HTTP dependency through an override. Development doors are disabled.

Caddy needs `tls force_automate` for this hostname because the PDS has an on-demand `*.jera.ink` certificate policy. Without it, the TLS handshake fails. See [Caddy's TLS directive](https://caddyserver.com/docs/caddyfile/directives/tls). `install-proxy.py` uses the running service's loopback admin API, checks Snapback and PDS HTTPS, and restores the previous files/configuration on failure. Provider secrets stay in Caddy's environment.

## Deploy

For the structured-post release, use `install-release.sh <staged-repository-directory>` with `EXPECTED_SCHEMA_SHA256` set to the inspected live schema hash. Stage `auth/` (without dependencies or local state), `contracts/`, `scripts/`, `snapback/schema.q` and `ops/` together. The auth service now imports the contract registry and client helpers outside `auth/`; copying only that directory is incomplete. The installer installs locked auth dependencies in staging, checks imports and schema compatibility, makes a fresh production backup, and proves adoption on a disposable on-host restoration before changing live services. It preserves previous source and restores it if service activation fails. An already-adopted additive schema is retained; rollback never restores an older data snapshot over new writes. Review a failure before retrying.

The previous `install-auth.sh` procedure below remains the initial provisioning path. Use the release installer for subsequent application updates.

Copy this directory's files (excluding dependencies and Python caches) to `/opt/jera-snapback/`, and `../snapback/schema.q` to `/opt/jera-snapback/snapback/schema.q`. Never copy development stores or credentials.

Before an update, run `systemctl start jera-snapback-backup.service`. Then:

```sh
bash /opt/jera-snapback/install-auth.sh
```

The installer checks the schema against existing data before adoption, briefly stops only Snapback, and restarts it. PrivateTmp isolates the service's adoption socket, so deployment uses a stopped store. A maintenance lock prevents backup and deployment from racing. No destructive schema flags are used. Failed adoption restarts the previous service; review the error before retrying.

```sh
curl --fail https://snapback.jera.ink/auth/config
systemctl status jera-snapback jera-snapback-backup.timer
journalctl -u jera-snapback -n 50 --no-pager
```

For schema-only changes, stage the schema outside `snapback/` as `/opt/jera-snapback/schema-incoming.q`, copy `install-schema.sh`, then run it with `EXPECTED_SCHEMA_SHA256` set to the inspected current schema hash. It backs up first, takes the maintenance lock, checks compatibility, briefly stops only Snapback for non-destructive adoption, and restores the previous schema source if adoption fails. It does not reinstall auth dependencies or rotate login credentials. Do not use destructive migration flags.

## Backup and recovery

`backup.sh` stops Snapback briefly, archives the **whole deployment and auth directories**, including the signing key and OAuth state, writes a SHA-256 checksum, and restarts the service even if archiving fails. This is the pinned server's documented backup method. The PDS is never stopped. Archives contain private application data and authentication state. A same-VPS backup cannot survive loss of the VPS; scheduled off-host backups to Stjerneborg remain pending connectivity and setup.

The old password probe is retired. Existing synthetic records and its private state file remain preserved. The current restore check uses a trusted fixture DID only inside its disposable restored deployment; actual OAuth requires interactive account authorization.

```sh
systemctl start jera-snapback-backup.service
python3 /opt/jera-snapback/restore-check.py
```

The restore check verifies the checksum, extracts the newest snapshot into a temporary directory, and starts a separate server at `127.0.0.1:4418`. It verifies trusted-session DID ownership and Unicode capture in that restored store, then removes the test instance. It does not claim to verify real OAuth. It never overwrites live data.

For actual recovery: stop Snapback, preserve the damaged deployment under a timestamped name, verify and extract the chosen archive separately, set ownership to `jera-snapback`, and validate it using the pinned engine before selecting it as the live deployment. Restart and verify HTTPS and authenticated data. Restore the whole deployment, not a live copy of `store.sqlite`. Recovery discards writes after the chosen snapshot; choose that point explicitly.

## Operator handoff

Use `JERA_ORIGIN=https://snapback.jera.ink` and a dedicated account with write membership in the modules it organizes. Store its session privately on Stjerneborg. Poll and paginate `tasksList`, claim work, preserve the source, then complete or release it using the existing client. Claims expire after five minutes; long-running coding jobs need a separate contract.

No model credentials, worker, scheduler or automatic GitHub publishing is installed by this deployment. A human can use the app and a local coding harness can query the API independently of Stjerneborg.

## ATproto identity service

Copy `../auth/` (excluding node_modules and local data) to `/opt/jera-snapback/auth/` alongside the ops files. `install-auth.sh` is the update path after initial runtime provisioning. It preserves records, disables password/guest signup, retires legacy sessions, and keeps minting authority on loopback. See [the identity service](../auth/README.md) for callback/session custody, evidence and revocation timing. Backups stop both services before copying their state and restart both afterward. Restore both directories together; restore-check.py verifies storage in isolation, without contacting a real OAuth provider.

## Root-domain web release

`web.caddy` serves compiled artifacts at `https://jera.ink`, redirects `www.jera.ink` to the root, and exposes a loopback-only check at port 4421. The auth unit allowlists `https://jera.ink/.exact/auth/callback` alongside the existing phone and local-live callbacks. The API stays at `https://snapback.jera.ink`; the web client uses the same verified DID and authoritative store as the phone. Public posts remain readable by signed-in Jera accounts; hosting the UI publicly does not change record permissions.

From `app`, build with Bun 1.4.2, `EXACT_BACKEND_ORIGIN=https://snapback.jera.ink` and `EXACT_WEB_DIST` pointing at an isolated artifact directory. The separate output prevents replacing a running local preview's bundle. Then run `node ../scripts/package-web.mjs <build-output> <new-public-directory>`: it checks the build receipt, hashes and production binding, copies the public inventory and OAuth callback, and excludes Exact's `.gen` source/build scratch. Copy only this packaged public directory into `/opt/jera-web/releases/<full-source-sha>/`. Never serve the raw build directory, source checkout, credentials, fixtures, database or dependencies. Set directories to 0755 and files to 0644. Run `python3 <staged-repository>/ops/install-web.py <full-source-sha>` to atomically select it and install the Caddy import. The installer rolls back the web symlink and Caddy configuration if local checks fail. Releases remain on disk for rollback.

The extensionless OAuth callback is explicitly served as `text/html`. Release assets use `Cache-Control: no-store` while filenames are not consistently content-addressed. No Caddy access log is enabled for the callback's one-time handoff parameters. Verify the sign-in page in a fresh browser, callback script execution, origin preflight and unauthorized record refusal. Real account consent and the authenticated posting journey remain distinct acceptance checks.

DNS cutover: replace Squarespace's root `@` A records with `91.98.204.141`, remove any root AAAA record unless it points to a verified address on this host, and point `www` at `jera.ink`. Preserve MX/TXT and all PDS, handle and Snapback records. Once DNS resolves here, Caddy obtains HTTPS certificates. Verify the public root, callback MIME type, API health and PDS health after propagation. The previous Squarespace root A values were `198.49.23.144`, `198.49.23.145`, `198.185.159.144`, `198.185.159.145`; restoring those redirects website traffic back but does not roll back backend writes.

The app's own `auth.callback https://jera.ink/.exact/auth/callback` grant is required as well as the server allowlist. Loopback previews admit their callback differently and cannot prove this production-origin boundary. Run `bun tests/hosted-signin.browser.mjs` from `` to exercise the root-domain page, production CORS/refusal, executable callback and real provider discovery/PAR without entering credentials. Before DNS cutover, `JERA_WEB_ARTIFACT_ORIGIN=http://127.0.0.1:<ssh-forward-port>` substitutes only root-domain asset transport with the deployed Caddy server. This is not proof of public DNS/TLS or completed user authorization.
