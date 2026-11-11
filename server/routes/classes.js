import { Router } from "express";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";
import { classSchema } from "../lib/validation.js";
import { classAccessWhere, getAccessScope, sectionAccessWhere } from "../lib/access.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const scope = await getAccessScope(session);
    const classes = await prisma.class.findMany({
      where: { schoolId: session.schoolId, ...classAccessWhere(scope) },
      include: {
        sections: {
          where: sectionAccessWhere(scope),
          include: {
            classTeacher: {
              include: { user: { select: { name: true } } },
            },
            _count: {
              select: { enrollments: true },
            },
          },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { gradeLevel: "asc" },
    });
    const formatted = classes.map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      schoolId: c.schoolId,
      sections: c.sections.map((s) => ({
        id: s.id,
        name: s.name,
        classTeacherId: s.classTeacherId,
        classTeacherName: s.classTeacher?.user?.name ?? null,
        studentCount: s._count.enrollments,
      })),
    }));
    return res.json({ classes: formatted });
  } catch (error) {
    console.error("Classes GET error:", error);
    return res.status(500).json({ error: "Failed to fetch classes" });
  }
});

router.post("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session || session.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin only" });
    }
    const parseResult = classSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.format() });
    }
    const { name, gradeLevel, sections } = parseResult.data;
    const newClass = await prisma.class.create({
      data: {
        name,
        gradeLevel,
        schoolId: session.schoolId,
        sections: {
          create: sections.map((secName) => ({ name: secName.trim() })),
        },
      },
      include: { sections: true },
    });
    return res.json({ success: true, class: newClass });
  } catch (error) {
    console.error("Classes POST error:", error);
    return res.status(500).json({ error: "Failed to create class" });
  }
});

export default router;
