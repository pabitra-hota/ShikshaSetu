import { Router } from "express";
import { ensureSchoolRoutine } from "../../prisma/seed-school-routine.js";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";

const router = Router();

router.post("/school-routine", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN") return res.status(403).json({ error: "Principal access only" });

    const result = await ensureSchoolRoutine(prisma, session.schoolId);
    return res.json({
      success: true,
      classesAdded: result.classes,
      teachersReady: result.teachers,
      studentsAdded: result.students,
      periodsAdded: result.periods,
      existingPeriods: result.existingPeriods,
      conflicts: result.conflicts,
    });
  } catch (error) {
    console.error("School routine setup error:", error);
    return res.status(500).json({ error: "Could not load the school classes, teachers, and timetable. Check the database connection and try again." });
  }
});

export default router;
