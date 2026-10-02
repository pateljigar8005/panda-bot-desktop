---
name: architecture
description: Panda Bot desktop app architecture — Electron main/renderer split, IPC router replacing the HTTP API, local SQLite storage, no authentication, what was ported from the old panda-bot server. Use before adding features, moving code between processes, or making structural decisions.
---

# Panda Bot desktop architecture

Panda Bot keeps sub-accounts on the betting platform alive (heartbeats) and copies the master
account's bets to them. It used to be a web app (`panda-bot` Express API + `panda-bot-frontend`
React UI). It is now **one desktop app for Windows and macOS; everything runs on the user's computer.**

## Decisions (agreed with the client)

- **No server, no API service.** Nothing listens on a port.
- **No authentication.** No login, users, JWT, invites or password reset. The app opens straight
  to the dashboard. Audit entries are "You" (user action) or "System" (automatic).
- **Platform credentials (token/sid/mc/sessionId) are stored in plain**, not encrypted at rest:
  single local user, no server, no multi-tenant isolation to protect — `encryptionService` +
  the OS-keychain key (`safeStorage`) stay in place only for proxy passwords.
- **Local storage: SQLite** (single file in the user-data folder) instead of MongoDB.
- **No Redis / BullMQ.** Kill-switch flag lives in SQLite + memory; jobs use an in-process,
  per-account queue.

## Layout

```
src/main/        Electron main process (Node.js, CommonJS) — all logic and platform requests
  index.js       window, single-instance lock, security settings
  appProtocol.js app://panda — serves the built UI, CSP, SPA fallback for page loads only
  router.js      route table + dispatch: "METHOD /path/:param" → handler({ params, query, body })
  ipc.js         one IPC channel (panda:request) → router; rejects callers that aren't our UI
src/preload/     exposes exactly window.panda.request(); nothing else
renderer/        the React dashboard (Vite + Tailwind), copied from panda-bot-frontend
scripts/         dev helpers (electron.js launcher)
test/            node:test tests for main-process code
build/           app icon and packaging resources
```

## How the UI talks to the app

The UI calls `window.panda.request({ method, path, body })` with the **same route names as the old
HTTP API** (`GET /accounts`, `PUT /accounts/:id`, …). Handlers return data or throw
`AppError(status, message)`; the response is always an envelope `{ ok, status, data | message }`.
`renderer/src/services/api.ts` is an axios instance whose adapter sends every request over this
bridge instead of HTTP, so services, hooks and pages are unchanged. A route with no handler yet
answers 404 (the UI shows its normal error state).

The UI has no login pages, auth store, user menu, roles or "created by" fields — don't add them back.
Live events (Live Monitor, alerts) go into `store/realtimeStore.ts`; the main process will push them
over IPC (the old socket.io connection is gone).

## Porting from panda-bot (server)

Reuse almost as-is in `src/main/`: platformClient, signatureService, encryptionService (key source
changes), apiDomainService, heartbeatScheduler, killSwitchService, systemSettingsService,
proxyService, tokenUrlService.
Rewrite: Mongoose models → SQLite data layer; Express controllers → router handlers (drop
`req`/`res`, keep validation and rules).
Drop: Express, middleware (helmet, CORS, rate limits), auth, socket.io, Redis, BullMQ, docker-compose.

## Desktop-specific behaviour (planned)

- Close to system tray; optional start at login; heartbeats only run while the app runs.
- `powerSaveBlocker` while heartbeats run; on wake (`powerMonitor` resume) refresh the API domain and
  resume — a sleep gap is not a heartbeat failure.
- Log tables are pruned automatically so the database doesn't grow forever.
- Single instance: two copies would double every heartbeat.

## Security rules (Electron)

- Window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Never relax these.
- Credentials sent to the renderer are masked in `accountJSON`/`masterJSON` (the Accounts/Master
  pages), but Activity/Audit log entries carry real values on purpose now — see CLAUDE.md.
- CSP forbids remote scripts and inline scripts; ship everything with the app.
- New windows are denied; external https links open in the browser; navigation away from the app is blocked.
- IPC handlers must validate input like the old express-validator rules did.

## Packaging

electron-builder (`electron-builder.yml`): macOS dmg (arm64 + x64), Windows NSIS installer.
Signing (Apple Developer ID + notarization; Windows code-signing certificate) and auto-update are
still to do. User data stays on uninstall.
