export function attendanceSessionKey({ timetableEntryId, sectionId, date }) {
  return timetableEntryId
    ? `period:${timetableEntryId}:${date}`
    : `legacy:${sectionId}:${date}`;
}

export function dateStringToUtcDate(date) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isScheduledPeriodAuthorized({ entry, role, userId, sectionId, date, allowInactive = false }) {
  if (!entry || (!allowInactive && !entry.isActive)) return false;
  if (entry.sectionId !== sectionId) return false;
  if (entry.dayOfWeek !== date.getUTCDay()) return false;
  const coverage = entry.coverage || entry.coverages?.find((item) => item.date?.toISOString?.().slice(0, 10) === date.toISOString().slice(0, 10));
  if (role === "TEACHER" && entry.teacher?.user?.id !== userId && coverage?.teacher?.user?.id !== userId) return false;
  return role === "TEACHER" || role === "ADMIN";
}

export function isAttendanceSessionComplete(activeStudentIds, recordedStudentIds) {
  if (!activeStudentIds.length) return false;
  const recorded = new Set(recordedStudentIds);
  return activeStudentIds.every((studentId) => recorded.has(studentId));
}

export async function upsertAttendanceSession(tx, {
  schoolId,
  sectionId,
  date,
  timetableEntry = null,
  markedByUserId,
  markedAt = new Date(),
  updateMarker = true,
}) {
  const dateString = date.toISOString().slice(0, 10);
  const sessionKey = attendanceSessionKey({
    timetableEntryId: timetableEntry?.id,
    sectionId,
    date: dateString,
  });
  const snapshot = timetableEntry ? {
    timetableEntryId: timetableEntry.id,
    isLegacy: false,
    timetableEntryIdSnapshot: timetableEntry.id,
    subjectSnapshot: timetableEntry.subject,
    teacherIdSnapshot: timetableEntry.teacherId,
    teacherNameSnapshot: timetableEntry.teacher?.user?.name ?? null,
    classNameSnapshot: timetableEntry.class?.name ?? null,
    sectionNameSnapshot: timetableEntry.section?.name ?? null,
    dayOfWeekSnapshot: timetableEntry.dayOfWeek,
    startTimeSnapshot: timetableEntry.startTime,
    endTimeSnapshot: timetableEntry.endTime,
  } : {
    timetableEntryId: null,
    isLegacy: true,
    timetableEntryIdSnapshot: null,
    subjectSnapshot: "Daily attendance",
    teacherIdSnapshot: null,
    teacherNameSnapshot: null,
    classNameSnapshot: null,
    sectionNameSnapshot: null,
    dayOfWeekSnapshot: null,
    startTimeSnapshot: null,
    endTimeSnapshot: null,
  };

  return tx.attendanceSession.upsert({
    where: { sessionKey },
    update: updateMarker ? { markedByUserId, markedAt } : {},
    create: {
      sessionKey,
      schoolId,
      sectionId,
      date,
      markedByUserId,
      markedAt,
      ...snapshot,
    },
  });
}
