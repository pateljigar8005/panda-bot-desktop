---
name: api-spec
description: Panda platform API reference — endpoints, exact request headers, signatures, response codes and gzip decoding. Use whenever writing, changing or debugging any request to the betting platform (getUserInfoPB, heartbeat, balance, betPB, dataCollect).
---

# Panda platform API

Everything here was taken from captured traffic of the real web client (`full_session_log.txt`).
When in doubt, check the capture (see the `log-parser` skill) — it is the source of truth, not this file.

## Base URL — discovered, not fixed

The API domain rotates (seen: `api.02o5mm35.com`, `api.3qttu0s.com`, …). Never hardcode it.
Discovery (ported from `panda-bot/src/services/apiDomainService.js`):
- Fetch `prod.json` from the OSS mirrors, decrypt the `GA<group>.api` entries (AES-128-ECB), probe them; the first to answer wins.
- Cache 10 minutes; on failure fall back to the last good domain, then the configured default.
- Resolve the domain **once per call** and record it (`apiBase` + `endpoint`) on every log entry.

Web origin (for `referer`): `https://app-h5.lzy21.com`.

## Headers — exact names, values and ORDER

Standard set (heartbeat, betPB and other POSTs; GETs such as balance drop `content-type`):

```
sec-ch-ua-platform: "Android"            ("iOS" when deviceId = 1)
lang: zh
checkid: pc-<32 hex>-<uid>-<timestamp_ms>
sec-ch-ua: "Chromium";v="153", "Not_A Brand";v="8"
request-code: {"panda-bss-source":"1"}
referer: https://app-h5.lzy21.com/
sec-ch-ua-mobile: ?1
requestid: <token>
user-agent: <iOS Safari or Android Chrome UA — see platformClient USER_AGENTS>
accept: application/json, text/plain, */*
content-type: application/json         (POST only)
```

getUserInfoPB on iOS (mobile-browser capture, `full_session_log.txt`) has its own, smaller set,
in this order: `sec-ch-ua-platform, requestid, referer, user-agent, accept, sec-ch-ua, sec-ch-ua-mobile`.

getUserInfoPB on **Android** is different again: captured live from inside the real app's embedded
WebView (proxy intercept, not in `full_session_log.txt` — that capture is a plain browser session,
not the native app). A WebView auto-adds headers a bare browser tab never sends. Order:
```
accept: application/json, text/plain, */*
requestid: <token>
user-agent: <Android WebView UA — see platformClient ANDROID_WEBVIEW_USER_AGENT>
origin: https://app-h5.lzy21.com
x-requested-with: <the app's own Android package name>
sec-fetch-site: cross-site
sec-fetch-mode: cors
sec-fetch-dest: empty
referer: https://app-h5.lzy21.com/
accept-language: en-US,en;q=0.9
```
No `sec-ch-ua*` headers on this path at all.

Everywhere else (the standard set above, and getUserInfoPB on iOS): `origin`/`accept-language` are
**not** sent by the real client — don't add them there. Header order on the wire matters — see the
`anti-detection` skill for the axios pitfalls.

deviceId: `1` = iOS, `2` = Android. Only `sec-ch-ua-platform`, `user-agent` and the heartbeat `os` differ.

## Endpoints

| Call | Request | Notes |
|---|---|---|
| User info | `GET /yewu12/user/getUserInfoPB?token=<token>` | Nothing else in the URL, no body. `data` is gzip → `{ userId, mId, mc, … }`. **No `sid` in here** — confirmed by decoding real captures, despite old code/comments assuming otherwise. |
| Heartbeat | `POST /yewu40/req/request?t=<ms>` | Body `{ sessionId, os, sid, uid, code, device, sign, t }`; `os` = `ios`/`android`, `code` = `mc`, `device` = deviceId |
| Balance | `GET /yewu12/user/amount?uid=<uid>&t=<ms>` | `data.amount` (may be gzip) |
| Place bet | `POST /yewu13/v1/betOrder/betPB?t=<ms>` | Standard headers, no `sign`. Body is the master's bet payload (`orderDetailList`, `seriesOrders`, `acceptOdds`, …) |
| Analytics (optional) | `POST /yewu40/req/dataCollect` | `sign` = `MD5(sessionId + deviceId + salt)`, salt from config (`PANDA_DATA_COLLECT_SALT`) |

`sid` is never returned by the server: the real client generates a UUIDv4 (dashes stripped) once
client-side and persists it in `localStorage.unique_uuid` for the life of the browser profile
(`request_file.js:40512`, `init_uid`). We generate one per account (`signatureService.generateSid`)
and reuse it forever, the same way.

Signatures (`signatureService`):
- heartbeat `sign` = `MD5(sid + "|" + mc + "|" + uid)`
- `checkid` = `pc-` + 16 random bytes hex + `-<sid>-` + `Date.now()` (confirmed against
  `full_session_log.txt:14` — the middle segment is `sid`, not `uid`)

## Responses

- Success: `code === "0000000"`.
- Token expired: `"0401013"` — usually inside an **HTTP 200** body, so check `body.code`, not only the status.
- `data` starting with `H4sI` is gzip+base64: `zlib.gunzipSync(Buffer.from(data, 'base64'), { maxOutputLength: 5MB })`, then `JSON.parse`.
- Show the platform's own words on failure (`msg` / `message` / `error`).

## Secrets

`requestid`/`token`, `sid`, `mc`, `sessionId`, `sign`, `code` (= mc) are secrets: never commit them.
Stored in plain in the local SQLite file — not encrypted at rest, and the Activity/Audit logs
store them unredacted too (local app, single user — see CLAUDE.md). Proxy and SMTP passwords are
a separate category and do stay encrypted.
