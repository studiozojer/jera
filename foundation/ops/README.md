# Jera Snapback operations

`https://snapback.jera.ink` serves Snapback 0.4.33 on the existing Jera PDS VPS. Stjerneborg is the selected operator host. Snapback password accounts are separate from ATproto accounts.

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

Copy this directory's files (excluding dependencies and Python caches) to `/opt/jera-snapback/`, and `../snapback/schema.q` to `/opt/jera-snapback/snapback/schema.q`. Never copy development stores or credentials.

Before an update, run `systemctl start jera-snapback-backup.service`. Then:

```sh
bash /opt/jera-snapback/install-vps.sh
python3 /opt/jera-snapback/install-proxy.py
```

The installer checks the schema against existing data before adoption, briefly stops only Snapback, and restarts it. PrivateTmp isolates the service's adoption socket, so deployment uses a stopped store. A maintenance lock prevents backup and deployment from racing. No destructive schema flags are used. Failed adoption restarts the previous service; review the error before retrying.

```sh
curl --fail https://snapback.jera.ink/auth/config
systemctl status jera-snapback jera-snapback-backup.timer
journalctl -u jera-snapback -n 50 --no-pager
```

## Backup and recovery

`backup.sh` stops Snapback briefly, archives the **whole deployment directory**, writes a SHA-256 checksum, and restarts the service even if archiving fails. This is the pinned server's documented backup method. The PDS is never stopped. Archives contain private application data and authentication state. A same-VPS backup cannot survive loss of the VPS; scheduled off-host backups to Stjerneborg remain pending connectivity and setup.

The smoke probe creates a labelled synthetic account/module and keeps its credentials at `/root/jera-snapback-probe.json` (0600). It never prints tokens.

```sh
python3 /opt/jera-snapback/smoke.py https://snapback.jera.ink /root/jera-snapback-probe.json
systemctl start jera-snapback-backup.service
python3 /opt/jera-snapback/restore-check.py
```

The restore check verifies the checksum, extracts the newest snapshot into a temporary directory, and starts a separate server at `127.0.0.1:4418`. It verifies login, the Unicode source artifact, queued task, unauthenticated refusal and disabled dev reset, then removes the test instance. It never overwrites live data.

For actual recovery: stop Snapback, preserve the damaged deployment under a timestamped name, verify and extract the chosen archive separately, set ownership to `jera-snapback`, and validate it using the pinned engine before selecting it as the live deployment. Restart and verify HTTPS and authenticated data. Restore the whole deployment, not a live copy of `store.sqlite`. Recovery discards writes after the chosen snapshot; choose that point explicitly.

## Operator handoff

Use `JERA_ORIGIN=https://snapback.jera.ink` and a dedicated account with write membership in the modules it organizes. Store its session privately on Stjerneborg. Poll and paginate `tasksList`, claim work, preserve the source, then complete or release it using the existing client. Claims expire after five minutes; long-running coding jobs need a separate contract.

No model credentials, worker, scheduler or automatic GitHub publishing is installed by this deployment. A human can use the app and a local coding harness can query the API independently of Stjerneborg.
