# Deploying Kampus to a single server

One small VPS runs the whole product: the web app, PostgreSQL, the background
worker, uploaded photos and the webhooks for SMS, Telegram, telephony and
FaceID. The reference setup is a **Hetzner Cloud CX23** (2 vCPU, 4 GB RAM,
40 GB disk, about 6 USD a month), Ubuntu 24.04, with the production compose file
`docker-compose.prod.yml` and Caddy for automatic HTTPS. Any Ubuntu/Debian
server with Docker works the same way.

## 1. Create the server

1. In the Hetzner Cloud console create a project, then **Add server**:
   location Falkenstein or Helsinki, image **Ubuntu 24.04**, type **CX23**
   (shared vCPU, x86). Add an **SSH key** (the public key of whoever will
   deploy). Optional but recommended: enable **Backups** (about 20 % extra).
2. Create a **Firewall** in the Hetzner console and apply it to the server:
   allow inbound TCP 22, 80 and 443, plus TCP and UDP 3478 and UDP 49160–49200
   for the video relay; nothing else. (If you prefer `ufw` on the server:
   `ufw allow 22,80,443/tcp && ufw allow 3478 && ufw allow 49160:49200/udp && ufw enable`.)
3. Point a DNS **A record** at the server's public IP, for example
   `crm.yourcenter.uz`. Without your own domain, use the free wildcard DNS
   service sslip.io: the host name `203-0-113-10.sslip.io` resolves to
   `203.0.113.10` (dashes instead of dots), and Caddy can get an HTTPS
   certificate for it.

## 2. Install Docker

```bash
ssh root@<server-ip>
apt-get update && apt-get -y upgrade
apt-get -y install unattended-upgrades && dpkg-reconfigure -f noninteractive unattended-upgrades
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
curl -fsSL https://get.docker.com | sh
docker compose version      # Docker Compose v2 is included
```

Security updates then install themselves, and the 2 GB swap file keeps the
first `docker compose build` from running out of memory on a 4 GB server.

## 3. Get the code

The repository is private. Create a read-only deploy key on the server and add
it under _GitHub → repository → Settings → Deploy keys_:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/kampus_deploy -C kampus-deploy
cat ~/.ssh/kampus_deploy.pub          # paste this into GitHub as a deploy key
printf 'Host github.com\n  IdentityFile ~/.ssh/kampus_deploy\n' >> ~/.ssh/config
git clone git@github.com:xrahimov/kampus-crm.git /opt/kampus
cd /opt/kampus
```

## 4. Configure

```bash
cp .env.production.example .env
openssl rand -hex 24                   # use the output as POSTGRES_PASSWORD
nano .env
```

Fill in:

| Variable                                      | Value                                                            |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                           | the random string (letters and digits only)                      |
| `DOMAIN`                                      | `crm.yourcenter.uz` (or the sslip.io name); `:80` for plain http |
| `APP_URL`                                     | `https://crm.yourcenter.uz` (must match `DOMAIN`)                |
| `BOOTSTRAP_ORG_NAME`, `BOOTSTRAP_BRANCH_NAME` | the learning centre and its first branch                         |
| `BOOTSTRAP_CEO_NAME`, `BOOTSTRAP_CEO_PHONE`   | the first login, phone in international form (`+998…`)           |
| `BOOTSTRAP_CEO_PASSWORD`                      | the first password (change it after the first login)             |

The `BOOTSTRAP_*` lines are used only when the database is empty; delete them
from `.env` after the first start.

## 5. Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs migrate   # "Created organisation …"
docker compose -f docker-compose.prod.yml ps             # app, worker, db, caddy, backup: running
```

The first build takes a few minutes. Then open `https://<DOMAIN>/`, sign in with
the CEO phone and password, and continue in **Settings**: courses, rooms,
payment methods, staff and the integrations.

The first CEO is the **site owner**. One server can host several learning
centres (A-108): the site owner opens **Settings → Organisations** and creates a
centre with its branches and its own CEO (name, phone, first password). That CEO
signs in on the same address and sees only their centre; the site owner never
sees inside it. Each centre sets up its own courses, staff and integrations.

What runs:

| Service   | Role                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `caddy`   | Ports 80/443, HTTPS certificate from Let's Encrypt, proxies to the app                                                             |
| `app`     | Next.js server                                                                                                                     |
| `worker`  | Job queue: SMS sending, AmoCRM pushes, the daily scan for auto-SMS, birthdays and debtors                                          |
| `turn`    | coturn relay for video lessons on 3478 and UDP 49160–49200 (`TURN_PUBLIC_IP`, `TURN_SECRET`)                                       |
| `migrate` | Runs once per start: `prisma migrate deploy`, then the first-start bootstrap                                                       |
| `db`      | PostgreSQL 16, data in the `db-data` volume                                                                                        |
| `backup`  | Nightly `pg_dump` into `./backups` kept `BACKUP_KEEP_DAYS` days (default 14), plus a copy of uploaded files in `./backups/uploads` |

Uploaded photos live in the `uploads` volume.

## 6. Check that it works

