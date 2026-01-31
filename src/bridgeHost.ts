#!/usr/bin/env node
import http from "node:http";

import { loadConfig } from "./config.js";
import {
  loadCalendarAcl,
  permForCalendar,
  requireCalendarPerm,
} from "./calendarAcl.js";

type Handler = (params: any) => Promise<any> | any;

type LogLevel = "silent" | "error" | "info" | "debug";

type BridgeRequest = { id: string; method: string; params?: any };
type BridgeResponse =
  | { id: string; ok: true; result: any }
  | { id: string; ok: false; error: { code: string; message: string } };

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

const cfg = loadConfig();
const BASE_URL = cfg.httpUrl;
const url = new URL(BASE_URL);
const HOST = url.hostname || "127.0.0.1";
const PORT = Number(url.port || "80");
const AUTH_TOKEN = cfg.authToken;

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
  const gcfg = defaultGoogleAuthConfig();
  const auth = await getAuthedGoogleClient(gcfg);
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
    const items = await withGoogle((auth) => calendarList(auth));
    return items.map((c: any) => {
      const id = String(c?.id ?? "");
      return {
        ...c,
        lobsPerm: id ? permForCalendar(CAL_ACL, id) : CAL_ACL.default ?? "read",
      };
    });
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

function encodeError(err: any): { code: string; message: string } {
  const code = String(err?.code ?? "INTERNAL_ERROR");
  const message = String(err?.message ?? String(err));
  return { code, message };
}

async function readJson(req: http.IncomingMessage, maxBytes = 1_000_000): Promise<any> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw Object.assign(new Error("Request too large"), { code: "REQUEST_TOO_LARGE" });
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { code: "INVALID_JSON" });
  }
}

function checkAuth(req: http.IncomingMessage): boolean {
  if (!AUTH_TOKEN) return true;
  const h = String(req.headers["authorization"] ?? "");
  return h === `Bearer ${AUTH_TOKEN}`;
}

async function handleCall(body: any): Promise<BridgeResponse> {
  const req = body as BridgeRequest;
  const id = String(req?.id ?? "?");
  const method = String(req?.method ?? "");

  const handler = handlers[method];
  if (!handler) {
    return {
      id,
      ok: false,
      error: { code: "METHOD_NOT_FOUND", message: `Unknown method: ${method}` },
    };
  }

  const started = Date.now();
  logDebug("request", { id, method });

  try {
    const result = await handler(req.params);
    const ms = Date.now() - started;
    logInfo("ok", { id, method, ms });
    return { id, ok: true, result };
  } catch (err: any) {
    const ms = Date.now() - started;
    const e = encodeError(err);
    logError("error", { id, method, ms, error: e });
    return { id, ok: false, error: e };
  }
}

async function main() {
  logInfo("starting", { httpUrl: BASE_URL, logLevel: LOG_LEVEL, auth: AUTH_TOKEN ? "bearer" : "none" });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "POST" && req.url === "/call") {
        if (!checkAuth(req)) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
          return;
        }

        const body = await readJson(req);
        const out = await handleCall(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(out));
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
    } catch (err: any) {
      const e = encodeError(err);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e }));
    }
  });

  server.on("error", (err) => {
    logError("server error", err);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    logInfo("listening", { httpUrl: BASE_URL });
  });

  const shutdown = (signal: string) => {
    logInfo("shutdown", { signal });
    try {
      server.close();
    } catch {
      // ignore
    }
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
