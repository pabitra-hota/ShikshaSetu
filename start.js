#!/usr/bin/env node
// start.js — Production startup script
// Creates the SQLite DB at runtime (Render's filesystem is ephemeral)
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve the DB path from DATABASE_URL (e.g. "file:./data/prod.db")
const dbUrl = process.env.DATABASE_URL || "file:./data/prod.db";
const dbRelative = dbUrl.replace("file:", "");
const dbPath = path.resolve(__dirname, dbRelative);
const dbDir = path.dirname(dbPath);

// Ensure the directory exists
if (!existsSync(dbDir)) {
  execSync(`mkdir -p "${dbDir}"`);
  console.log(`📁 Created DB directory: ${dbDir}`);
}

// If the DB file doesn't exist, push the schema and seed
if (!existsSync(dbPath)) {
  console.log("🗄️  Database not found — initializing...");
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  console.log("✅ Schema pushed.");
  try {
    execSync("node prisma/seed.js", { stdio: "inherit" });
    console.log("✅ Database seeded.");
  } catch (e) {
    console.warn("⚠️  Seeding skipped or failed (non-fatal):", e.message);
  }
} else {
  console.log("✅ Database already exists, skipping init.");
}

// Now start the actual server
console.log("🚀 Starting ShikshaSetu server...");
import("./server/index.js");

