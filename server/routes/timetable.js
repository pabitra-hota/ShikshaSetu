import { Router } from "express";
import { z } from "zod";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";
import { timetableEntrySchema } from "../lib/validation.js";
import { describeTimetableConflict, findTimetableConflict, timetableInclude, validateTimetableAssignment } from "../lib/timetable.js";
import { dateStringToUtcDate, isAttendanceSessionComplete } from "../lib/attendance/session.js";

const router = Router();

const coverageSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teacherId: z.string().min(1).nullable(),
});

router.get("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const dateString = req.query.date || undefined;
    const selectedDate = dateString ? dateStringToUtcDate(dateString) : null;
    if (dateString && (!selectedDate || selectedDate.toISOString().slice(0, 10) !== dateString)) {
      return res.status(400).json({ error: "Enter a valid date in YYYY-MM-DD format" });
    }
    let where = { schoolId: session.schoolId };
    where = selectedDate ? {
      ...where,
      OR: [
        { isActive: true, dayOfWeek: selectedDate.getUTCDay() },
        { attendanceSessions: { some: { date: selectedDate } } },
      ],
    } : { ...where, isActive: true };
    if (session.role === "TEACHER") {
      const teacher = await prisma.teacher.findFirst({
        where: { userId: session.userId, schoolId: session.schoolId },
        select: { id: true },
      });
      if (!teacher) return res.json({ entries: [] });
      where = selectedDate
        ? { ...where, AND: [...(where.AND || []), { OR: [{ teacherId: teacher.id }, { coverages: { some: { date: selectedDate, teacherId: teacher.id } } }] }] }
        : { ...where, teacherId: teacher.id };
    } else if (session.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const entries = await prisma.timetableEntry.findMany({
      where,
      include: {
        ...timetableInclude,
        ...(selectedDate ? {
          coverages: {
            where: { date: selectedDate },
            include: { teacher: { include: { user: { select: { id: true, name: true, email: true } } } } },
          },
          attendanceSessions: {
            where: { date: selectedDate },
            include: {
              markedByUser: { select: { id: true, name: true } },
              records: { select: { studentId: true } },
            },
          },
        } : {}),
      },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
    if (!selectedDate) return res.json({ entries });

    const sectionIds = [...new Set(entries.map((entry) => entry.sectionId))];
    const activeEnrollments = sectionIds.length ? await prisma.enrollment.findMany({
      where: {
        sectionId: { in: sectionIds },
        isActive: true,
        student: { schoolId: session.schoolId, status: "ACTIVE" },
      },
      select: { sectionId: true, studentId: true },
    }) : [];
    const activeStudentsBySection = new Map();
    for (const enrollment of activeEnrollments) {
      const ids = activeStudentsBySection.get(enrollment.sectionId) || [];
      ids.push(enrollment.studentId);
      activeStudentsBySection.set(enrollment.sectionId, ids);
    }
    const datedEntries = entries.map((entry) => {
      const attendanceSession = entry.attendanceSessions?.[0] ?? null;
      const coverage = entry.coverages?.[0] ?? null;
      const { attendanceSessions, coverages, ...publicEntry } = entry;
      const marked = isAttendanceSessionComplete(
        activeStudentsBySection.get(entry.sectionId) || [],
        attendanceSession?.records.map((record) => record.studentId) || [],
      );
      return {
        ...publicEntry,
        subject: attendanceSession?.subjectSnapshot || entry.subject,
        class: { ...entry.class, name: attendanceSession?.classNameSnapshot || entry.class.name },
        section: { ...entry.section, name: attendanceSession?.sectionNameSnapshot || entry.section.name },
        teacher: attendanceSession?.teacherNameSnapshot
          ? { ...entry.teacher, user: { ...entry.teacher.user, name: attendanceSession.teacherNameSnapshot } }
          : entry.teacher,
        coverage,
        effectiveTeacher: coverage?.teacher || entry.teacher,
        startTime: attendanceSession?.startTimeSnapshot || entry.startTime,
        endTime: attendanceSession?.endTimeSnapshot || entry.endTime,
        attendanceStatus: marked ? "MARKED" : "NOT_MARKED",
        attendanceMarker: marked ? attendanceSession.markedByUser?.name || "School staff" : null,
        attendanceMarkedAt: marked ? attendanceSession.markedAt?.toISOString() ?? null : null,
        attendanceSessionId: marked ? attendanceSession.id : null,
      };
    });
    return res.json({ entries: datedEntries, date: dateString });
  } catch (error) {
    console.error("Timetable GET error:", error);
    return res.status(500).json({ error: "Failed to load the timetable" });
  }
});

router.post("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN") return res.status(403).json({ error: "Principal access only" });

    const parsed = timetableEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Validation failed", details: parsed.error.flatten() });
    const entry = parsed.data;
    const validAssignment = await validateTimetableAssignment(prisma, session.schoolId, entry);
    if (validAssignment.error) return res.status(400).json({ error: validAssignment.error });

    const conflict = await findTimetableConflict(prisma, session.schoolId, entry);
    if (conflict) {
      return res.status(409).json({ error: describeTimetableConflict(entry, conflict) });
    }

    const created = await prisma.timetableEntry.create({
      data: { ...entry, schoolId: session.schoolId },
      include: timetableInclude,
    });
    return res.status(201).json({ success: true, entry: created });
  } catch (error) {
    console.error("Timetable POST error:", error);
    return res.status(500).json({ error: "Failed to create the timetable period" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN") return res.status(403).json({ error: "Principal access only" });
    const { id } = req.params;
    const existing = await prisma.timetableEntry.findFirst({ where: { id, schoolId: session.schoolId } });
    if (!existing) return res.status(404).json({ error: "Timetable period not found" });

    const parsed = timetableEntrySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Validation failed", details: parsed.error.flatten() });
    const entry = parsed.data;
    const validAssignment = await validateTimetableAssignment(prisma, session.schoolId, entry);
    if (validAssignment.error) return res.status(400).json({ error: validAssignment.error });

    const conflict = await findTimetableConflict(prisma, session.schoolId, entry, id);
    if (conflict) {
      return res.status(409).json({ error: describeTimetableConflict(entry, conflict) });
    }

    const updated = await prisma.timetableEntry.update({ where: { id }, data: entry, include: timetableInclude });
    return res.json({ success: true, entry: updated });
  } catch (error) {
    console.error("Timetable PATCH error:", error);
    return res.status(500).json({ error: "Failed to update the timetable period" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN") return res.status(403).json({ error: "Principal access only" });
    const { id } = req.params;
    const existing = await prisma.timetableEntry.findFirst({
      where: { id, schoolId: session.schoolId },
      select: { id: true, _count: { select: { attendanceSessions: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Timetable period not found" });
    if (existing._count.attendanceSessions > 0) {
      await prisma.timetableEntry.update({ where: { id: existing.id }, data: { isActive: false } });
      return res.json({ success: true, archived: true });
    }
    await prisma.timetableEntry.delete({ where: { id: existing.id } });
    return res.json({ success: true, archived: false });
  } catch (error) {
    console.error("Timetable DELETE error:", error);
    return res.status(500).json({ error: "Failed to remove the timetable period" });
  }
});

router.put("/:id/coverage", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN") return res.status(403).json({ error: "Principal access only" });

    const parsed = coverageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid coverage details" });
    const { id } = req.params;
    const date = dateStringToUtcDate(parsed.data.date);
    if (!date || date.toISOString().slice(0, 10) !== parsed.data.date) {
      return res.status(400).json({ error: "Choose a valid school date" });
    }

    const entry = await prisma.timetableEntry.findFirst({
      where: { id, schoolId: session.schoolId, isActive: true },
      include: { teacher: { include: { user: { select: { name: true } } } } },
    });
    if (!entry) return res.status(404).json({ error: "Active timetable period not found" });
    if (entry.dayOfWeek !== date.getUTCDay()) {
      return res.status(400).json({ error: "This period is not scheduled on the selected date" });
    }

    if (!parsed.data.teacherId || parsed.data.teacherId === entry.teacherId) {
      await prisma.timetableCoverage.deleteMany({ where: { timetableEntryId: id, date } });
      return res.json({ success: true, coverage: null });
    }

    const teacher = await prisma.teacher.findFirst({
      where: { id: parsed.data.teacherId, schoolId: session.schoolId, user: { role: "TEACHER", schoolId: session.schoolId } },
      select: { id: true, user: { select: { name: true } } },
    });
    if (!teacher) return res.status(400).json({ error: "Choose a teacher account from this school" });

    const overlaps = await prisma.timetableEntry.findFirst({
      where: {
        schoolId: session.schoolId,
        isActive: true,
        id: { not: entry.id },
        dayOfWeek: entry.dayOfWeek,
        startTime: { lt: entry.endTime },
        endTime: { gt: entry.startTime },
        OR: [
          { teacherId: teacher.id },
          { coverages: { some: { date, teacherId: teacher.id } } },
        ],
      },
      include: { class: { select: { name: true } }, section: { select: { name: true } } },
    });
    if (overlaps) {
      return res.status(409).json({ error: `${teacher.user.name} already has ${overlaps.class.name} ${overlaps.section.name} during this time. Change that period first, or choose another teacher.` });
    }

    const coverage = await prisma.timetableCoverage.upsert({
      where: { timetableEntryId_date: { timetableEntryId: id, date } },
      update: { teacherId: teacher.id, assignedByUserId: session.userId },
      create: { schoolId: session.schoolId, timetableEntryId: id, date, teacherId: teacher.id, assignedByUserId: session.userId },
      include: { teacher: { include: { user: { select: { id: true, name: true } } } } },
    });
    return res.json({ success: true, coverage });
  } catch (error) {
    console.error("Timetable coverage update error:", error);
    return res.status(500).json({ error: "Could not update this period's cover teacher" });
  }
});

export default router;
