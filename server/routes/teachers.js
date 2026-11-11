import { Router } from "express";
import bcrypt from "bcryptjs";
import prisma from "../lib/db.js";
import { getSession } from "../lib/auth.js";
import { teacherCreateSchema, teacherUpdateSchema } from "../lib/validation.js";

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

    const teachers = await prisma.teacher.findMany({
      where: { schoolId: session.schoolId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignedClasses: { select: { id: true, name: true, gradeLevel: true }, orderBy: { gradeLevel: "asc" } },
      },
      orderBy: { employeeId: "asc" },
    });
    return res.json({ teachers });
  } catch (error) {
    console.error("Teachers GET error:", error);
    return res.status(500).json({ error: "Failed to load teachers" });
  }
});

router.post("/", async (req, res) => {
  try {
    const session = await requireAdmin(req, res);
    if (!session) return;

    const parsed = teacherCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const existingEmployee = await prisma.teacher.findFirst({
      where: { schoolId: session.schoolId, employeeId: data.employeeId },
      select: { id: true },
    });
    if (existingEmployee) return res.status(409).json({ error: "That employee ID is already in use" });
    const classCount = await prisma.class.count({ where: { id: { in: data.classIds }, schoolId: session.schoolId } });
    if (classCount !== data.classIds.length) {
      return res.status(400).json({ error: "One or more selected classes are not part of this school" });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const teacher = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: "TEACHER",
        schoolId: session.schoolId,
        teacherProfile: {
          create: {
            schoolId: session.schoolId,
            employeeId: data.employeeId,
            phone: data.phone || null,
            specialization: data.specialization || null,
            assignedClasses: { connect: data.classIds.map((id) => ({ id })) },
          },
        },
      },
      include: {
        teacherProfile: {
          include: { assignedClasses: { select: { id: true, name: true, gradeLevel: true } } },
        },
      },
    });
    return res.status(201).json({ success: true, teacher: teacher.teacherProfile });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "That email or employee ID is already in use" });
    console.error("Teachers POST error:", error);
    return res.status(500).json({ error: "Failed to create teacher" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN") return res.status(403).json({ error: "Forbidden: Admin only" });

    const { id } = req.params;
    const teacher = await prisma.teacher.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!teacher) return res.status(404).json({ error: "Teacher not found" });

    const parsed = teacherUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    if (data.employeeId !== undefined) {
      const duplicateEmployee = await prisma.teacher.findFirst({
        where: { schoolId: session.schoolId, employeeId: data.employeeId, id: { not: teacher.id } },
        select: { id: true },
      });
      if (duplicateEmployee) return res.status(409).json({ error: "That employee ID is already in use" });
    }
    if (data.classIds) {
      const classCount = await prisma.class.count({ where: { id: { in: data.classIds }, schoolId: session.schoolId } });
      if (classCount !== data.classIds.length) {
        return res.status(400).json({ error: "One or more selected classes are not part of this school" });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const userUpdate = {};
      if (data.name !== undefined) userUpdate.name = data.name;
      if (data.email !== undefined) userUpdate.email = data.email;
      if (Object.keys(userUpdate).length) await tx.user.update({ where: { id: teacher.userId }, data: userUpdate });

      return tx.teacher.update({
        where: { id: teacher.id },
        data: {
          ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
          ...(data.specialization !== undefined ? { specialization: data.specialization || null } : {}),
          ...(data.classIds !== undefined ? { assignedClasses: { set: data.classIds.map((classId) => ({ id: classId })) } } : {}),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          assignedClasses: { select: { id: true, name: true, gradeLevel: true }, orderBy: { gradeLevel: "asc" } },
        },
      });
    });
    return res.json({ success: true, teacher: updated });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "That email or employee ID is already in use" });
    console.error("Teacher PATCH error:", error);
    return res.status(500).json({ error: "Failed to update teacher" });
  }
});

export default router;
