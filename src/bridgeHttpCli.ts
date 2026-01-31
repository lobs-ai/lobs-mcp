#!/usr/bin/env node
/**
 * lobs-bridge: CLI wrapper for the localhost HTTP bridge.
 *
 * Goal: you pass a tool name + minimal args; the CLI knows where to send the request.
 */

import fs from "node:fs/promises";

import { loadConfig } from "./config.js";
import { HttpBridgeClient } from "./httpClient.js";

type ToolHandler = (argv: string[]) => Promise<any>;

type GlobalFlags = {
  jsonOut: boolean;
  httpUrl?: string;
  timeoutMs?: number;
  authToken?: string;
};

function die(msg: string, code = 2): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(code);
}

function popFlag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (!v || v.startsWith("-")) die(`Missing value for ${name}`);
  argv.splice(i, 2);
  return v;
}

function popFlagNumber(argv: string[], name: string): number | undefined {
  const v = popFlag(argv, name);
  if (v == null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) die(`Invalid number for ${name}: ${JSON.stringify(v)}`);
  return n;
}

function hasFlag(argv: string[], name: string): boolean {
  const i = argv.indexOf(name);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
}

async function readStdin(): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

/**
 * Accepts:
 * - inline JSON: '{"a":1}'
 * - file JSON:   '@/path/to/file.json'
 * - stdin JSON:  '-'
 */
async function readJsonArg(raw: string): Promise<any> {
  const text = raw === "-" ? await readStdin() : raw.startsWith("@") ? await fs.readFile(raw.slice(1), "utf8") : raw;

  try {
    return JSON.parse(text);
  } catch (err: any) {
    die(`Invalid JSON (${raw === "-" ? "stdin" : JSON.stringify(raw)}): ${err?.message ?? String(err)}`);
  }
}

function usage(code = 2): never {
  die(
    [
      "Usage: lobs-bridge [global flags] <tool> [args]",
      "",
      "Global flags:",
      "  --url <http://127.0.0.1:17381>     Override bridge URL",
      "  --timeout-ms <ms>                 Override request timeout",
      "  --token <token>                   Override auth token (if configured)",
      "  --json                            JSON output (pretty)",
      "  -h, --help                        Show help",
      "",
      "Tools:",
      "  ping",
      "  health",
      "  gmail-unread [--max N]",
      "  gmail-search <query> [--max N]",
      "  gmail-mark-read <id...>",
      "  calendar-list",
      "  calendar-upcoming [--hours H] [--tz TZ] [--calendar CAL_ID]",
      "  calendar-create --event-json <json|@file|-> [--calendar CAL_ID]",
      "  calendar-update <eventId> --patch-json <json|@file|-> [--calendar CAL_ID]",
      "  calendar-delete <eventId> [--calendar CAL_ID]",
      "",
      "Advanced:",
      "  call <method> [--params-json <json|@file|->]",
      "",
      "Examples:",
      "  lobs-bridge ping",
      "  lobs-bridge gmail-search 'is:unread newer_than:7d' --max 20",
      "  lobs-bridge calendar-upcoming --hours 48 --tz 'America/New_York'",
      "  lobs-bridge calendar-create --event-json @event.json",
      "  echo '{\"hours\":48,\"tz\":\"America/New_York\"}' | lobs-bridge call calendar.upcoming --params-json -",
      "",
    ].join("\n"),
    code,
  );
}

function parseGlobalFlags(argv: string[]): GlobalFlags {
  if (hasFlag(argv, "-h") || hasFlag(argv, "--help")) usage(0);

  const url = popFlag(argv, "--url");
  const timeoutMs = popFlagNumber(argv, "--timeout-ms");
  const token = popFlag(argv, "--token");
  const jsonOut = hasFlag(argv, "--json");

  return { jsonOut, httpUrl: url, timeoutMs, authToken: token };
}

async function main() {
  const argv = process.argv.slice(2);
  const flags = parseGlobalFlags(argv);

  const tool = argv.shift();
  if (!tool || tool === "help") usage(0);

  const cfg = loadConfig();
  const bridge = new HttpBridgeClient(
    flags.httpUrl ?? cfg.httpUrl,
    flags.timeoutMs ?? cfg.timeoutMs,
    flags.authToken ?? cfg.authToken,
  );

  const tools: Record<string, ToolHandler> = {
    ping: async (toolArgv) => {
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      return bridge.call("ping");
    },

    health: async (toolArgv) => {
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      return bridge.health();
    },

    "gmail-unread": async (toolArgv) => {
      const max = Number(popFlag(toolArgv, "--max") ?? "20");
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      return bridge.call("gmail.unread", { max });
    },

    "gmail-search": async (toolArgv) => {
      const q = toolArgv.shift();
      if (!q) die("gmail-search requires <query>");
      const max = Number(popFlag(toolArgv, "--max") ?? "20");
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      return bridge.call("gmail.search", { q, max });
    },

    "gmail-mark-read": async (toolArgv) => {
      if (toolArgv.length === 0) die("gmail-mark-read requires at least one message id");
      const messageIds = toolArgv.splice(0);
      return bridge.call("gmail.markRead", { messageIds });
    },

    "calendar-list": async (toolArgv) => {
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      return bridge.call("calendar.list");
    },

    "calendar-upcoming": async (toolArgv) => {
      const hours = Number(popFlag(toolArgv, "--hours") ?? "72");
      const tz = popFlag(toolArgv, "--tz") ?? process.env.TZ ?? "America/New_York";
      const calendarId = popFlag(toolArgv, "--calendar");
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      return bridge.call("calendar.upcoming", { hours, tz, calendarId });
    },

    "calendar-create": async (toolArgv) => {
      const calendarId = popFlag(toolArgv, "--calendar");
      const eventJson = popFlag(toolArgv, "--event-json");
      if (!eventJson) die("calendar-create requires --event-json <json|@file|->");
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      const event = await readJsonArg(eventJson);
      return bridge.call("calendar.create", { calendarId, event });
    },

    "calendar-update": async (toolArgv) => {
      const eventId = toolArgv.shift();
      if (!eventId) die("calendar-update requires <eventId>");
      const calendarId = popFlag(toolArgv, "--calendar");
      const patchJson = popFlag(toolArgv, "--patch-json");
      if (!patchJson) die("calendar-update requires --patch-json <json|@file|->");
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      const patch = await readJsonArg(patchJson);
      return bridge.call("calendar.update", { calendarId, eventId, patch });
    },

    "calendar-delete": async (toolArgv) => {
      const eventId = toolArgv.shift();
      if (!eventId) die("calendar-delete requires <eventId>");
      const calendarId = popFlag(toolArgv, "--calendar");
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      return bridge.call("calendar.delete", { calendarId, eventId });
    },

    call: async (toolArgv) => {
      const method = toolArgv.shift();
      if (!method) die("call requires <method>");
      const paramsJson = popFlag(toolArgv, "--params-json");
      if (toolArgv.length) die(`Unexpected extra args: ${toolArgv.join(" ")}`);
      const params = paramsJson ? await readJsonArg(paramsJson) : undefined;
      return bridge.call(method, params);
    },
  };

  const fn = tools[tool];
  if (!fn) usage();

  const out = await fn(argv);

  // eslint-disable-next-line no-console
  console.log(flags.jsonOut ? JSON.stringify(out, null, 2) : typeof out === "string" ? out : JSON.stringify(out));
}

main().catch((err: any) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
