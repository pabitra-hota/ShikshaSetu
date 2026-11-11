import prisma from "./db.js";

export async function getAccessScope(session, coverageDate = null) {
  if (session?.role === "ADMIN") {
    return { isAdmin: true, classIds: [], sectionIds: [] };
  }

  const teacher = await prisma.teacher.findFirst({
    where: { userId: session.userId, schoolId: session.schoolId },
    select: {
      assignedClasses: { select: { id: true } },
      primarySections: { select: { id: true } },
      timetableEntries: {
        where: { isActive: true, schoolId: session.schoolId },
        select: { sectionId: true },
      },
      ...(coverageDate ? {
        timetableCoverages: {
          where: { date: coverageDate, schoolId: session.schoolId },
          select: { timetableEntry: { select: { sectionId: true } } },
        },
      } : {}),
    },
  });

  return {
    isAdmin: false,
    classIds: teacher?.assignedClasses.map((schoolClass) => schoolClass.id) ?? [],
    sectionIds: [
      ...(teacher?.primarySections.map((section) => section.id) ?? []),
      ...(teacher?.timetableEntries.map((entry) => entry.sectionId) ?? []),
      ...(teacher?.timetableCoverages?.map((coverage) => coverage.timetableEntry.sectionId) ?? []),
    ],
  };
}

function orWhere(conditions, emptyField) {
  return {
    OR: conditions.length ? conditions : [{ [emptyField]: { in: [] } }],
  };
}

export function classAccessWhere(scope) {
  if (scope.isAdmin) return {};
  const conditions = [];
  if (scope.classIds.length) conditions.push({ id: { in: scope.classIds } });
  if (scope.sectionIds.length) conditions.push({ sections: { some: { id: { in: scope.sectionIds } } } });
  return orWhere(conditions, "id");
}

export function sectionAccessWhere(scope) {
  if (scope.isAdmin) return {};
  const conditions = [];
  if (scope.classIds.length) conditions.push({ classId: { in: scope.classIds } });
  if (scope.sectionIds.length) conditions.push({ id: { in: scope.sectionIds } });
  return orWhere(conditions, "id");
}

export function studentAccessWhere(scope) {
  if (scope.isAdmin) return {};
  const conditions = [];
  if (scope.classIds.length) conditions.push({ classId: { in: scope.classIds } });
  if (scope.sectionIds.length) {
    conditions.push({ enrollments: { some: { sectionId: { in: scope.sectionIds }, isActive: true } } });
  }
  return orWhere(conditions, "id");
}

export function enrollmentAccessWhere(scope) {
  if (scope.isAdmin) return {};
  const conditions = [];
  if (scope.classIds.length) {
    conditions.push({ section: { classId: { in: scope.classIds } } });
  }
  if (scope.sectionIds.length) {
    conditions.push({ sectionId: { in: scope.sectionIds } });
  }
  return orWhere(conditions, "id");
}

export function attendanceAccessWhere(scope) {
  if (scope.isAdmin) return {};
  const conditions = [];
  if (scope.classIds.length) conditions.push({ section: { classId: { in: scope.classIds } } });
  if (scope.sectionIds.length) conditions.push({ sectionId: { in: scope.sectionIds } });
  return orWhere(conditions, "id");
}

export function withAccessWhere(where, accessWhere) {
  if (!Object.keys(accessWhere).length) return where;
  return { ...where, AND: [...(where.AND ?? []), accessWhere] };
}

export function canAccessSection(scope, section) {
  return scope.isAdmin || scope.classIds.includes(section.classId) || scope.sectionIds.includes(section.id);
}
