# Development Reference

## Project overview

A self-hosted web dashboard for managing system updates across Linux servers and Docker Compose stacks. Users add servers/Docker hosts (with SSH credentials), organize them into groups, trigger updates manually or on a schedule, and view results in a live log stream.

Built with: Node.js + Express, SQLite, vanilla JS + Tailwind CSS, Docker.

---

## Directory layout

```
/opt/docker/homelab-updater/
├── server.js                  # Entry point — mounts routers, runs migrations, starts scheduler
├── db/index.js                # SQLite connection, promise wrappers, migration runner
├── utils/crypto.js            # AES-256-GCM encrypt/decrypt (passwords stored encrypted)
├── services/
│   ├── ssh.js                 # SSH connection factory + sudo exec helper
│   ├── update.js              # Runs apt/dnf/yum update over SSH; writes update_logs
│   ├── docker.js              # Runs docker compose pull/up over SSH; writes update_logs
│   └── scheduler.js           # node-cron loop (every minute) checking auto-update intervals
├── routes/
│   ├── servers.js             # CRUD + SSE update stream for servers
│   ├── groups.js              # CRUD for server groups + group update trigger
│   ├── docker.js              # CRUD for docker hosts, projects, docker groups + update trigger
│   ├── credentials.js         # CRUD for credential vault
│   ├── logs.js                # Query update_logs with filters
│   └── dashboard.js           # Summary stats + next scheduled update info
├── public/
│   ├── index.html             # Single-page app shell (all tabs in one file)
│   ├── script.js              # All frontend logic (~2000 lines, no framework)
│   └── style.css / style-tailwind.css
├── data/                      # Bind-mounted: servers.db + encryption.key (back these up)
├── ssh-keys/                  # Bind-mounted: uploaded SSH private key files
└── logs/                      # Bind-mounted: application logs
```

---

## Database schema

Managed by `db/index.js` via a simple migration runner. Add new migrations to the `MIGRATIONS` array with a unique integer `id`. Migrations run once on startup; `ALTER TABLE` failures on "duplicate column" are silently ignored (idempotent).

**Tables:**

| Table | Purpose |
|-------|---------|
| `servers` | Linux servers to update |
| `server_groups` | Groups of servers sharing an auto-update schedule |
| `docker_hosts` | Hosts running Docker Compose |
| `docker_compose_projects` | Individual compose projects per host |
| `docker_groups` | Groups of docker hosts sharing an auto-update schedule |
| `update_logs` | Record of every update run (manual + automatic) |
| `credentials` | Credential vault: reusable SSH keys or passwords |
| `webhooks` | Discord webhook endpoints for update notifications |
| `schema_migrations` | Tracks which migrations have been applied |

**Credential vault pattern:** `servers.credential_id` and `docker_hosts.credential_id` are nullable FKs to `credentials`. When set, `services/ssh.js` resolves auth from the vault at connect time. When null, the server/host row holds its own `password_hash` / `ssh_key_path`.

---

## Encryption

`utils/crypto.js` — AES-256-GCM. The key is auto-generated on first run and stored in `data/encryption.key`. Format stored in DB: `aes:<base64(iv[12] + tag[16] + ciphertext)>`. Legacy plain-base64 values (pre-encryption) are still readable and will be re-encrypted on next save.

The key file must be preserved across container recreates — it lives in the `./data/` bind mount.

---

## SSH connection flow

`services/ssh.js:connectToServer(server)`

1. If `server.credential_id` is set, fetch the credential from DB and overlay `username`, `auth_type`, `password_hash`, `ssh_key_path` onto the server object.
2. Build `node-ssh` config with explicit algorithm lists (ensures compatibility with older servers).
3. Decrypt password with `decrypt()` or read the key file from disk.
4. Encrypted SSH key files are explicitly rejected with a clear error message.

`makeSudoExec(ssh, sudoPasswordHash)` returns a `sudoExec(command)` helper that feeds the sudo password via stdin (`sudo -S`), avoiding shell injection.

---

## Auto-update scheduler

`services/scheduler.js` — `cron.schedule('* * * * *', ..., { timezone: 'Europe/Amsterdam' })`

Runs every minute and checks three queues independently:
1. **Server groups** — checks `isUpdateDue()` against `MAX(last_update)` of group members
2. **Individual servers** (no group, `auto_update=1`) — hardcoded 1-week interval
3. **Docker groups** — same `isUpdateDue()` logic as server groups

`isUpdateDue(startDate, interval, intervalUnit, lastUpdate)` — returns true if `now - lastUpdate >= intervalMs`, or if there has never been an update and `now >= startDate`.

**Timezone note:** The Alpine base image has no timezone data — `TZ=Europe/Amsterdam` in docker-compose.yml has no effect without `apk add tzdata` in the Dockerfile. Both are already in place.

