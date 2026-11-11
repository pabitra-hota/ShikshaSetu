import { Router } from "express";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";
import { studentSchema } from "../lib/validation.js";
import { attendanceAccessWhere, enrollmentAccessWhere, getAccessScope, studentAccessWhere, withAccessWhere } from "../lib/access.js";
import { dateStringToUtcDate } from "../lib/attendance/session.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const search = req.query.search || "";
    const classId = req.query.classId || undefined;
    const sectionId = req.query.sectionId || undefined;
    const dateString = req.query.date || undefined;

    const coverageDate = dateString ? dateStringToUtcDate(dateString) : null;
    const validCoverageDate = coverageDate && coverageDate.toISOString().slice(0, 10) === dateString ? coverageDate : null;
    const scope = await getAccessScope(session, validCoverageDate);
    const filters = scope.isAdmin ? [] : [studentAccessWhere(scope)];
    if (classId) filters.push({ classId });
    if (sectionId) {
      filters.push({ enrollments: { some: { sectionId, isActive: true } } });
    }
    if (search.trim()) {
      filters.push({
        OR: [
          { name: { contains: search.trim(), mode: "insensitive" } },
          { rollNumber: { contains: search.trim(), mode: "insensitive" } },
          { studentId: { contains: search.trim(), mode: "insensitive" } },
        ],
      });
    }
    const whereClause = withAccessWhere({ schoolId: session.schoolId }, filters.length ? { AND: filters } : {});
    const students = await prisma.student.findMany({
      where: whereClause,
      include: {
        class: { select: { id: true, name: true, gradeLevel: true } },
        enrollments: {
          where: { isActive: true, ...enrollmentAccessWhere(scope) },
          include: { section: { select: { id: true, name: true } } },
          take: 1,
        },
        biometricReferences: {
          where: { isActive: true },
          take: 1,
          select: { id: true, descriptor: true, qualityScore: true },
        },
      },
      orderBy: [{ class: { gradeLevel: "asc" } }, { rollNumber: "asc" }],
    });
    const formatted = students.map((s) => ({
      id: s.id,
      studentId: s.studentId,
      name: s.name,
      rollNumber: s.rollNumber,
      gender: s.gender,
      dob: s.dob ? s.dob.toISOString().split("T")[0] : null,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      address: s.address,
      photoUrl: s.photoUrl,
      status: s.status,
      classId: s.classId,
      className: s.class?.name,
      sectionId: s.enrollments[0]?.section?.id,
      sectionName: s.enrollments[0]?.section?.name,
      descriptor: s.biometricReferences[0]?.descriptor ?? null,
    }));
    return res.json({ students: formatted });
  } catch (error) {
    console.error("Students GET error:", error);
    return res.status(500).json({ error: "Failed to fetch students" });
  }
});

router.post("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (session.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin only" });
    }
    const parseResult = studentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.format() });
    }
    const data = parseResult.data;
    const section = await prisma.section.findFirst({
      where: { id: data.sectionId, classId: data.classId, class: { schoolId: session.schoolId } },
      select: { id: true },
    });
    if (!section) {
      return res.status(400).json({ error: "Section does not belong to this class and school" });
    }
    const count = await prisma.student.count({ where: { schoolId: session.schoolId } });
    const studentId = `STU-2026-${String(count + 1).padStart(3, "0")}`;
    const student = await prisma.student.create({
      data: {
        studentId,
        name: data.name,
        rollNumber: data.rollNumber,
        gender: data.gender,
        dob: data.dob ? new Date(data.dob) : null,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        address: data.address,
        photoUrl: data.photoUrl,
        schoolId: session.schoolId,
        classId: data.classId,
        enrollments: {
          create: {
            sectionId: data.sectionId,
            academicYear: "2026-2027",
            rollNumber: data.rollNumber,
          },
        },
        biometricReferences: data.descriptor
          ? {
              create: {
                descriptor: data.descriptor,
                qualityScore: 0.95,
              },
            }
          : undefined,
      },
      include: {
        class: true,
        enrollments: { include: { section: true } },
      },
    });
    return res.json({ success: true, student });
  } catch (error) {
    console.error("Students POST error:", error);
    return res.status(500).json({ error: "Failed to create student" });
  }
});

