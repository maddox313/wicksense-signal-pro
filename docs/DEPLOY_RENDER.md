# Deploy WickSense Signal Pro to Render

Deploy directly from GitHub. The server-side trade engine starts automatically via `instrumentation.ts` when the web service boots — **no browser tab required**.

## Prerequisites

- GitHub repo pushed (branch: `development` or change `branch` in `render.yaml`)
- [Render](https://render.com) account
- **Starter plan or higher** (persistent disk required for SQLite + config files)
- Alpaca API keys (paper recommended first)

## One-click Blueprint

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**.
3. Connect the repository and apply `render.yaml`.
4. Set secret env vars when prompted:
   - `ALPACA_API_KEY`
   - `ALPACA_SECRET_KEY`
   - (Optional) SMTP / Twilio for alerts
5. Wait for build + deploy. Health check: `https://<your-service>.onrender.com/api/health`

## Manual Web Service (alternative)

| Setting | Value |
|---------|--------|
| **Root Directory** | `.` (repo root — **not** `apps/web`) |
| **Build Command** | `npm ci --include=dev && npm run build` |
| **Start Command** | `npm run start:prod -w @wicksense/web` |
| **Health Check Path** | `/api/health` |

### Persistent disk

| Setting | Value |
|---------|--------|
| **Mount path** | `/var/data` |
| **Size** | 1 GB (increase if needed) |

### Production database path

```
DATABASE_URL=file:/var/data/data/wicksense.db
WICKSENSE_DATA_DIR=/var/data/data
```

All `*.local.json` config files (auto-trade, schedule, engine-config, etc.) are written under `WICKSENSE_DATA_DIR`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `production` |
| `DATABASE_URL` | Yes | `file:/var/data/data/wicksense.db` |
| `WICKSENSE_DATA_DIR` | Yes | `/var/data/data` (writable child of disk mount at `/var/data`) |
| `TRADE_ENGINE_ENABLED` | Yes | `true` — in-process 30s trade engine |
| `ALPACA_API_KEY` | Yes | Alpaca API key |
| `ALPACA_SECRET_KEY` | Yes | Alpaca secret |
| `ALPACA_PAPER` | Yes | `true` for paper trading |
| `CRON_SECRET` | Recommended | Secures `/api/cron/trade-engine` if using external cron |
| `SMTP_*` | Optional | Email alerts |
| `TWILIO_*` | Optional | SMS alerts |

Render injects `PORT` and `RENDER_EXTERNAL_URL` automatically.

## Verify after deploy

1. **Health**: `GET /api/health` → `{ "ok": true, "tradeEngine": { "enabled": true }, "alpaca": { "configured": true, "connected": true } }`
2. **Cycles**: `totalCycles` increases every ~30s in health response
3. **Logs**: Render logs show `[trade-engine] Starting server worker`
4. **Close your laptop**: trades continue — engine runs on Render, not in your browser

## First-time UI setup

Open the deployed URL once and:

1. Settings → confirm broker keys (or rely on env vars)
2. Enable auto-trade per chart slot
3. Set trading schedule / risk — saves to `/var/data/data/*.local.json`

## Backup branch

Pre-deploy snapshot: `PRE-SAAS-DEPLOY-BACKUP`

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `sh: prisma: not found` | **Root Directory must be `.`**, not `apps/web`. Build command must be `npm ci && npm run build`. Clear build cache and redeploy latest `development` commit. |
| `lightningcss` / `@tailwindcss/oxide` native binding not found | Do not use `install-strategy=nested`. Run full `npm ci` from repo root. Clear build cache and redeploy. |
| Health check 503 | Check `DATABASE_URL` and disk mount |
| `totalCycles` stays 0 | Confirm `TRADE_ENGINE_ENABLED=true`, check logs |
| Trades not placing | Open UI once to sync `engine-config.local.json`; check schedule |
| Build fails on Prisma | Ensure `NPM_CONFIG_PRODUCTION=false` during build (set in blueprint) |
