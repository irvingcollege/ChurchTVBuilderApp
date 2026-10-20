// Capture local development credentials directly to an ignored file, without printing values.
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
if (existsSync(".env"))
  throw new Error(".env already exists; refusing to overwrite it.");
const cli = process.env.SUPABASE_CLI || "supabase";
const config = JSON.parse(
  execFileSync(cli, ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const url = config.API_URL;
if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Only a local Supabase stack is supported by this helper.");
if (!config.ANON_KEY || !config.SERVICE_ROLE_KEY)
  throw new Error("Local API keys missing");
writeFileSync(
  ".env",
  `SUPABASE_URL=${url}\nSUPABASE_ANON_KEY=${config.ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${config.SERVICE_ROLE_KEY}\nSITE_URL=http://localhost:4321\nEMAIL_PROVIDER=development\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created private .env with local Supabase settings. No production credentials were used.",
);