router.post("/import", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (session.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin only" });
    }
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "Invalid CSV payload: no rows found" });
    }
    const classes = await prisma.class.findMany({
      where: { schoolId: session.schoolId },
      include: { sections: true },
    });
    let importedCount = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row.Name || row.name || "").trim();
      const rollNumber = String(row.RollNumber || row.rollNumber || row.Roll || i + 1).trim();
      const className = (row.ClassName || row.className || row.Class || "Class 5").trim();
      const sectionName = (row.SectionName || row.sectionName || row.Section || "Section A").trim();
      const gender = (row.Gender || row.gender || "Not Specified").trim();
      const guardianName = (row.GuardianName || row.guardianName || "").trim();
      const guardianPhone = (row.GuardianPhone || row.guardianPhone || "").trim();
      const address = (row.Address || row.address || "").trim();
      if (!name) {
        errors.push(`Row ${i + 1}: Name is required`);
        continue;
      }
      let targetClass = classes.find((c) => c.name.toLowerCase() === className.toLowerCase());
      if (!targetClass) {
        targetClass = await prisma.class.create({
          data: {
            name: className,
            gradeLevel: parseInt(className.replace(/\D/g, "")) || 5,
            schoolId: session.schoolId,
          },
          include: { sections: true },
        });
        classes.push(targetClass);
      }
      let targetSection = targetClass.sections.find((s) => s.name.toLowerCase() === sectionName.toLowerCase());
      if (!targetSection) {
        targetSection = await prisma.section.create({
          data: {
            name: sectionName,
            classId: targetClass.id,
          },
        });
        targetClass.sections.push(targetSection);
      }
      const count = await prisma.student.count({ where: { schoolId: session.schoolId } });
      const studentId = `STU-2026-${String(count + 1).padStart(3, "0")}`;
      await prisma.student.create({
        data: {
          studentId,
          name,
          rollNumber,
          gender,
          guardianName: guardianName || null,
          guardianPhone: guardianPhone || null,
          address: address || null,
          schoolId: session.schoolId,
          classId: targetClass.id,
          enrollments: {
            create: {
              sectionId: targetSection.id,
              academicYear: "2026-2027",
              rollNumber,
            },
          },
        },
      });
      importedCount++;
    }
    return res.json({ success: true, importedCount, errors });
  } catch (error) {
    console.error("CSV Import error:", error);
    return res.status(500).json({ error: "Failed to process CSV import" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { id } = req.params;
    const scope = await getAccessScope(session);
    const student = await prisma.student.findFirst({
      where: withAccessWhere({ id, schoolId: session.schoolId }, studentAccessWhere(scope)),
      include: {
        class: true,
        enrollments: {
          include: { section: true },
          where: { isActive: true, ...enrollmentAccessWhere(scope) },
        },
        attendances: {
          where: attendanceAccessWhere(scope),
          orderBy: { date: "desc" },
          take: 30,
        },
      },
    });
    if (!student || student.schoolId !== session.schoolId) {
      return res.status(404).json({ error: "Student not found" });
    }
    const total = student.attendances.length;
    const present = student.attendances.filter((a) => a.status === "PRESENT").length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return res.json({
      student: {
        ...student,
        attendanceStats: { total, present, rate },
      },
    });
  } catch (error) {
    console.error("Student GET [id] error:", error);
    return res.status(500).json({ error: "Failed to fetch student details" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (session.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin only" });
    }
    const { id } = req.params;
    const parseResult = studentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation failed", details: parseResult.error.format() });
    }
    const data = parseResult.data;
    const [studentExists, section] = await Promise.all([
      prisma.student.findFirst({ where: { id, schoolId: session.schoolId }, select: { id: true } }),
      prisma.section.findFirst({ where: { id: data.sectionId, classId: data.classId, class: { schoolId: session.schoolId } }, select: { id: true } }),
    ]);
    if (!studentExists) return res.status(404).json({ error: "Student not found" });
    if (!section) return res.status(400).json({ error: "Section does not belong to this class and school" });
    const updated = await prisma.$transaction(async (tx) => {
      const student = await tx.student.update({
        where: { id },
        data: {
          name: data.name,
          rollNumber: data.rollNumber,
          gender: data.gender,
          dob: data.dob ? new Date(data.dob) : null,
          guardianName: data.guardianName,
          guardianPhone: data.guardianPhone,
          address: data.address,
          photoUrl: data.photoUrl,
          classId: data.classId,
        },
      });
      await tx.enrollment.updateMany({
        where: { studentId: id, isActive: true },
        data: { sectionId: data.sectionId, rollNumber: data.rollNumber },
      });
      if (data.descriptor) {
        const existingRef = await tx.biometricReference.findFirst({ where: { studentId: id } });
        if (existingRef) {
          await tx.biometricReference.update({
            where: { id: existingRef.id },
            data: { descriptor: data.descriptor, qualityScore: 0.95 },
          });
        } else {
          await tx.biometricReference.create({
            data: { studentId: id, descriptor: data.descriptor, qualityScore: 0.95 },
          });
        }
      }
      return student;
    });
    return res.json({ success: true, student: updated });
  } catch (error) {
    console.error("Student PUT [id] error:", error);
    return res.status(500).json({ error: "Failed to update student" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session || session.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden: Admin only" });
    }
    const { id } = req.params;
    const student = await prisma.student.findFirst({ where: { id, schoolId: session.schoolId }, select: { id: true } });
    if (!student) return res.status(404).json({ error: "Student not found" });
    await prisma.student.delete({ where: { id: student.id } });
    return res.json({ success: true, message: "Student deleted successfully" });
  } catch (error) {
    console.error("Student DELETE [id] error:", error);
    return res.status(500).json({ error: "Failed to delete student" });
  }
});

export default router;
