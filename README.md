# lobs-mcp

MCP server that lets **Lobs/OpenClaw** talk to a local **Gmail+Google Calendar bridge** over a **Unix domain socket**.

- Gmail access is **read-only**.
- Calendar access is **read+write** (writes should still be gated by human confirmation in the calling agent).

## Sync contract (important)

This repo contains **two layers** that must be kept in sync:

1) **Bridge protocol** (methods + params + result shapes) — what the privileged “other user” service implements.
2) **This MCP server + CLI wrappers** — what Lobs/OpenClaw calls.

If you add/change a bridge method, you must update:
- the MCP tool mapping in `src/index.ts`
- the docs below
- and (optionally) any local CLI conveniences

## Bridge protocol (UDS)

The bridge is expected to listen on a Unix socket (default: `/tmp/gcal-bridge.sock`) and speak **newline-delimited JSON**.

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

So you don’t have to remember socket paths or write ad-hoc test code, this repo ships a tiny CLI that calls the **bridge** directly:

```bash
# after npm install && npm run build
lobs-bridge ping
lobs-bridge gmail.unread --params '{"max":10}'
lobs-bridge calendar.upcoming --params '{"hours":48,"tz":"America/New_York"}'
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
- Calendar: read+write (API scope)
- Gmail: read + mark read/unread (NO send)

3) Calendar access control (RW vs RO)

The bridge enforces per-calendar permissions via:
- `~/.config/lobs-mcp/calendar-acl.json`

Example (default read-only; primary writable):
```json
{
  "default": "read",
  "calendars": {
    "primary": "write",
    "someone@group.calendar.google.com": "read"
  }
}
```

To discover calendar IDs, use the new MCP tool `calendar_list` (or bridge method `calendar.list`).

## Configuration

Defaults:
- socket: `/tmp/gcal-bridge.sock`

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

