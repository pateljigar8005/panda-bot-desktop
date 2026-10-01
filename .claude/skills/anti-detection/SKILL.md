---
name: anti-detection
description: Rules for every automated request to the platform — exact client headers and order, jitter, one request at a time per account, idempotency, proxies, auto-hold on repeated failures. Use whenever writing code that sends platform requests or schedules them.
---

# Request rules

Automated requests must look and behave like the real web client. Follow all of these:

1. **Headers = the capture.** Same names, values and order as the real client (see `api-spec`).
   Build them only with `buildHeaders` / `buildUserInfoHeaders`; never add headers the client doesn't send.
2. **Use the dedicated axios instance** (`http` in platformClient), never global `axios`. Its defaults
   have `Accept` and `Content-Type` deleted — otherwise axios puts them first, capitalised, and breaks
   the order. A test checks the exact order on the wire; keep it passing.
3. **Jitter.** Never fire at fixed intervals. Heartbeats: interval ± jitter from system settings
   (defaults 5000 ± 1500 ms). Bets across sub-accounts: staggered 500–750 ms random delays.
4. **One at a time per account.** Never send two bets for the same account concurrently — queue them
   per account (in-process queue; `maxConcurrentBetsPerAccount` setting).
5. **Idempotency.** Every master bet gets a UUID; record it locally (SQLite) before placing a
   sub-account bet so a retry after a network error never double-bets.
6. **Proxies.** Each sub-account should use its own proxy. No proxy = direct connection from the
   user's own IP — many accounts on one home IP looks unusual, so warn about it.
7. **Stop when failing.** After `autoHoldAfterFailures` consecutive failed heartbeats (default 5) put the
   account on hold: no more requests until the user resumes it. Respect the kill switch everywhere.
8. **Expired token** (`0401013`, often in HTTP 200) → mark the account expired and stop its requests.
9. **Timeouts** of 10 s on every request; back off on HTTP 429.
10. **GZIP.** Decode `H4sI…` data with a capped `gunzipSync` (5 MB).