---

## SSE (live update streaming)

Server-side:
- `GET /api/servers/:id/update-stream` — opens an SSE connection, stores `res` in `serverSessions` map
- `POST /api/servers/:id/update` — triggers update, calls `emit(progress)` which writes to the stored `res`

`services/update.js` and `services/docker.js` accept an optional `emit` callback and call it with `{ stage, message }` objects throughout the update process.

Group updates use a separate `groupSessions` map and a `/api/groups/:id/update-stream` endpoint.

---

## Frontend structure

`public/script.js` — vanilla JS, no framework.

Key state variables at the top:
```javascript
let servers = [], groups = [], dockerHosts = [], dockerGroups = [],
    dockerProjects = {}, credentials = [], updateLogs = [];
```

**Tab switching:** `showTab(tabName)` swaps `data-active` on nav buttons and `hidden` on panels. Dashboard is the default on load.

**Credential picker flow:**
- `loadCredentials()` fetches `/api/credentials`, then calls `populateCredentialPickers()` to update all 4 `<select name="credential_id">` elements.
- `applyCredentialToForm(select, formId)` — when a credential is chosen, sets username (readOnly), visually locks auth_type using `style.pointerEvents`/`style.opacity` (NOT `disabled` — disabled fields are excluded from FormData), and hides + un-requires the password/key inputs.
- On edit open (`editServer()`, `editDockerHost()`): credential picker value is set *after* group options are rebuilt, then `applyCredentialToForm` is called.

**Important:** Never use `element.disabled = true` to lock form fields you still need in FormData. Use CSS pointer-events lock instead.

---

## API routes summary

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/servers` | List all servers (secrets stripped) |
| POST | `/api/servers` | Create server |
| PUT | `/api/servers/:id` | Update server |
| DELETE | `/api/servers/:id` | Delete server + key file |
| GET | `/api/servers/:id/update-stream` | SSE stream for live progress |
| POST | `/api/servers/:id/update` | Trigger update |
| POST | `/api/servers/:id/reboot` | Reboot server |
| POST | `/api/servers/test-connection` | Probe SSH auth methods |
| GET/POST/PUT/DELETE | `/api/groups/*` | Server group CRUD + group update trigger |
| GET/POST/PUT/DELETE | `/api/docker/hosts/*` | Docker host CRUD |
| GET/POST/PUT/DELETE | `/api/docker/groups/*` | Docker group CRUD |
| GET/POST/PUT/DELETE | `/api/docker/projects/*` | Compose project CRUD |
| POST | `/api/docker/hosts/:id/update` | Update docker host |
| GET/POST/PUT/DELETE | `/api/credentials/*` | Credential vault CRUD |
| GET/POST/PUT/DELETE | `/api/webhooks/*` | Discord webhook CRUD |
| POST | `/api/webhooks/:id/test` | Send test Discord message |
| GET | `/api/logs` | Query update logs |
| GET | `/api/dashboard` | Summary stats |
| GET | `/api/dashboard/schedule-status` | Next scheduled update info |

---

## Adding a new feature — checklist

1. **DB change?** Add a new migration to `MIGRATIONS` in `db/index.js` with the next unused integer id.
2. **New route file?** Register it in `server.js` with `app.use('/api/<name>', require('./routes/<name>'))`.
3. **New service?** Keep SSH/exec logic in `services/`, DB queries in route files or services — not mixed with crypto.
4. **Frontend?** Add the tab button + panel to `index.html`, add state variable + load function to `script.js`, call the load function in `DOMContentLoaded`.
5. **Secrets?** Always call `encrypt()` before storing; never log decrypted values.
6. **Rebuild container** after any change: `sudo docker compose build && sudo docker compose up -d`

---

## Common gotchas

- **Alpine + timezones**: Without `apk add tzdata`, `TZ` env var is ignored. The Dockerfile already adds it, but keep this in mind if changing base image.
- **node-cron timezone**: Pass `{ timezone: 'Europe/Amsterdam' }` directly to `cron.schedule()` — don't rely on the system TZ.
- **Migration id ordering**: The MIGRATIONS array is iterated in array order, but `appliedIds` check uses the `id` field. Ids don't need to be sequential, but each must be unique. Currently: 1 (initial), 2 (add_missing_columns), 3 (credential_vault).
- **SSH key files**: Stored in `ssh-keys/` with random hex filenames (set by multer). Deleting a server/credential also deletes the key file.
- **Encrypted key files**: `connectToServer` checks for `ENCRYPTED` in the key content and throws a clear error — passphrase-protected keys are not supported.
- **FormData + disabled**: Disabled form fields are not submitted with the form. Use CSS locking (`pointerEvents: 'none'`) instead when you want visual lock but still need the value in FormData.
