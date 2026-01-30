# lobs-mcp

MCP server that lets **Lobs/OpenClaw** talk to a local **Gmail+Google Calendar bridge** over a **Unix domain socket**.

- Gmail access is **read-only**.
- Calendar access is **read+write** (writes should still be gated by human confirmation in the calling agent).

## Bridge protocol (UDS)

The bridge is expected to listen on a Unix socket (default: `/run/gcal-bridge/bridge.sock`) and speak **newline-delimited JSON**.

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

```bash
export LOBS_BRIDGE_SOCKET=/run/gcal-bridge/bridge.sock
npm start
```

## Dev

```bash
npm run dev
```

## Configuration

- `LOBS_BRIDGE_SOCKET`: path to the Unix domain socket.
- `LOBS_BRIDGE_TIMEOUT_MS`: request timeout (default: 15000).

