---
name: log-parser
description: How to read captured platform traffic (full_session_log.txt) to find requests, headers and payloads — with live tokens masked. Use when asked to analyse the capture or to check what the real client sends.
---

# Reading the capture (full_session_log.txt)

The capture is the source of truth for what the real client sends. It lives in the `kaifeng`
folder (next to the repos), is git-ignored, and **contains live tokens**.

## Format

Blocks separated by lines of `=`. Each block:
- `[ID] <ISO timestamp> | METHOD https://host/path`
- `Status: <code>`
- `--- REQUEST (cURL) ---` — `curl -X METHOD '<url>' -H '<name>: <value>' … --data-raw '<body>'`
- `--- RESPONSE (JSON) ---`

## Finding things

- Search by endpoint substring, e.g. `yewu13/v1/betOrder/betPB`, `yewu12/user/getUserInfoPB`.
- Ignore `OPTIONS` (CORS preflight) and static assets from `app-h5.lzy21.com` (`.js`, `.css`, `.png`).
- Header **order** in the cURL is the order the client sent — compare it name by name.
- Check more than one sample of the same request before concluding (e.g. both getUserInfoPB calls).

## Secrets — always mask

Never print live values. Mask before showing output:
- `requestid` header and `token=` query values (40 hex), `sid`, `mc`, `sessionId`, `sign`, `code`
  in heartbeat bodies, and gzip `data` blobs (getUserInfoPB decodes to `mc`, not `sid` — sid never
  appears in a server response, see `api-spec`).
- e.g. `sed -E 's/[0-9a-f]{40}/<TOKEN>/g'`, or print only header names / body field names.

## Output

Show the cURL and response exactly as captured (with secrets masked) when asked to extract a request;
don't paraphrase headers or payloads.
