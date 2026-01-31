import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type LobsConfig = {
  socketPath: string;
  timeoutMs: number;
};

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function readOptionalEnvFile(filePath: string): Record<string, string> {
  try {
    const s = fs.readFileSync(filePath, "utf8");
    return parseEnvFile(s);
  } catch {
    return {};
  }
}

export function loadConfig(): LobsConfig {
  const repoEnv = readOptionalEnvFile(path.resolve(process.cwd(), ".env"));

  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  const configEnvPath = path.join(xdg, "lobs-mcp", "config.env");
  const userEnv = readOptionalEnvFile(configEnvPath);

  const socketPath =
    process.env.LOBS_BRIDGE_SOCKET ??
    repoEnv.LOBS_BRIDGE_SOCKET ??
    userEnv.LOBS_BRIDGE_SOCKET ??
    "/run/gcal-bridge/bridge.sock";

  const timeoutMsRaw =
    process.env.LOBS_BRIDGE_TIMEOUT_MS ??
    repoEnv.LOBS_BRIDGE_TIMEOUT_MS ??
    userEnv.LOBS_BRIDGE_TIMEOUT_MS ??
    "15000";

  const timeoutMs = Number(timeoutMsRaw);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid LOBS_BRIDGE_TIMEOUT_MS: ${timeoutMsRaw}`);
  }

  return { socketPath, timeoutMs };
}
