import { copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// On Vercel cold start: copy the pre-built seed DB to writable /tmp
const tmpDb = "/tmp/prod.db";
if (!existsSync(tmpDb)) {
  const seedDb = join(__dirname, "..", "data", "seed.db");
  if (existsSync(seedDb)) {
    copyFileSync(seedDb, tmpDb);
    console.log("📋 Copied seed database to /tmp");
  } else {
    console.warn("⚠️ No seed.db found at", seedDb);
  }
}

// Point Prisma to the writable /tmp database
process.env.DATABASE_URL = "file:/tmp/prod.db";

// Dynamic import so DATABASE_URL is set before Prisma initialises
const { default: app } = await import("../server/index.js");

export default app;

