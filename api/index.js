import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tmpDb = "/tmp/prod.db";

// Set DATABASE_URL FIRST — before anything else loads
process.env.DATABASE_URL = `file:${tmpDb}`;

// On cold start: if no DB in /tmp, create and seed it
if (!existsSync(tmpDb)) {
  console.log("🗄️ Cold start — initializing SQLite database in /tmp...");
  try {
    // Use the prisma binary from node_modules directly (npx not available on Vercel runtime)
    const prismaBin = join(root, "node_modules", ".bin", "prisma");
    const schemaPath = join(root, "prisma", "schema.prisma");

    execSync(`node "${prismaBin}" db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
      stdio: "pipe",
      cwd: root,
      env: { ...process.env, DATABASE_URL: `file:${tmpDb}` },
    });
    console.log("✅ Schema pushed to /tmp/prod.db");

    const seedPath = join(root, "prisma", "seed.js");
    execSync(`node "${seedPath}"`, {
      stdio: "pipe",
      cwd: root,
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
