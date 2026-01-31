#!/usr/bin/env node
// Deprecated legacy CLI for the old UDS bridge transport.
// Kept as a stub so existing installs fail loudly rather than silently doing the wrong thing.
// Use: curl http://127.0.0.1:17381/health (or ./bin/mcp-ping)

// eslint-disable-next-line no-console
console.error(
  "lobs-bridge has been removed (UDS transport deprecated). Use the HTTP bridge (/health, /call) or ./bin/mcp-ping.",
);
process.exit(2);
