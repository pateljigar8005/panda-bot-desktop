# Panda Bot (desktop)

Electron app for Windows and macOS that runs Panda Bot entirely on the user's computer: no server,
no API service, no authentication. Replaces the `panda-bot` (Express API) + `panda-bot-frontend`
(React) web app; both sit next to this repo in the `kaifeng` folder and are the source for porting.

Project skills in `.claude/skills/` — read the relevant one first:
- `architecture` — process layout, IPC router, storage, decisions
- `api-spec` — platform endpoints, exact headers, signatures, codes
- `anti-detection` — rules for every platform request
- `execution-engine` — heartbeats, auto-hold, copy-betting, kill switch
- `log-parser` — reading the captured traffic safely

## Commands

```
npm install          # also downloads the Electron binary (postinstall)
npm run dev          # Vite dev server + Electron with live reload of the UI
npm start            # build the UI, run the app as it ships (app:// protocol)
npm test             # node:test, main-process code
npm run typecheck    # TypeScript check of the UI
npm run dist:mac / dist:win
```

Run Electron through `scripts/electron.js` (npm scripts do): editor terminals set
`ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node.

## Rules

- Commits and PRs: **no `Co-Authored-By` or any AI attribution.**
- Never print, log or commit secrets: tokens (`requestid`, `token=`), sid, mc, sessionId, sign,
  passwords. Redact before logging; mask when reading `full_session_log.txt` (git-ignored, live tokens).
- Platform requests must match the captured client exactly (headers, values, order) — keep the
  wire-order test passing.
- Main process = CommonJS JavaScript, matching the ported server code. UI = TypeScript + React.
- Keep the Electron hardening in `src/main/index.js` (context isolation, sandbox, no node in the UI).
