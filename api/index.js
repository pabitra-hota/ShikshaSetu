import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDb = "/tmp/prod.db";

// Set DATABASE_URL FIRST — before anything else loads
process.env.DATABASE_URL = `file:${tmpDb}`;

// On cold start: if no DB in /tmp, create and seed it
if (!existsSync(tmpDb)) {
  console.log("🗄️ Cold start — initializing SQLite database in /tmp...");
  try {
    const schemaPath = join(__dirname, "..", "prisma", "schema.prisma");
    execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: `file:${tmpDb}` },
    });
    console.log("✅ Schema pushed to /tmp/prod.db");

    const seedPath = join(__dirname, "..", "prisma", "seed.js");
    execSync(`node "${seedPath}"`, {
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: `file:${tmpDb}` },
    });
    console.log("✅ Database seeded");
  } catch (err) {
    console.error("❌ DB init error:", err.stderr?.toString() || err.message);
  }
}

// Now import the Express app (Prisma will use DATABASE_URL = file:/tmp/prod.db)
const { default: app } = await import("../server/index.js");

export default app;
