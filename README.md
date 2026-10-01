# Panda Bot

Desktop app (Windows and macOS) that keeps platform sub-accounts alive with heartbeats and copies
the master account's bets to them. Everything runs locally on your computer — no server needed.

## Requirements

- Node.js 22.12 or newer (24 recommended)

## Getting started

```bash
npm install     # installs packages and downloads Electron
npm run dev     # opens the app with live reload of the UI
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the UI dev server and opens the app |
| `npm start` | Builds the UI and runs the app exactly as it ships |
| `npm test` | Tests for the app's background (main-process) code |
| `npm run typecheck` | Type-checks the UI |
| `npm run dist:mac` | Builds the macOS `.dmg` installers (Apple Silicon and Intel) into `release/` |
| `npm run dist:win` | Builds the Windows installer into `release/` |

## Project layout

```
src/main/      background process: all logic and platform requests
src/preload/   the bridge between the window and the background process
renderer/      the dashboard UI (React + Vite + Tailwind)
test/          tests
build/         icon and packaging resources
```

## Where data is stored

In the operating system's app-data folder (kept when the app is uninstalled):
- macOS: `~/Library/Application Support/Panda Bot`
- Windows: `%APPDATA%\Panda Bot`

## Status

Early setup: the window, the secure `app://` protocol and the bridge between the UI and the
background process are in place. There is no login — the app opens straight to the dashboard.
Next: port accounts, proxies, master account, heartbeats and settings from the server version,
and store data in SQLite.

## Distribution (to do)

- macOS: needs an Apple Developer ID to sign and notarize, or Gatekeeper blocks the app.
- Windows: needs a code-signing certificate, or SmartScreen shows an "unknown publisher" warning.
