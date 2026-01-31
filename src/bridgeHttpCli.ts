#!/usr/bin/env node
/**
 * lobs-bridge: CLI wrapper for the localhost HTTP bridge.
 *
 * Goal: you pass a tool name + minimal args; the CLI knows where to send the request.
 */

import { loadConfig } from "./config.js";
import { HttpBridgeClient } from "./httpClient.js";

type ToolHandler = (argv: string[]) => Promise<any>;

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

function hasFlag(argv: string[], name: string): boolean {
  const i = argv.indexOf(name);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
}

function usage(): never {
  die(
    [
      "Usage: lobs-bridge <tool> [args]",
      "",
      "Tools:",
      "  ping",
      "  gmail-unread [--max N]",
      "  gmail-search <query> [--max N]",
      "  gmail-mark-read <id...>",
      "  calendar-list",
      "  calendar-upcoming [--hours H] [--tz TZ] [--calendar CAL_ID]",
      "  calendar-create --event-json <json> [--calendar CAL_ID]",
      "  calendar-update <eventId> --patch-json <json> [--calendar CAL_ID]",
      "  calendar-delete <eventId> [--calendar CAL_ID]",
      "",
      "Advanced:",
      "  call <method> [--params-json <json>]",
      "",
    ].join("\n"),
    2,
  );
}

async function main() {
  const cfg = loadConfig();
  const bridge = new HttpBridgeClient(cfg.httpUrl, cfg.timeoutMs, cfg.authToken);

  const argv = process.argv.slice(2);
  const tool = argv.shift();
  if (!tool) usage();

  const jsonOut = hasFlag(argv, "--json");

  const tools: Record<string, ToolHandler> = {
    ping: async () => bridge.call("ping"),

    "gmail-unread": async () => {
      const max = Number(popFlag(argv, "--max") ?? "20");
      return bridge.call("gmail.unread", { max });
    },

    "gmail-search": async () => {
      const q = argv.shift();
      if (!q) die("gmail-search requires <query>");
      const max = Number(popFlag(argv, "--max") ?? "20");
      return bridge.call("gmail.search", { q, max });
    },

    "gmail-mark-read": async () => {
      if (argv.length === 0) die("gmail-mark-read requires at least one message id");
      const messageIds = argv.splice(0);
      return bridge.call("gmail.markRead", { messageIds });
    },

    "calendar-list": async () => bridge.call("calendar.list"),

    "calendar-upcoming": async () => {
      const hours = Number(popFlag(argv, "--hours") ?? "72");
      const tz = popFlag(argv, "--tz") ?? "America/New_York";
      const calendarId = popFlag(argv, "--calendar");
      return bridge.call("calendar.upcoming", { hours, tz, calendarId });
    },

    "calendar-create": async () => {
      const calendarId = popFlag(argv, "--calendar");
      const eventJson = popFlag(argv, "--event-json");
      if (!eventJson) die("calendar-create requires --event-json <json>");
      const event = JSON.parse(eventJson);
      return bridge.call("calendar.create", { calendarId, event });
    },

    "calendar-update": async () => {
      const eventId = argv.shift();
      if (!eventId) die("calendar-update requires <eventId>");
      const calendarId = popFlag(argv, "--calendar");
      const patchJson = popFlag(argv, "--patch-json");
      if (!patchJson) die("calendar-update requires --patch-json <json>");
      const patch = JSON.parse(patchJson);
      return bridge.call("calendar.update", { calendarId, eventId, patch });
    },

    "calendar-delete": async () => {
      const eventId = argv.shift();
      if (!eventId) die("calendar-delete requires <eventId>");
      const calendarId = popFlag(argv, "--calendar");
      return bridge.call("calendar.delete", { calendarId, eventId });
    },

    call: async () => {
      const method = argv.shift();
      if (!method) die("call requires <method>");
      const paramsJson = popFlag(argv, "--params-json");
      const params = paramsJson ? JSON.parse(paramsJson) : undefined;
      return bridge.call(method, params);
    },
  };

  const fn = tools[tool];
  if (!fn) usage();

  if (argv.length && tool !== "call") {
    // Guardrail: avoid silently ignoring typos.
    die(`Unexpected extra args: ${argv.join(" ")}`);
  }

  const out = await fn(process.argv.slice(2));

  if (jsonOut) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  }
}

main().catch((err: any) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
