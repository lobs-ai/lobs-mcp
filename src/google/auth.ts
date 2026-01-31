import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

import { google } from "googleapis";

export type GoogleAuthConfig = {
  credentialsPath: string;
  tokenPath: string;
  scopes: string[];
};

export function defaultGoogleAuthConfig(): GoogleAuthConfig {
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  const base = path.join(xdg, "lobs-mcp");

  return {
    credentialsPath:
      process.env.GOOGLE_CREDENTIALS_PATH ?? path.join(base, "google-credentials.json"),
    tokenPath: process.env.GOOGLE_TOKEN_PATH ?? path.join(base, "google-token.json"),
    scopes: [
      // Calendar read/write
      "https://www.googleapis.com/auth/calendar",
      // Gmail read + mark read/unread (labels)
      // No send scope.
      "https://www.googleapis.com/auth/gmail.modify",
    ],
  };
}

type InstalledCredentials = {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
};

function readJsonFile<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function ensureDirForFile(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function createOAuthClient(cfg: GoogleAuthConfig) {
  const creds = readJsonFile<InstalledCredentials>(cfg.credentialsPath);
  const block = creds.installed ?? creds.web;
  if (!block) {
    throw new Error(
      `Invalid Google credentials file (expected installed/web): ${cfg.credentialsPath}`,
    );
  }

  const redirect =
    process.env.GOOGLE_REDIRECT_URI ?? block.redirect_uris?.[0] ?? "urn:ietf:wg:oauth:2.0:oob";

  return new google.auth.OAuth2(block.client_id, block.client_secret, redirect);
}

export function loadSavedToken(cfg: GoogleAuthConfig): any | null {
  try {
    return readJsonFile<any>(cfg.tokenPath);
  } catch {
    return null;
  }
}

export function saveToken(cfg: GoogleAuthConfig, token: any) {
  ensureDirForFile(cfg.tokenPath);
  fs.writeFileSync(cfg.tokenPath, JSON.stringify(token, null, 2));
}

export async function getAuthedGoogleClient(cfg: GoogleAuthConfig) {
  const oAuth2Client = createOAuthClient(cfg);

  const token = loadSavedToken(cfg);
  if (!token) {
    throw new Error(
      `Google token missing. Run: node dist/googleAuthCli.js (or npm run build && node dist/googleAuthCli.js)
Credentials: ${cfg.credentialsPath}
Token: ${cfg.tokenPath}`,
    );
  }

  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

export async function interactiveLogin(cfg: GoogleAuthConfig): Promise<void> {
  const oAuth2Client = createOAuthClient(cfg);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: cfg.scopes,
  });

  // eslint-disable-next-line no-console
  console.error("Open this URL in your browser, then paste the code here:\n");
  // eslint-disable-next-line no-console
  console.error(authUrl + "\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const code: string = await new Promise((resolve) => rl.question("Code: ", resolve));
  rl.close();

  const { tokens } = await oAuth2Client.getToken(code.trim());
  saveToken(cfg, tokens);

  // eslint-disable-next-line no-console
  console.error(`Saved token to: ${cfg.tokenPath}`);
}
