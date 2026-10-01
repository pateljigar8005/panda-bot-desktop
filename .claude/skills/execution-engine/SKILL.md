---
name: execution-engine
description: How heartbeats and copy-betting run — heartbeat scheduler, failure/hold handling, and the master → sub-account bet replication flow (betPB). Use when working on heartbeats, bet placement, queues or the kill switch.
---

# Execution engine

## Heartbeats (built — port from panda-bot/src/services/heartbeatScheduler.js)

- One timer loop per operational account (status active, not on hold, kill switch off).
- Every beat: interval ± jitter (system settings), `POST /yewu40/req/request` with
  `sign = MD5(sid|mc|uid)` — no browser needed; sid/mc come from getUserInfoPB at account setup.
- Each run has a run token, so a restarted loop can't overlap the old one.
- Success → `consecutiveFailures = 0`. Failure → `heartbeatErrors += 1` (total, reset only by "Clear log")
  and `consecutiveFailures += 1` (current streak).
- Streak ≥ `autoHoldAfterFailures` → status `on_hold` (+ `holdReason`, `heldAt`), audit entry
  `account_auto_held` (System), notification `accountOnHold`.
- Expired code `0401013` (check `result.code ?? result.responseCode`) → status `expired`, notify.
- Every log entry records `apiBase` + `endpoint` + redacted request/response.

## Copy-betting (to build)

1. Detect the master account's bet: the `POST /yewu13/v1/betOrder/betPB` payload.
2. Give it a UUID; store it (idempotency) and apply bet settings per sub-account (bet mode, limits,
   `dailyLossLimit`, `maxConcurrentBetsPerAccount`).
3. For each operational sub-account, through its per-account queue:
   - fresh `checkid` (`pc-<32hex>-<uid>-<ms>`), standard headers, that account's proxy;
   - `POST /yewu13/v1/betOrder/betPB?t=<ms>` with the adapted payload — no `sign` needed;
   - 500–750 ms random stagger between accounts;
   - decode gzip responses; success = `"0000000"`; log the result (BetLog) either way.
4. Kill switch: stops all loops, clears every queued job, and stays on across restarts until resumed.

## Paper mode

Keep a dry-run switch that logs intended bets without sending them — test with one sub-account first.
