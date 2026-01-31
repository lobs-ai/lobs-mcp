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

The bridge is expected to listen on a Unix socket (default: `./.run/bridge.sock` in this repo) and speak **newline-delimited JSON**.

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

## Configuration

By default, the tools are **standalone** (no `export ...` needed). Configure once:

```bash
# default is repo-local:
#   /home/rafe/lobs-mcp/.run/bridge.sock
# so you can often skip this entirely.
#
# If your bridge uses a different socket path, set it once:
./bin/configure --socket /some/other/path.sock
```

This writes:
- `~/.config/lobs-mcp/config.env`

Resolution order (highest → lowest priority):
1) Environment variables (`LOBS_BRIDGE_SOCKET`, `LOBS_BRIDGE_TIMEOUT_MS`)
2) Repo-local `.env`
3) `~/.config/lobs-mcp/config.env`
4) Built-in defaults

