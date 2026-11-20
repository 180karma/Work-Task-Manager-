// Copies the public Supabase URL, anon key and invoice scraper address from .env into js/config.js.
// The service-role key is left in .env and never written for the browser.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
if (!existsSync(envPath)) {
  console.error("Missing .env. Copy .env.example to .env and fill in the keys.");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq < 0) continue;
  let value = trimmed.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[trimmed.slice(0, eq).trim()] = value;
}

const config = `// Public Supabase settings for the browser.
// Written by scripts/sync-config.mjs from .env.
// The service-role key is never copied here.
window.WTM_CONFIG = {
  url: ${JSON.stringify(env.SUPABASE_URL || "")},
  anonKey: ${JSON.stringify(env.SUPABASE_ANON_KEY || "")},
  invoicesUrl: ${JSON.stringify(env.INVOICE_SCRAPER_URL ?? "invoice-scraper/invoice_scraper.html")},
};
`;

writeFileSync(join(root, "js", "config.js"), config);
console.log("Wrote js/config.js (public URL and anon key only).");
