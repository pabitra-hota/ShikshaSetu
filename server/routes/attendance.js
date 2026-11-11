import { Router } from "express";
import { z } from "zod";
import { SyncStatus } from "@prisma/client";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";
import { attendanceItemSchema, attendanceRectificationSchema } from "../lib/validation.js";
import { getAccessScope, sectionAccessWhere } from "../lib/access.js";
import { dateStringToUtcDate, isScheduledPeriodAuthorized, upsertAttendanceSession } from "../lib/attendance/session.js";

const router = Router();

const bulkAttendanceSchema = z.object({
  sectionId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timetableEntryId: z.string().min(1).optional(),
  records: z.array(attendanceItemSchema).min(1, "Add at least one reviewed student before saving attendance"),
});

const scheduleInclude = {
  teacher: { include: { user: { select: { id: true, name: true } } } },
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
};

router.get("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const sectionId = req.query.sectionId;
    const dateString = req.query.date;
    const timetableEntryId = req.query.timetableEntryId || undefined;
    const targetDate = dateString ? dateStringToUtcDate(dateString) : null;
    if (!sectionId || !dateString || !targetDate || targetDate.toISOString().slice(0, 10) !== dateString) {
      return res.status(400).json({ error: "A valid sectionId and date are required" });
    }
    if (session.role === "TEACHER" && !timetableEntryId) {
      return res.status(400).json({ error: "Select one of your scheduled periods" });
    }

    const scope = await getAccessScope(session, targetDate);
    const section = await prisma.section.findFirst({
      where: { id: sectionId, class: { schoolId: session.schoolId }, ...sectionAccessWhere(scope) },
      select: { id: true },
    });
    if (!section) return res.status(404).json({ error: "Section not found" });

    let timetableEntry = null;
    if (timetableEntryId) {
      timetableEntry = await prisma.timetableEntry.findFirst({
        where: { id: timetableEntryId, schoolId: session.schoolId, sectionId },
        include: { ...scheduleInclude, coverages: { where: { date: targetDate }, include: { teacher: { include: { user: { select: { id: true } } } } } } },
      });
      if (!isScheduledPeriodAuthorized({
        entry: timetableEntry,
        role: session.role,
        userId: session.userId,
        sectionId,
        date: targetDate,
        allowInactive: true,
      })) return res.status(403).json({ error: "This period is not assigned to your account for that date" });
    } else if (session.role !== "ADMIN") {
      return res.status(403).json({ error: "Scheduled period attendance is required" });
    }

    const attendanceSession = await prisma.attendanceSession.findUnique({
      where: {
        sessionKey: timetableEntryId
          ? `period:${timetableEntryId}:${dateString}`
          : `legacy:${sectionId}:${dateString}`,
      },
    });
    const records = attendanceSession ? await prisma.attendance.findMany({
      where: { sessionId: attendanceSession.id, sectionId, student: { schoolId: session.schoolId } },
      include: {
        student: { select: { id: true, studentId: true, name: true, rollNumber: true, photoUrl: true } },
      },
      orderBy: { student: { rollNumber: "asc" } },
    }) : [];

    return res.json({
      records: records.map((record) => ({
        id: record.id,
        studentId: record.studentId,
        studentName: record.student.name,
        rollNumber: record.student.rollNumber,
        sectionId: record.sectionId,
        date: dateString,
        timetableEntryId: attendanceSession?.timetableEntryId ?? null,
        status: record.status,
        verifiedByAi: record.verifiedByAi,
        aiConfidence: record.aiConfidence,
        verificationMethod: record.verificationMethod,
        syncStatus: record.syncStatus,
        clientRecordedAt: record.clientRecordedAt.toISOString(),
        remarks: record.remarks,
      })),
      session: attendanceSession ? {
        id: attendanceSession.id,
        markedBy: attendanceSession.markedByUserId,
        markedAt: attendanceSession.markedAt?.toISOString() ?? null,
      } : null,
    });
  } catch (error) {
    console.error("Attendance GET error:", error);
    return res.status(500).json({ error: "Failed to fetch attendance records" });
  }
});

