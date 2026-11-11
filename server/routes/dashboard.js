import { Router } from "express";
import { getSession } from "../lib/auth.js";
import prisma from "../lib/db.js";
import { AttendanceStatus } from "@prisma/client";
import { attendanceAccessWhere, classAccessWhere, enrollmentAccessWhere, getAccessScope, sectionAccessWhere, studentAccessWhere, withAccessWhere } from "../lib/access.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const session = await getSession(req);
    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const schoolId = session.schoolId;
    const scope = await getAccessScope(session);
    const studentScope = studentAccessWhere(scope);
    const attendanceScope = attendanceAccessWhere(scope);

    const totalStudents = await prisma.student.count({
      where: withAccessWhere({ schoolId, status: "ACTIVE" }, studentScope),
    });

    const latestRecord = await prisma.attendance.findFirst({
      where: withAccessWhere({ student: { schoolId } }, attendanceScope),
      orderBy: { date: "desc" },
      select: { date: true },
    });
    const activeDate = latestRecord ? latestRecord.date : new Date();
    activeDate.setHours(0, 0, 0, 0);

    const todayAttendances = await prisma.attendance.findMany({
      where: {
        date: activeDate,
        student: { schoolId },
        ...attendanceScope,
      },
    });
    const presentCount = todayAttendances.filter((a) => a.status === AttendanceStatus.PRESENT).length;
    const absentCount = todayAttendances.filter((a) => a.status === AttendanceStatus.ABSENT).length;
    const lateCount = todayAttendances.filter((a) => a.status === AttendanceStatus.LATE).length;
    const excusedCount = todayAttendances.filter((a) => a.status === AttendanceStatus.EXCUSED).length;
    const recordedCount = todayAttendances.length;
    const dailyPercentage = recordedCount > 0 ? Math.round(((presentCount + lateCount) / recordedCount) * 100) : 0;

    const classes = await prisma.class.findMany({
      where: { schoolId, ...classAccessWhere(scope) },
      include: {
        students: {
          where: withAccessWhere({ status: "ACTIVE" }, studentScope),
          select: { id: true },
        },
        sections: {
          where: sectionAccessWhere(scope),
          select: { id: true, name: true },
        },
      },
      orderBy: { gradeLevel: "asc" },
    });
    const classStats = await Promise.all(classes.map(async (c) => {
      const studentIds = c.students.map((s) => s.id);
      const classAttendances = await prisma.attendance.findMany({
        where: withAccessWhere({
          date: activeDate,
          studentId: { in: studentIds },
        }, attendanceScope),
      });
      const cPresent = classAttendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
      const cTotal = studentIds.length;
      const rate = cTotal > 0 ? Math.round((cPresent / cTotal) * 100) : 0;
      return {
        id: c.id,
        name: c.name,
        total: cTotal,
        present: cPresent,
        absent: classAttendances.filter((a) => a.status === AttendanceStatus.ABSENT).length,
        rate,
      };
    }));

    const pastDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(activeDate);
      d.setDate(activeDate.getDate() - i);
      pastDays.push(d);
    }
    const trends = await Promise.all(pastDays.map(async (day) => {
      day.setHours(0, 0, 0, 0);
      const dayRecords = await prisma.attendance.findMany({
        where: withAccessWhere({
          date: day,
          student: { schoolId },
        }, attendanceScope),
      });
      const dayPresent = dayRecords.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE).length;
      const dayTotal = dayRecords.length;
      const dayRate = dayTotal > 0 ? Math.round((dayPresent / dayTotal) * 100) : 0;
      return {
        date: day.toISOString().split("T")[0],
        dayName: day.toLocaleDateString("en-US", { weekday: "short" }),
        present: dayPresent,
        absent: dayRecords.filter((a) => a.status === AttendanceStatus.ABSENT).length,
        total: dayTotal,
        percentage: dayRate,
      };
    }));

    const recentAbsences = await prisma.attendance.groupBy({
      by: ["studentId"],
      where: withAccessWhere({
        student: { schoolId },
        status: AttendanceStatus.ABSENT,
      }, attendanceScope),
      _count: {
        id: true,
      },
      having: {
        id: {
          _count: {
            gte: 2,
          },
        },
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 8,
    });
    const repeatedAbsenceStudents = await Promise.all(recentAbsences.map(async (ra) => {
      const student = await prisma.student.findUnique({
        where: { id: ra.studentId },
        include: {
          class: { select: { name: true } },
          enrollments: {
            where: { isActive: true, ...enrollmentAccessWhere(scope) },
            include: { section: { select: { name: true } } },
            take: 1,
          },
        },
      });
      return {
        id: student?.id,
        studentId: student?.studentId,
        name: student?.name,
        rollNumber: student?.rollNumber,
        className: student?.class?.name,
        sectionName: student?.enrollments[0]?.section?.name,
        guardianPhone: student?.guardianPhone,
        absenceCount: ra._count.id,
      };
    }));

    const lastSyncOp = await prisma.syncOperation.findFirst({
      where: { userId: session.userId, status: "SUCCESS" },
      orderBy: { syncedAt: "desc" },
    });

    return res.json({
      metrics: {
        totalStudents,
        activeDate: activeDate.toISOString().split("T")[0],
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
        recordedCount,
        dailyPercentage,
        lastServerSync: lastSyncOp?.syncedAt.toISOString() ?? null,
      },
      classStats,
      trends,
      repeatedAbsenceStudents: repeatedAbsenceStudents.filter(Boolean),
    });
  } catch (error) {
    console.error("Dashboard metrics error:", error);
    return res.status(500).json({ error: "Failed to fetch dashboard metrics" });
  }
});

export default router;
