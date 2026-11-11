export const timetableInclude = {
  teacher: { include: { user: { select: { id: true, name: true, email: true } } } },
  class: { select: { id: true, name: true, gradeLevel: true } },
  section: { select: { id: true, name: true } },
};

export async function validateTimetableAssignment(prisma, schoolId, entry) {
  const [teacher, section] = await Promise.all([
    prisma.teacher.findFirst({
      where: { id: entry.teacherId, schoolId, user: { role: "TEACHER", schoolId } },
      select: { id: true },
    }),
    prisma.section.findFirst({
      where: { id: entry.sectionId, classId: entry.classId, class: { schoolId } },
      select: { id: true },
    }),
  ]);

  if (!teacher) return { error: "Choose a teacher account from this school" };
  if (!section) return { error: "Choose a section from the selected class" };
  return { teacher, section };
}

export function findTimetableConflict(prisma, schoolId, entry, excludeId) {
  return prisma.timetableEntry.findFirst({
    where: {
      schoolId,
      isActive: true,
      dayOfWeek: entry.dayOfWeek,
      startTime: { lt: entry.endTime },
      endTime: { gt: entry.startTime },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [{ teacherId: entry.teacherId }, { sectionId: entry.sectionId }],
    },
    include: {
      teacher: { include: { user: { select: { name: true } } } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  });
}

export function describeTimetableConflict(entry, conflict) {
  const reasons = [];
  if (conflict.teacherId === entry.teacherId) {
    reasons.push(`${conflict.teacher.user.name} is already assigned to ${conflict.class.name} ${conflict.section.name}`);
  }
  if (conflict.sectionId === entry.sectionId) {
    reasons.push(`${conflict.class.name} ${conflict.section.name} already has another period`);
  }
  return `${reasons.join(" and ") || "This schedule overlaps an existing period"} at that time. Change the time or choose another teacher.`;
}
