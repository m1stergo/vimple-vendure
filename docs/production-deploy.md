# Production deploy (Docker + VPS)

## Services

- `database`: Postgres
- `server`: Vendure API (`start:server`)
- `worker`: Vendure worker (`start:worker`)

`server` and `worker` use the same image, but run different commands.

## 1) Configure environment

Edit `.env` and set real secrets and URLs.

Important:

- `APP_ENV=production`
- `DB_SYNCHRONIZE=false` in normal operation

## 2) First bootstrap (schema creation)

For a fresh database only:

1. Set `DB_SYNCHRONIZE=true` temporarily in `.env`.
2. Start `server` once.
3. Set `DB_SYNCHRONIZE=false` again.

After that, use migrations for schema changes:

```bash
docker compose -f docker-compose.prod.yml run --rm server npm run migrate
```

## 3) Build and run

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## 4) Health checks

- Server: `http://<host>:3000/health`
- Worker: `http://<host>:3020/health` (inside container healthcheck)

## Frontend/storefront

Vendure server does not include your customer storefront.  
If you have a separate frontend (Next.js/React/Vue), deploy it as another app/service (often another Docker container) and point it to the Vendure API URL.