router.post("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const parsed = bulkAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }
    const { sectionId, date, records, timetableEntryId } = parsed.data;
    const targetDate = dateStringToUtcDate(date);
    if (!targetDate || targetDate.toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ error: "Invalid attendance date" });
    }
    if (records.some((record) => record.sectionId !== sectionId || record.date !== date)) {
      return res.status(400).json({ error: "Attendance records must match the selected section and date" });
    }
    if (records.some((record) => Number.isNaN(new Date(record.clientRecordedAt).getTime()))) {
      return res.status(400).json({ error: "Attendance contains an invalid capture time" });
    }
    if (session.role === "TEACHER" && !timetableEntryId) {
      return res.status(403).json({ error: "Teachers must mark attendance from an assigned timetable period" });
    }

    const scope = await getAccessScope(session, targetDate);
    const section = await prisma.section.findFirst({
      where: { id: sectionId, class: { schoolId: session.schoolId }, ...sectionAccessWhere(scope) },
      select: { id: true, classId: true },
    });
    if (!section) return res.status(404).json({ error: "Section not found" });

    let timetableEntry = null;
    if (timetableEntryId) {
      timetableEntry = await prisma.timetableEntry.findFirst({
        where: { id: timetableEntryId, schoolId: session.schoolId, sectionId, isActive: true },
        include: { ...scheduleInclude, coverages: { where: { date: targetDate }, include: { teacher: { include: { user: { select: { id: true } } } } } } },
      });
      if (!isScheduledPeriodAuthorized({ entry: timetableEntry, role: session.role, userId: session.userId, sectionId, date: targetDate })) {
        return res.status(403).json({ error: "This period is not assigned to your account for that date" });
      }
    }

    const studentIds = records.map((record) => record.studentId);
    if (new Set(studentIds).size !== studentIds.length) {
      return res.status(400).json({ error: "Attendance contains duplicate students" });
    }
    const enrolledStudentCount = await prisma.student.count({
      where: {
        id: { in: studentIds },
        schoolId: session.schoolId,
        classId: section.classId,
        status: "ACTIVE",
        enrollments: { some: { sectionId, isActive: true } },
      },
    });
    if (enrolledStudentCount !== studentIds.length) {
      return res.status(403).json({ error: "One or more students are not enrolled in this active section" });
    }
    const markedAt = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const attendanceSession = await upsertAttendanceSession(tx, {
        schoolId: session.schoolId,
        sectionId,
        date: targetDate,
        timetableEntry,
        markedByUserId: session.userId,
        markedAt,
      });
      for (const record of records) {
        const clientRecordedAt = new Date(record.clientRecordedAt);
        await tx.attendance.upsert({
          where: { sessionId_studentId: { sessionId: attendanceSession.id, studentId: record.studentId } },
          update: {
            sectionId,
            date: targetDate,
            status: record.status,
            verifiedByAi: record.verifiedByAi,
            aiConfidence: record.aiConfidence,
            verificationMethod: record.verificationMethod,
            markedByUserId: session.userId,
            syncStatus: SyncStatus.SYNCED,
            clientRecordedAt,
            remarks: record.remarks,
            updatedAt: markedAt,
          },
          create: {
            studentId: record.studentId,
            sectionId,
            sessionId: attendanceSession.id,
            date: targetDate,
            status: record.status,
            verifiedByAi: record.verifiedByAi,
            aiConfidence: record.aiConfidence,
            verificationMethod: record.verificationMethod,
            markedByUserId: session.userId,
            syncStatus: SyncStatus.SYNCED,
            offlineCreated: false,
            clientRecordedAt,
            remarks: record.remarks,
          },
        });
      }
      return attendanceSession;
    });

    return res.json({
      success: true,
      count: records.length,
      date,
      sectionId,
      timetableEntryId: result.timetableEntryId,
      sessionId: result.id,
      markedAt: result.markedAt?.toISOString() ?? markedAt.toISOString(),
    });
  } catch (error) {
    console.error("Attendance POST error:", error);
    return res.status(500).json({ error: "Failed to save attendance" });
  }
});

router.patch("/:id/rectify", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN") return res.status(403).json({ error: "Principal access only" });

    const parsed = attendanceRectificationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Validation failed", details: parsed.error.flatten() });
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.findFirst({
        where: { id, student: { schoolId: session.schoolId } },
        select: { id: true, status: true },
      });
      if (!attendance) throw Object.assign(new Error("Attendance record not found"), { status: 404 });
      if (attendance.status === parsed.data.newStatus) {
        throw Object.assign(new Error("Choose a different status to make a correction"), { status: 400 });
      }

      const updated = await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          status: parsed.data.newStatus,
          verifiedByAi: false,
          aiConfidence: null,
          verificationMethod: "PRINCIPAL_CORRECTION",
        },
        select: { id: true, status: true, updatedAt: true },
      });
      const correction = await tx.attendanceCorrectionLog.create({
        data: {
          attendanceId: attendance.id,
          previousStatus: attendance.status,
          newStatus: parsed.data.newStatus,
          reason: parsed.data.reason,
          correctedByUserId: session.userId,
        },
        include: { correctedByUser: { select: { name: true } } },
      });
      return { attendance: updated, correction };
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: error.message });
    console.error("Attendance rectification error:", error);
    return res.status(500).json({ error: "Failed to rectify attendance" });
  }
});

export default router;