```bash
curl -sI https://<DOMAIN>/api/v1/health | head -1        # HTTP/2 200
curl -s https://<DOMAIN>/en/login -o /dev/null -w '%{http_code}\n'   # 200
docker compose -f docker-compose.prod.yml logs --tail 50 app worker
```

Then in the browser: sign in, create a course, a room, a group and a student,
take a test payment, print its receipt, and open Settings → Logs → Actions.
As the site owner (the first CEO), open Settings → Organisations: the **Server
status** card shows the worker's last run, the job queue, the nightly backup,
disk space and server errors, and takes the Telegram chat ID that receives
alerts (sent by your own centre's bot from Settings → Integrations → Telegram).
The server checks itself every five minutes, clocked by Docker's poll of
`/api/v1/health`; that endpoint is also the one to give an external uptime
service, if you use one.
Webhook URLs for the integrations are `https://<DOMAIN>/api/v1/webhooks/telegram`,
`/telephony` and `/face-id`; the public lead form is `https://<DOMAIN>/forms/<name>`.
The URLs are the same for every organisation on the server: the secret a webhook
presents (or, for Payme and Click, the merchant key and service id) says which
centre it is for, so each centre sets its own bot, secrets and merchant
credentials in its own Settings → Integrations. Telegram is the exception: the
site owner can tick **Shared with every centre on this server** on their own
Telegram card, and centres without a bot of their own use that one.

## 7. Update to a new version

```bash
cd /opt/kampus
git pull
docker compose -f docker-compose.prod.yml up -d --build   # migrations run automatically
docker image prune -f
```

The `backup` service reads `docker/backup.sh` when it starts, so after an update
that changed the script, restart it once:
`docker compose -f docker-compose.prod.yml restart backup`. It takes a dump
straight away and reports it to the **Server status** card.

## 8. Backups and restore

Every 24 hours the `backup` service:

- writes a database dump to `/opt/kampus/backups/kampus-<date>.sql.gz`, keeping the
  last `BACKUP_KEEP_DAYS` days (default 14);
- copies new uploaded files and lesson recordings to `/opt/kampus/backups/uploads`.
  A file deleted in Kampus moves to `/opt/kampus/backups/uploads-deleted` and is
  dropped after `BACKUP_KEEP_DAYS` days. The copy pauses while less than 2 GB of
  disk would be left (`BACKUP_MIN_FREE_KB`) and says so in `docker compose logs backup`.

These copies live on the same disk as the app, so they protect against mistakes,
not against losing the server. For that, enable Hetzner's server backups or copy
the folder off now and then (`scp -r root@<ip>:/opt/kampus/backups .`).

Lesson recordings are deleted automatically after the number of days set in
Settings → Integrations → Video lessons (default 90; 0 keeps them forever).

To restore a dump into a fresh database:

```bash
docker compose -f docker-compose.prod.yml stop app worker
gunzip -c backups/kampus-<date>.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U kampus -d kampus
docker compose -f docker-compose.prod.yml start app worker
```

To put uploaded files back (all of them, or one folder such as `recordings`):

```bash
docker compose -f docker-compose.prod.yml cp backups/uploads/. app:/data/uploads/
docker compose -f docker-compose.prod.yml exec -u root app chown -R nextjs:nodejs /data/uploads
```

## 9. A centre's own address

Every centre signs in on the server's address (`DOMAIN`). A centre can also
have an address of its own, for example `kingston.kampus.uz` (A-114): the login
page then carries the centre's name and logo, and the links Kampus sends its
students (Telegram, the class-link SMS) use that address. Certificates for such
addresses are fetched by Caddy on the first visit, so nothing on the server
changes per centre.

1. At the domain's registrar, add an `A` record for the name that points at the
   server's IP. For subdomains of one domain, a single wildcard record
   (`*.kampus.uz → <server IP>`) covers every centre.
2. Wait until `dig +short kingston.kampus.uz` (or an online DNS checker) shows
   the server's IP.
3. As the site owner, open Settings → Organisations, edit the centre and enter
   the name in **Own address**: a bare host name, no `https://`, no path, one
   per centre.
4. Open `https://kingston.kampus.uz/` once. Caddy asks the app whether the name
   is known (`GET /api/v1/public/tls-ask?domain=…`, 200 for the main address
   and every claimed name, 403 otherwise) and fetches a Let's Encrypt
   certificate for it; the first page load takes a few seconds longer.

Clearing the field stops the name from being served; its certificate lapses by
itself. `DOMAIN` and `APP_URL` stay the main address: it keeps working for
every centre, and the payment and amoCRM callback URLs always use it.

## Troubleshooting

- **No certificate / browser warning:** the DNS record does not point at the
  server yet, or port 80/443 is blocked by the firewall. `docker compose -f docker-compose.prod.yml logs caddy`.
- **Login works, then logs out at once:** `APP_URL` does not match the address in
  the browser, or you use plain http without `COOKIE_SECURE=false`.
- **`migrate` failed:** `docker compose -f docker-compose.prod.yml logs migrate`;
  fix `.env` and run `up -d --build` again. Bootstrap errors name the missing variable.
- **Disk full:** `docker system df`, then `docker image prune -af`; the dumps in
  `./backups` can be deleted once copied elsewhere.
