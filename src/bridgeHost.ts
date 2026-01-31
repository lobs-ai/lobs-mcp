#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import type { BridgeRequest, BridgeResponse } from "./udsClient.js";
import { loadConfig } from "./config.js";

type Handler = (params: any) => Promise<any> | any;

function parseMode(mode: string | undefined, fallback: number): number {
  if (!mode) return fallback;
  // Accept "666", "0666", "0o666"
  const m = mode.startsWith("0o") ? mode.slice(2) : mode;
  const n = Number.parseInt(m, 8);
  return Number.isFinite(n) ? n : fallback;
}

const cfg = loadConfig();
const SOCKET_PATH = cfg.socketPath;
const SOCKET_MODE = parseMode(process.env.LOBS_BRIDGE_SOCKET_MODE, 0o666);

// Minimal handlers so end-to-end wiring can be validated.
// Replace these with real Gmail/Calendar implementation.
const handlers: Record<string, Handler> = {
  ping: async () => ({ ok: true, ts: Date.now() }),

  "gmail.unread": async () => {
    throw Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
    });
  },
  "gmail.search": async () => {
    throw Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
    });
  },
  "calendar.upcoming": async () => {
    throw Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
    });
  },
  "calendar.create": async () => {
    throw Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
    });
  },
  "calendar.update": async () => {
    throw Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
    });
  },
  "calendar.delete": async () => {
    throw Object.assign(new Error("Not implemented"), {
      code: "NOT_IMPLEMENTED",
    });
  },
};

function safeUnlinkSocket(p: string) {
  try {
    const st = fs.lstatSync(p);
    if (st.isSocket()) fs.unlinkSync(p);
  } catch {
    // ignore
  }
}

function ensureParentDir(p: string) {
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
}

function encodeError(err: any): { code: string; message: string } {
  const code = String(err?.code ?? "INTERNAL_ERROR");
  const message = String(err?.message ?? String(err));
  return { code, message };
}

function handleLine(line: string): Promise<string> {
  let req: BridgeRequest;
  try {
    req = JSON.parse(line) as BridgeRequest;
  } catch {
    const res: BridgeResponse = {
      id: "?",
      ok: false,
      error: { code: "INVALID_JSON", message: "Invalid JSON" },
    };
    return Promise.resolve(JSON.stringify(res));
  }

  const id = String(req.id ?? "?");
  const method = String(req.method ?? "");
  const handler = handlers[method];

  if (!handler) {
    const res: BridgeResponse = {
      id,
      ok: false,
      error: { code: "METHOD_NOT_FOUND", message: `Unknown method: ${method}` },
    };
    return Promise.resolve(JSON.stringify(res));
  }

  return Promise.resolve()
    .then(() => handler(req.params))
    .then((result) => {
      const res: BridgeResponse = { id, ok: true, result };
      return JSON.stringify(res);
    })
    .catch((err) => {
      const e = encodeError(err);
      const res: BridgeResponse = { id, ok: false, error: e };
      return JSON.stringify(res);
    });
}

async function main() {
  ensureParentDir(SOCKET_PATH);
  safeUnlinkSocket(SOCKET_PATH);

  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk;
      while (true) {
        const idx = buffer.indexOf("\n");
        if (idx === -1) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;

        handleLine(line)
          .then((outLine) => {
            socket.write(outLine + "\n");
          })
          .catch(() => {
            // swallow
          });
      }
    });
  });

  server.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[gcal-bridge] server error:", err);
    process.exit(1);
  });

  server.listen(SOCKET_PATH, () => {
    try {
      fs.chmodSync(SOCKET_PATH, SOCKET_MODE);
    } catch {
      // ignore
    }

    // eslint-disable-next-line no-console
    console.error(
      `[gcal-bridge] listening on ${SOCKET_PATH} (mode=${SOCKET_MODE.toString(8)})`,
    );
  });

  const shutdown = () => {
    try {
      server.close();
    } catch {
      // ignore
    }
    safeUnlinkSocket(SOCKET_PATH);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
