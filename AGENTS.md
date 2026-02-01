# lobs-mcp — Agent Guide

MCP (Model Context Protocol) server that gives Lobs access to Gmail and Google Calendar via a local HTTP bridge.

## Architecture
```
Lobs/OpenClaw → MCP Server (stdio) → HTTP Bridge (localhost:17381) → Google APIs
```

- **MCP Server** (`src/index.ts`): Exposes tools via MCP protocol over stdio
- **HTTP Bridge** (`src/bridgeHost.ts`): Runs as a separate process, handles Google API auth and calls
- **Bridge Client** (`src/httpClient.ts`): HTTP client that talks to the bridge

## Available MCP Tools
| Tool | Description | Access |
|------|-------------|--------|
| `bridge_ping` | Health check | — |
| `gmail_unread` | Fetch unread messages | Read |
| `gmail_search` | Search Gmail | Read |
| `gmail_mark_read` | Mark messages as read | Write |
| `calendar_list` | List available calendars | Read |
| `calendar_upcoming` | List upcoming events | Read |
| `calendar_create` | Create calendar event | Write (ACL) |
| `calendar_update` | Update calendar event | Write (ACL) |
| `calendar_delete` | Delete calendar event | Write (ACL) |

## Security
- Gmail: **read-only** (no send capability)
- Calendar: per-calendar ACL via `~/.config/lobs-mcp/calendar-acl.json`
- Bridge runs on localhost only (127.0.0.1)

## Build & Run
```bash
npm install
npm run build      # TypeScript → dist/
npm start          # Run MCP server
npm run dev        # Dev mode (tsx)
npm test           # Run tests
```

## Config Files
- `~/.config/lobs-mcp/google-credentials.json` — OAuth client
- `~/.config/lobs-mcp/google-token.json` — Auth token (created by `lobs-google-auth`)
- `~/.config/lobs-mcp/calendar-acl.json` — Per-calendar read/write permissions

## CLI Tools
```bash
lobs-bridge ping                    # Test bridge connection
lobs-bridge gmail-unread --max 10   # Check unread
lobs-bridge calendar-upcoming       # Next 72h events
lobs-google-auth                    # One-time OAuth setup
```

## Key Files
- `src/index.ts` — MCP tool definitions and handlers
- `src/bridgeHost.ts` — Bridge server (Google API calls)
- `src/httpClient.ts` — Bridge HTTP client
- `src/config.ts` — Environment/config loading
- `src/calendarAcl.ts` — Calendar permission enforcement
