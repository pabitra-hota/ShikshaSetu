import { Router } from "express";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";
import { AttendanceStatus } from "@prisma/client";
import { attendanceAccessWhere, getAccessScope, studentAccessWhere } from "../lib/access.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    if (session.role !== "ADMIN" && session.role !== "TEACHER") return res.status(403).json({ error: "Forbidden" });

    const scope = await getAccessScope(session);
    const startDateString = req.query.startDate;
    const endDateString = req.query.endDate;
    const classId = req.query.classId || undefined;
    const sectionId = req.query.sectionId || undefined;
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setUTCDate(now.getUTCDate() - 14);
    const startDate = startDateString ? new Date(`${startDateString}T00:00:00.000Z`) : defaultStart;
    const endDate = endDateString ? new Date(`${endDateString}T23:59:59.999Z`) : now;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      return res.status(400).json({ error: "Choose a valid report date range" });
    }

    const records = await prisma.attendance.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        student: { schoolId: session.schoolId, ...(classId ? { classId } : {}) },
        ...(sectionId ? { sectionId } : {}),
        ...(scope.isAdmin ? {} : { markedByUserId: session.userId }),
        ...attendanceAccessWhere(scope),
      },
      include: {
        student: {
          select: {
            id: true,
            studentId: true,
            name: true,
            rollNumber: true,
            class: { select: { name: true } },
          },
        },
        section: { select: { id: true, name: true } },
        session: {
          select: {
            id: true,
            isLegacy: true,
            timetableEntryIdSnapshot: true,
            teacherIdSnapshot: true,
            subjectSnapshot: true,
            teacherNameSnapshot: true,
            dayOfWeekSnapshot: true,
            classNameSnapshot: true,
            sectionNameSnapshot: true,
            startTimeSnapshot: true,
            endTimeSnapshot: true,
            markedAt: true,
            markedByUser: { select: { name: true } },
          },
        },
        corrections: {
          include: { correctedByUser: { select: { name: true } } },
          orderBy: { correctedAt: "desc" },
        },
      },
      orderBy: [{ date: "desc" }, { student: { rollNumber: "asc" } }, { session: { id: "asc" } }],
    });

    const totalRecords = records.length;
    const present = records.filter((record) => record.status === AttendanceStatus.PRESENT).length;
    const absent = records.filter((record) => record.status === AttendanceStatus.ABSENT).length;
    const late = records.filter((record) => record.status === AttendanceStatus.LATE).length;
    const excused = records.filter((record) => record.status === AttendanceStatus.EXCUSED).length;
    const attendancePercentage = totalRecords ? Math.round(((present + late) / totalRecords) * 100) : 0;

    const studentMap = new Map();
    for (const record of records) {
      const periodKey = record.session.timetableEntryIdSnapshot
        ? JSON.stringify([
          record.session.timetableEntryIdSnapshot,
          record.session.subjectSnapshot,
          record.session.teacherIdSnapshot,
          record.session.teacherNameSnapshot,
          record.session.dayOfWeekSnapshot,
          record.session.startTimeSnapshot,
          record.session.endTimeSnapshot,
          record.session.classNameSnapshot,
          record.session.sectionNameSnapshot,
        ])
        : `legacy:${record.sectionId}`;
      const summaryKey = `${record.studentId}:${periodKey}`;
      if (!studentMap.has(summaryKey)) {
        studentMap.set(summaryKey, {
          summaryKey,
          studentId: record.studentId,
          schoolStudentId: record.student.studentId,
          name: record.student.name,
          rollNumber: record.student.rollNumber,
          className: record.session.classNameSnapshot || record.student.class.name,
          sectionName: record.session.sectionNameSnapshot || record.section.name,
          timetableEntryId: record.session.timetableEntryIdSnapshot,
          subject: record.session.subjectSnapshot || "Daily attendance",
          teacherName: record.session.teacherNameSnapshot || "—",
          startTime: record.session.startTimeSnapshot,
          endTime: record.session.endTimeSnapshot,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          rate: 0,
        });
      }
      const summary = studentMap.get(summaryKey);
      summary.total++;
      if (record.status === AttendanceStatus.PRESENT) summary.present++;
      else if (record.status === AttendanceStatus.ABSENT) summary.absent++;
      else if (record.status === AttendanceStatus.LATE) summary.late++;
      else if (record.status === AttendanceStatus.EXCUSED) summary.excused++;
      summary.rate = Math.round(((summary.present + summary.late) / summary.total) * 100);
    }

    if (scope.isAdmin) {
      const roster = await prisma.student.findMany({
        where: {
          schoolId: session.schoolId,
          status: "ACTIVE",
          ...(classId ? { classId } : {}),
          ...(sectionId ? { enrollments: { some: { sectionId, isActive: true } } } : {}),
          ...studentAccessWhere(scope),
        },
        select: {
          id: true,
          studentId: true,
          name: true,
          rollNumber: true,
          class: { select: { name: true } },
          enrollments: {
            where: { isActive: true, ...(sectionId ? { sectionId } : {}) },
            select: { section: { select: { id: true, name: true } } },
            take: 1,
          },
        },
        orderBy: [{ class: { gradeLevel: "asc" } }, { rollNumber: "asc" }],
      });
      const studentsWithRecords = new Set(records.map((record) => record.studentId));
      for (const student of roster) {
        if (studentsWithRecords.has(student.id)) continue;
        const section = student.enrollments[0]?.section;
        const summaryKey = `${student.id}:no-records:${section?.id || "school"}`;
        studentMap.set(summaryKey, {
          summaryKey,
          studentId: student.id,
          schoolStudentId: student.studentId,
          name: student.name,
          rollNumber: student.rollNumber,
          className: student.class.name,
          sectionName: section?.name || "—",
          timetableEntryId: null,
          subject: "No attendance recorded",
          teacherName: "—",
          startTime: null,
          endTime: null,
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          rate: 0,
        });
      }
    }

    const studentSummaries = [...studentMap.values()].sort((a, b) => {
      const rollOrder = Number.parseInt(a.rollNumber, 10) - Number.parseInt(b.rollNumber, 10);
      return rollOrder || a.subject.localeCompare(b.subject);
    });

    return res.json({
      summary: {
        totalRecords,
        present,
        absent,
        late,
        excused,
        attendancePercentage,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      },
      studentSummaries,
      detailedRecords: records.map((record) => ({
        id: record.id,
        date: record.date.toISOString().split("T")[0],
        studentName: record.student.name,
        rollNumber: record.student.rollNumber,
        className: record.session.classNameSnapshot || record.student.class.name,
        sectionName: record.session.sectionNameSnapshot || record.section.name,
        subject: record.session.subjectSnapshot || "Daily attendance",
        teacherName: record.session.teacherNameSnapshot || "—",
        startTime: record.session.startTimeSnapshot,
        endTime: record.session.endTimeSnapshot,
        attendanceMarkedBy: record.session.markedByUser?.name || "—",
        attendanceMarkedAt: record.session.markedAt?.toISOString() || null,
        timetableEntryId: record.session.timetableEntryIdSnapshot,
        status: record.status,
        method: record.verificationMethod,
        aiConfidence: record.aiConfidence,
        syncStatus: record.syncStatus,
        corrections: record.corrections.map((correction) => ({
          id: correction.id,
          previousStatus: correction.previousStatus,
          newStatus: correction.newStatus,
          reason: correction.reason,
          correctedAt: correction.correctedAt.toISOString(),
          correctedBy: correction.correctedByUser.name,
        })),
      })),
    });
  } catch (error) {
    console.error("Reports GET error:", error);
    return res.status(500).json({ error: "Failed to generate reports" });
  }
});

export default router;
