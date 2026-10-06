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

What runs:

| Service   | Role                                                                                         |
| --------- | -------------------------------------------------------------------------------------------- |
| `caddy`   | Ports 80/443, HTTPS certificate from Let's Encrypt, proxies to the app                       |
| `app`     | Next.js server                                                                               |
| `worker`  | Job queue: SMS sending, AmoCRM pushes, the daily scan for auto-SMS, birthdays and debtors    |
| `turn`    | coturn relay for video lessons on 3478 and UDP 49160–49200 (`TURN_PUBLIC_IP`, `TURN_SECRET`) |
| `migrate` | Runs once per start: `prisma migrate deploy`, then the first-start bootstrap                 |
| `db`      | PostgreSQL 16, data in the `db-data` volume                                                  |
| `backup`  | Nightly `pg_dump` into `./backups`, kept for `BACKUP_KEEP_DAYS` days (default 14)            |

Uploaded photos live in the `uploads` volume.

## 6. Check that it works

```bash
curl -sI https://<DOMAIN>/api/v1/health | head -1        # HTTP/2 200
curl -s https://<DOMAIN>/en/login -o /dev/null -w '%{http_code}\n'   # 200
docker compose -f docker-compose.prod.yml logs --tail 50 app worker
```

Then in the browser: sign in, create a course, a room, a group and a student,
take a test payment, print its receipt, and open Settings → Logs → Actions.
Webhook URLs for the integrations are `https://<DOMAIN>/api/v1/webhooks/telegram`,
`/telephony` and `/face-id`; the public lead form is `https://<DOMAIN>/forms/<name>`.

## 7. Update to a new version

```bash
cd /opt/kampus
git pull
docker compose -f docker-compose.prod.yml up -d --build   # migrations run automatically
docker image prune -f
```

## 8. Backups and restore

Dumps are written to `/opt/kampus/backups/kampus-<date>.sql.gz` every 24 hours.
Copy them off the server now and then (`scp root@<ip>:/opt/kampus/backups/*.gz .`)
or enable Hetzner's server backups. To restore a dump into a fresh database:

```bash
docker compose -f docker-compose.prod.yml stop app worker
gunzip -c backups/kampus-<date>.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U kampus -d kampus
docker compose -f docker-compose.prod.yml start app worker
```

## Troubleshooting

- **No certificate / browser warning:** the DNS record does not point at the
  server yet, or port 80/443 is blocked by the firewall. `docker compose -f docker-compose.prod.yml logs caddy`.
- **Login works, then logs out at once:** `APP_URL` does not match the address in
  the browser, or you use plain http without `COOKIE_SECURE=false`.
- **`migrate` failed:** `docker compose -f docker-compose.prod.yml logs migrate`;
  fix `.env` and run `up -d --build` again. Bootstrap errors name the missing variable.
- **Disk full:** `docker system df`, then `docker image prune -af`; the dumps in
  `./backups` can be deleted once copied elsewhere.
