import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import authRouter from "./routes/auth.js";
import studentsRouter from "./routes/students.js";
import classesRouter from "./routes/classes.js";
import teachersRouter from "./routes/teachers.js";
import attendanceRouter from "./routes/attendance.js";
import timetableRouter from "./routes/timetable.js";
import reportsRouter from "./routes/reports.js";
import syncRouter from "./routes/sync.js";
import settingsRouter from "./routes/settings.js";
import dashboardRouter from "./routes/dashboard.js";
import setupRouter from "./routes/setup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/students", studentsRouter);
app.use("/api/classes", classesRouter);
app.use("/api/teachers", teachersRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/sync", syncRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/setup", setupRouter);

// Serve the built React frontend in production.
const distDir = path.resolve(__dirname, "..", "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// Unknown API routes.
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler.
app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 4000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ ShikshaSetu API server listening on http://localhost:${PORT}`);
  });
}

export default app;
