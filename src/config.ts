import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type LobsConfig = {
  /** HTTP base URL for the local bridge (bind to 127.0.0.1 for internal-only access). */
  httpUrl: string;

  /** Optional bearer token for HTTP bridge. */
  authToken?: string;

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

  const httpUrl =
    process.env.LOBS_BRIDGE_HTTP_URL ??
    repoEnv.LOBS_BRIDGE_HTTP_URL ??
    userEnv.LOBS_BRIDGE_HTTP_URL ??
    // Default to localhost HTTP to avoid cross-user UDS permission issues.
    "http://127.0.0.1:17381";

  // UDS transport removed; HTTP only.

  const timeoutMsRaw =
    process.env.LOBS_BRIDGE_TIMEOUT_MS ??
    repoEnv.LOBS_BRIDGE_TIMEOUT_MS ??
    userEnv.LOBS_BRIDGE_TIMEOUT_MS ??
    "15000";

  const authToken =
    process.env.LOBS_BRIDGE_AUTH_TOKEN ??
    repoEnv.LOBS_BRIDGE_AUTH_TOKEN ??
    userEnv.LOBS_BRIDGE_AUTH_TOKEN ??
    undefined;

  const timeoutMs = Number(timeoutMsRaw);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Invalid LOBS_BRIDGE_TIMEOUT_MS: ${timeoutMsRaw}`);
  }

  return { httpUrl, authToken, timeoutMs };
}
