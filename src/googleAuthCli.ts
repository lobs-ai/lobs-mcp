#!/usr/bin/env node
import { defaultGoogleAuthConfig, interactiveLogin } from "./google/auth.js";

async function main() {
  const cfg = defaultGoogleAuthConfig();
  await interactiveLogin(cfg);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack ?? String(err));
  process.exit(1);
});
