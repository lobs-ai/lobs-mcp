# lobs-mcp

MCP server that lets **Lobs/OpenClaw** talk to a local **Gmail+Google Calendar bridge** over **localhost HTTP** (internal-only).

- Gmail access is **read-only**.
- Calendar access is **read by default**, with **per-calendar write allowlisting** enforced by the bridge.

## Sync contract (important)

This repo contains **two layers** that must be kept in sync:

1) **Bridge protocol** (methods + params + result shapes) — what the privileged “other user” service implements.
2) **This MCP server + CLI wrappers** — what Lobs/OpenClaw calls.

If you add/change a bridge method, you must update:
- the MCP tool mapping in `src/index.ts`
- the docs below
- and (optionally) any local CLI conveniences

## Bridge protocol (HTTP)

The bridge listens on **localhost HTTP** (default: `http://127.0.0.1:17381`) and speaks JSON.

- `GET /health` → `{ ok: true }`
- `POST /call` with `{ id, method, params }` → `{ id, ok, result | error }`

Request:
```json
{"id":"...","method":"calendar.upcoming","params":{"hours":72,"tz":"America/New_York"}}
```

Response:
```json
{"id":"...","ok":true,"result":{}}
```

Methods used by this MCP:
- `ping`
- `gmail.unread` `{ max }`
- `gmail.search` `{ q, max }`
- `calendar.upcoming` `{ hours, tz, calendarId? }`
- `calendar.create` `{ calendarId?, event }`
- `calendar.update` `{ calendarId?, eventId, patch }`
- `calendar.delete` `{ calendarId?, eventId }`

## Install

```bash
npm install
npm run build
```

## Run

One command build+run (bash script):

```bash
./bin/start-mcp
```

(If you already built it and just want to run the compiled server: `npm start`.)

## Dev

```bash
npm run dev
```

## Convenience CLIs (recommended)

### 1) `lobs-bridge` (Node CLI)

A small CLI that calls the **localhost HTTP bridge** directly (so you don’t have to remember URLs or write ad-hoc test code):

```bash
# after npm install && npm run build
lobs-bridge ping
lobs-bridge gmail-unread --max 10
lobs-bridge gmail-search "is:unread newer_than:7d" --max 20
lobs-bridge calendar-upcoming --hours 48 --tz "America/New_York"
lobs-bridge calendar-list
```

If you need to hit an arbitrary bridge method:

```bash
lobs-bridge call calendar.upcoming --params-json '{"hours":48,"tz":"America/New_York"}'
```

### 2) `./bin/bridge-call` (bash + socat)

If you want a dead-simple shell way to send one request and block until a response:

```bash
./bin/bridge-call ping
./bin/bridge-call gmail.unread '{"max":10}'
```

This is intentionally “dumb”: it’s for quick manual testing that the bridge is alive and returning the expected shapes.

## Quickstart (make it work every time)

1) Bring up the bridge (socket) reliably:

```bash
cd ~/lobs-mcp
./bin/up
```

This ensures:
- the `gcal-bridge` user service is installed + started
- `/tmp/gcal-bridge.sock` exists

Logs:
```bash
journalctl --user -u gcal-bridge -f
```

2) Set up Google auth (one time)

Put your OAuth client JSON at:
- `~/.config/lobs-mcp/google-credentials.json`

Then run:
```bash
cd ~/lobs-mcp
npm run build
lobs-google-auth
```

This writes:
- `~/.config/lobs-mcp/google-token.json`

Scopes:
- Calendar: read+write **API scope** (Google scopes aren’t per-calendar; we enforce RO/RW locally via `calendar-acl.json`)
- Gmail: read + mark read/unread (NO send)

3) Calendar access control (RW vs RO)

The bridge enforces per-calendar permissions via:
- `~/.config/lobs-mcp/calendar-acl.json`

Example (default read-only; explicitly allow write only where you want it):
```json
{
  "default": "read",
  "calendars": {
    "primary": "write",
    "someone@group.calendar.google.com": "read"
  }
}
```

If the file is missing, the safe fallback is effectively:
```json
{ "default": "read", "calendars": {} }
```

To discover calendar IDs, use the new MCP tool `calendar_list` (or bridge method `calendar.list`).

## Configuration

Defaults:
- HTTP: `http://127.0.0.1:17381`

### Separate bridge user
For the “bridge runs as another user” case, HTTP is the easiest option (no Unix-socket permission headaches).
- Bridge runs as `mcpuser` via systemd and binds to `127.0.0.1` only
- MCP server runs as `rafe` and talks to `http://127.0.0.1:17381`


Override (optional):
- `LOBS_BRIDGE_SOCKET`
- `LOBS_BRIDGE_TIMEOUT_MS`
- `GOOGLE_CREDENTIALS_PATH`
- `GOOGLE_TOKEN_PATH`

Resolution order (highest → lowest priority):
1) Environment variables
2) Repo-local `.env`
3) `~/.config/lobs-mcp/config.env`
4) Built-in defaults

