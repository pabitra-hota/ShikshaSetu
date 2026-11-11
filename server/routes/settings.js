import { Router } from "express";
import prisma from "../lib/db.js";
import { getSession } from "../lib/auth.js";
import { schoolSettingsSchema } from "../lib/validation.js";

const router = Router();

async function requireAdmin(req, res) {
  const session = await getSession(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (session.role !== "ADMIN") {
    res.status(403).json({ error: "Forbidden: Admin only" });
    return null;
  }
  return session;
}

router.get("/", async (req, res) => {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;
    const settings = await prisma.schoolSettings.upsert({
      where: { schoolId: session.schoolId },
      create: { schoolId: session.schoolId },
      update: {},
    });
    return res.json({ settings });
  } catch (error) {
    console.error("School settings GET error:", error);
    return res.status(500).json({ error: "Failed to load school settings" });
  }
});

router.patch("/", async (req, res) => {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;
    const parsed = schoolSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const settings = await prisma.schoolSettings.upsert({
      where: { schoolId: session.schoolId },
      create: { schoolId: session.schoolId, ...parsed.data },
      update: parsed.data,
    });
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("School settings PATCH error:", error);
    return res.status(500).json({ error: "Failed to save school settings" });
  }
});

export default router;
