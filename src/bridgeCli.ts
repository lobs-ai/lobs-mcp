#!/usr/bin/env node
import { UdsBridgeClient } from "./udsClient.js";

function usage(): never {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  lobs-bridge <method> [--params '<json>'] [--socket <path>] [--timeout-ms <n>]",
      "",
      "Examples:",
      "  lobs-bridge ping",
      "  lobs-bridge gmail.unread --params '{" + '"max":10' + "}'",
      "  lobs-bridge calendar.upcoming --params '{" +
        '"hours":48,"tz":"America/New_York"' +
        "}'",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const out: {
    method?: string;
    params?: unknown;
    socketPath?: string;
    timeoutMs?: number;
  } = {};

  const args = [...argv];
  out.method = args.shift();
  while (args.length) {
    const a = args.shift();
    if (!a) break;
    if (a === "--params") {
      const json = args.shift();
      if (!json) usage();
      out.params = JSON.parse(json);
      continue;
    }
    if (a === "--socket") {
      out.socketPath = args.shift();
      if (!out.socketPath) usage();
      continue;
    }
    if (a === "--timeout-ms") {
      const v = args.shift();
      if (!v) usage();
      out.timeoutMs = Number(v);
      continue;
    }
    if (a === "-h" || a === "--help") usage();

    // Unknown arg
    usage();
  }

  if (!out.method) usage();
  return out;
}

async function main() {
  const { method, params, socketPath, timeoutMs } = parseArgs(
    process.argv.slice(2),
  );

  const SOCKET_PATH =
    socketPath ?? process.env.LOBS_BRIDGE_SOCKET ?? "/run/gcal-bridge/bridge.sock";
  const TIMEOUT_MS = Number(
    timeoutMs ?? process.env.LOBS_BRIDGE_TIMEOUT_MS ?? 15_000,
  );

  const bridge = new UdsBridgeClient(SOCKET_PATH, TIMEOUT_MS);
  const result = await bridge.call(method!, params);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
