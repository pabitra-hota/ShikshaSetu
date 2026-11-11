import { Router } from "express";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";
import { syncBatchSchema } from "../lib/validation.js";
import { SyncOpStatus, SyncStatus } from "@prisma/client";
import { canAccessSection, getAccessScope } from "../lib/access.js";
import { dateStringToUtcDate, isScheduledPeriodAuthorized, upsertAttendanceSession } from "../lib/attendance/session.js";

const router = Router();

const scheduleInclude = {
  teacher: { include: { user: { select: { id: true, name: true } } } },
  class: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
};

router.post("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Unauthorized session" });

    const parsed = syncBatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid sync batch payload", details: parsed.error.format() });
    }
    const { operationId, deviceId, records, legacyDaily = false } = parsed.data;
    if (!records.length) return res.status(400).json({ error: "Sync batch contains no attendance records" });

    const context = {
      sectionId: records[0].sectionId,
      date: records[0].date,
      timetableEntryId: parsed.data.timetableEntryId ?? records[0].timetableEntryId ?? null,
    };
    const targetDate = dateStringToUtcDate(context.date);
    if (!targetDate || targetDate.toISOString().slice(0, 10) !== context.date) {
      return res.status(400).json({ error: "Sync batch contains an invalid attendance date" });
    }
    if (records.some((record) => record.sectionId !== context.sectionId
      || record.date !== context.date
      || (record.timetableEntryId ?? context.timetableEntryId) !== context.timetableEntryId)) {
      return res.status(400).json({ error: "A sync batch must contain one section, period, and date" });
    }
    const recordKeys = records.map((record) => `${record.studentId}:${context.timetableEntryId || "legacy"}:${record.date}`);
    if (new Set(recordKeys).size !== recordKeys.length) {
      return res.status(400).json({ error: "Sync batch contains duplicate student attendance records" });
    }
    if (records.some((record) => Number.isNaN(new Date(record.clientRecordedAt).getTime()))) {
      return res.status(400).json({ error: "Sync batch contains an invalid capture time" });
    }

    const ownerIds = [...new Set(records.map((record) => record.markedByUserId || session.userId))];
    if (ownerIds.length !== 1) return res.status(400).json({ error: "A sync batch can only contain records from one account" });
    const recordOwnerId = ownerIds[0];
    if (session.role !== "ADMIN" && recordOwnerId !== session.userId) {
      return res.status(403).json({ error: "You cannot sync attendance for another account" });
    }
    const recordOwner = await prisma.user.findFirst({
      where: { id: recordOwnerId, schoolId: session.schoolId },
      select: { id: true, role: true },
    });
    if (!recordOwner) return res.status(403).json({ error: "The attendance owner is not part of this school" });
    if (recordOwner.role === "TEACHER" && !context.timetableEntryId && !legacyDaily) {
      return res.status(403).json({ error: "Teachers must sync attendance against an assigned timetable period" });
    }

    const existingOp = await prisma.syncOperation.findUnique({ where: { operationId } });
    if (existingOp && existingOp.userId !== session.userId && session.role !== "ADMIN") {
      return res.status(403).json({ error: "This sync operation belongs to another account" });
    }
    if (existingOp?.status === SyncOpStatus.SUCCESS) {
      return res.json({
        success: true,
        operationId,
        processedCount: existingOp.batchSize,
        conflicts: existingOp.conflictDetails ? JSON.parse(existingOp.conflictDetails) : [],
        message: "Operation was previously synchronized (idempotent replay)",
        serverConfirmedAt: existingOp.syncedAt.toISOString(),
      });
    }
    const existingDevice = await prisma.device.findUnique({ where: { deviceId }, select: { userId: true } });
    if (existingDevice?.userId && existingDevice.userId !== recordOwnerId) {
      return res.status(403).json({ error: "This device is registered to another account" });
    }

    const scope = await getAccessScope(session, targetDate);
    const section = await prisma.section.findFirst({
      where: { id: context.sectionId, class: { schoolId: session.schoolId } },
      select: { id: true, classId: true },
    });
    if (!section) return res.status(403).json({ error: "Sync batch includes a section outside this school" });
    let timetableEntry = null;
    if (context.timetableEntryId) {
      timetableEntry = await prisma.timetableEntry.findFirst({
        where: { id: context.timetableEntryId, schoolId: session.schoolId },
        include: { ...scheduleInclude, coverages: { where: { date: targetDate }, include: { teacher: { include: { user: { select: { id: true } } } } } } },
      });
      if (!isScheduledPeriodAuthorized({
        entry: timetableEntry,
        role: recordOwner.role,
        userId: recordOwnerId,
        sectionId: context.sectionId,
        date: targetDate,
        allowInactive: true,
      })) return res.status(403).json({ error: "This period is not assigned to the attendance owner for that date" });
    }
    if (!canAccessSection(scope, section) && !timetableEntry) {
      return res.status(403).json({ error: "Sync batch includes a class or section you are not assigned to" });
    }

    const studentIds = [...new Set(records.map((record) => record.studentId))];
    const students = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        schoolId: session.schoolId,
        classId: section.classId,
        status: "ACTIVE",
        enrollments: { some: { sectionId: context.sectionId, isActive: true } },
      },
      select: { id: true, name: true, rollNumber: true },
    });
    const studentsById = new Map(students.map((student) => [student.id, student]));
    if (students.length !== studentIds.length) {
      return res.status(403).json({ error: "Sync batch includes a student outside the active class section" });
    }

    await prisma.device.upsert({
      where: { deviceId },
      update: { userId: existingDevice?.userId || recordOwnerId, lastSyncAt: new Date() },
      create: { deviceId, userId: recordOwnerId, deviceName: "Rural PWA Mobile Client", lastSyncAt: new Date() },
    });

    const conflicts = [];
    let processedCount = 0;
    await prisma.$transaction(async (tx) => {
      const attendanceSession = await upsertAttendanceSession(tx, {
        schoolId: session.schoolId,
        sectionId: context.sectionId,
        date: targetDate,
        timetableEntry,
        markedByUserId: recordOwnerId,
        markedAt: new Date(),
        updateMarker: false,
      });

      for (const record of records) {
        const student = studentsById.get(record.studentId);
        const clientRecordedAt = new Date(record.clientRecordedAt);
        const existingAttendance = await tx.attendance.findUnique({
          where: { sessionId_studentId: { sessionId: attendanceSession.id, studentId: record.studentId } },
        });
        if (!existingAttendance) {
          await tx.attendance.create({
            data: {
              studentId: record.studentId,
              sectionId: context.sectionId,
              sessionId: attendanceSession.id,
              date: targetDate,
              status: record.status,
              verifiedByAi: record.verifiedByAi,
              aiConfidence: record.aiConfidence,
              verificationMethod: record.verificationMethod,
              markedByUserId: recordOwnerId,
              deviceId,
              syncStatus: SyncStatus.SYNCED,
              offlineCreated: record.offlineCreated,
              clientRecordedAt,
              remarks: record.remarks,
            },
          });
          processedCount++;
          continue;
        }

        if (existingAttendance.status === record.status) {
          await tx.attendance.update({
            where: { id: existingAttendance.id },
            data: { deviceId, markedByUserId: recordOwnerId, syncStatus: SyncStatus.SYNCED, updatedAt: new Date() },
          });
          processedCount++;
          continue;
        }

        if (existingAttendance.updatedAt > clientRecordedAt) {
          conflicts.push({
            attendanceId: existingAttendance.id,
            studentId: student.id,
            studentName: student.name,
            rollNumber: student.rollNumber,
            sectionId: context.sectionId,
            timetableEntryId: context.timetableEntryId,
            date: record.date,
            serverStatus: existingAttendance.status,
            localStatus: record.status,
            serverUpdatedAt: existingAttendance.updatedAt.toISOString(),
            clientRecordedAt: record.clientRecordedAt,
            reason: "Server record was modified after client offline capture",
          });
          continue;
        }

        await tx.attendanceCorrectionLog.create({
          data: {
            attendanceId: existingAttendance.id,
            previousStatus: existingAttendance.status,
            newStatus: record.status,
            reason: `Offline sync update from device ${deviceId}`,
            correctedByUserId: session.userId,
          },
        });
        await tx.attendance.update({
          where: { id: existingAttendance.id },
          data: {
            status: record.status,
            verifiedByAi: record.verifiedByAi,
            aiConfidence: record.aiConfidence,
            verificationMethod: record.verificationMethod,
            markedByUserId: recordOwnerId,
            deviceId,
            syncStatus: SyncStatus.SYNCED,
            offlineCreated: record.offlineCreated,
            clientRecordedAt,
            remarks: record.remarks,
            updatedAt: new Date(),
          },
        });
        processedCount++;
      }

      if (processedCount > 0) {
        await tx.attendanceSession.update({
          where: { id: attendanceSession.id },
          data: { markedByUserId: recordOwnerId, markedAt: new Date() },
        });
      }
      await tx.syncOperation.upsert({
        where: { operationId },
        update: {
          batchSize: records.length,
          status: conflicts.length ? SyncOpStatus.CONFLICT : SyncOpStatus.SUCCESS,
          conflictDetails: conflicts.length ? JSON.stringify(conflicts) : null,
          syncedAt: new Date(),
        },
        create: {
          operationId,
          deviceId,
          userId: session.userId,
          entityType: "ATTENDANCE_BATCH",
          batchSize: records.length,
          status: conflicts.length ? SyncOpStatus.CONFLICT : SyncOpStatus.SUCCESS,
          conflictDetails: conflicts.length ? JSON.stringify(conflicts) : null,
          syncedAt: new Date(),
        },
      });
    });

    return res.json({
      success: true,
      operationId,
      processedCount,
      conflicts,
      serverConfirmedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Sync API error:", error);
    return res.status(error?.status || 500).json({ error: error?.status === 403 ? error.message : "Server sync processing failed" });
  }
});

export default router;
