#!/usr/bin/env node
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import type { BridgeRequest, BridgeResponse } from "./udsClient.js";
import { loadConfig } from "./config.js";
import { loadCalendarAcl, requireCalendarPerm } from "./calendarAcl.js";

type Handler = (params: any) => Promise<any> | any;

type LogLevel = "silent" | "error" | "info" | "debug";

const LOG_LEVEL = (process.env.LOBS_BRIDGE_LOG_LEVEL ?? "info") as LogLevel;

function shouldLog(level: Exclude<LogLevel, "silent">): boolean {
  const order: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    info: 2,
    debug: 3,
  };
  return order[LOG_LEVEL] >= order[level];
}

function logInfo(msg: string, meta?: any) {
  if (!shouldLog("info")) return;
  // eslint-disable-next-line no-console
  console.error(`[gcal-bridge] ${msg}`, meta ?? "");
}

function logDebug(msg: string, meta?: any) {
  if (!shouldLog("debug")) return;
  // eslint-disable-next-line no-console
  console.error(`[gcal-bridge][debug] ${msg}`, meta ?? "");
}

function logError(msg: string, meta?: any) {
  if (!shouldLog("error")) return;
  // eslint-disable-next-line no-console
  console.error(`[gcal-bridge][error] ${msg}`, meta ?? "");
}

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
const CAL_ACL = loadCalendarAcl();

// Google backend
import { defaultGoogleAuthConfig, getAuthedGoogleClient } from "./google/auth.js";
import { gmailMarkRead, gmailSearch, gmailUnread } from "./google/gmail.js";
import {
  calendarCreate,
  calendarDelete,
  calendarList,
  calendarUpcoming,
  calendarUpdate,
} from "./google/calendar.js";

async function withGoogle<T>(fn: (auth: any) => Promise<T>): Promise<T> {
  const cfg = defaultGoogleAuthConfig();
  const auth = await getAuthedGoogleClient(cfg);
  return await fn(auth);
}

const handlers: Record<string, Handler> = {
  ping: async () => ({ ok: true, ts: Date.now() }),

  // Gmail
  "gmail.unread": async (params: any) => {
    const max = Number(params?.max ?? 20);
    return await withGoogle((auth) => gmailUnread(auth, max));
  },
  "gmail.search": async (params: any) => {
    const q = String(params?.q ?? "");
    const max = Number(params?.max ?? 20);
    return await withGoogle((auth) => gmailSearch(auth, q, max));
  },
  "gmail.markRead": async (params: any) => {
    const ids = Array.isArray(params?.messageIds) ? params.messageIds : [];
    return await withGoogle((auth) => gmailMarkRead(auth, ids));
  },

  // Calendar
  "calendar.list": async () => {
    // List available calendars (always read-level operation)
    return await withGoogle((auth) => calendarList(auth));
  },
  "calendar.upcoming": async (params: any) => {
    const hours = Number(params?.hours ?? 72);
    const tz = String(params?.tz ?? "America/New_York");
    const calendarId = params?.calendarId ? String(params.calendarId) : "primary";
    requireCalendarPerm(CAL_ACL, calendarId, "read");
    return await withGoogle((auth) => calendarUpcoming(auth, hours, tz, calendarId));
  },
  "calendar.create": async (params: any) => {
    const calendarId = params?.calendarId ? String(params.calendarId) : "primary";
    requireCalendarPerm(CAL_ACL, calendarId, "write");
    const event = params?.event;
    return await withGoogle((auth) => calendarCreate(auth, event, calendarId));
  },
  "calendar.update": async (params: any) => {
    const calendarId = params?.calendarId ? String(params.calendarId) : "primary";
    requireCalendarPerm(CAL_ACL, calendarId, "write");
    const eventId = String(params?.eventId ?? "");
    const patch = params?.patch;
    return await withGoogle((auth) => calendarUpdate(auth, eventId, patch, calendarId));
  },
  "calendar.delete": async (params: any) => {
    const calendarId = params?.calendarId ? String(params.calendarId) : "primary";
    requireCalendarPerm(CAL_ACL, calendarId, "write");
    const eventId = String(params?.eventId ?? "");
    return await withGoogle((auth) => calendarDelete(auth, eventId, calendarId));
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
    logError("invalid json", { line: line.slice(0, 500) });
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
    logInfo("method not found", { id, method });
    return Promise.resolve(JSON.stringify(res));
  }

  const started = Date.now();
  logDebug("request", { id, method });

  return Promise.resolve()
    .then(() => handler(req.params))
    .then((result) => {
      const ms = Date.now() - started;
      logInfo("ok", { id, method, ms });
      const res: BridgeResponse = { id, ok: true, result };
      return JSON.stringify(res);
    })
    .catch((err) => {
      const ms = Date.now() - started;
      const e = encodeError(err);
      logError("error", { id, method, ms, error: e });
      const res: BridgeResponse = { id, ok: false, error: e };
      return JSON.stringify(res);
    });
}

async function main() {
  logInfo("starting", { socket: SOCKET_PATH, logLevel: LOG_LEVEL });

  ensureParentDir(SOCKET_PATH);
  safeUnlinkSocket(SOCKET_PATH);

  const server = net.createServer((socket) => {
    const remote = `${socket.remoteAddress ?? "local"}`;
    logInfo("client connected", { remote });

    socket.setEncoding("utf8");
    let buffer = "";

    socket.on("error", (err) => {
      logError("client socket error", { remote, err: String(err) });
    });

    socket.on("end", () => {
      logInfo("client disconnected", { remote });
    });

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
          .catch((err) => {
            logError("failed to handle line", { err: String(err) });
          });
      }
    });
  });

  server.on("error", (err) => {
    logError("server error", err);
    process.exit(1);
  });

  server.listen(SOCKET_PATH, () => {
    try {
      fs.chmodSync(SOCKET_PATH, SOCKET_MODE);
    } catch {
      // ignore
    }

    logInfo("listening", {
      socket: SOCKET_PATH,
      mode: SOCKET_MODE.toString(8),
    });
  });

  const shutdown = (signal: string) => {
    logInfo("shutdown", { signal });
    try {
      server.close();
    } catch {
      // ignore
    }
    safeUnlinkSocket(SOCKET_PATH);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
