import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const SCHOOL_CODE = "GPMS-SDR-101";
const PASSWORD = "Password@123";
const DAYS = [1, 2, 3, 4, 5, 6]; // Monday through Saturday
const PERIODS = [
  { startTime: "07:00", endTime: "07:45" },
  { startTime: "07:45", endTime: "08:30" },
  { startTime: "08:30", endTime: "09:15" },
  { startTime: "09:30", endTime: "10:15" },
  { startTime: "10:15", endTime: "11:00" },
];
const SAMPLE_STUDENTS = [
  { name: "Ishita Sen", gender: "Female", guardianName: "Anil Sen" },
  { name: "Arjun Das", gender: "Male", guardianName: "Madhuri Das" },
  { name: "Moumita Pal", gender: "Female", guardianName: "Bimal Pal" },
  { name: "Soham Ghosh", gender: "Male", guardianName: "Rina Ghosh" },
];

const TEACHER_ASSIGNMENTS = [
  { grade: 1, section: "Section A", name: "Meera Ghosh", email: "meera.ghosh@ruralshiksha.gov.in", employeeId: "EMP-T-101", specialization: "Primary Education" },
  { grade: 2, section: "Section A", name: "Tapan Das", email: "tapan.das@ruralshiksha.gov.in", employeeId: "EMP-T-102", specialization: "Primary Education" },
  { grade: 3, section: "Section A", name: "Suchitra Pal", email: "suchitra.pal@ruralshiksha.gov.in", employeeId: "EMP-T-103", specialization: "Primary Education" },
  { grade: 4, section: "Section A", name: "Debashis Mondal", email: "debashis.mondal@ruralshiksha.gov.in", employeeId: "EMP-T-104", specialization: "Primary Education" },
  { grade: 5, section: "Section A", name: "Anita Das", email: "anita.das@ruralshiksha.gov.in", employeeId: "EMP-T-042", specialization: "Mathematics & Science" },
  { grade: 5, section: "Section B", name: "Mitali Soren", email: "mitali.soren@ruralshiksha.gov.in", employeeId: "EMP-T-105", specialization: "Primary Education" },
  { grade: 6, section: "Section A", name: "Vikram Singh", email: "vikram.singh@ruralshiksha.gov.in", employeeId: "EMP-T-089", specialization: "Language & Social Studies" },
  { grade: 7, section: "Section A", name: "Ritu Ghosh", email: "ritu.ghosh@ruralshiksha.gov.in", employeeId: "EMP-T-106", specialization: "Middle School Education" },
  { grade: 8, section: "Section A", name: "Arindam Roy", email: "arindam.roy@ruralshiksha.gov.in", employeeId: "EMP-T-107", specialization: "Middle School Education" },
];

function subjectsForGrade(grade) {
  if (grade <= 2) return ["Hindi", "English", "Mathematics", "Environmental Studies", "Art & Craft"];
  if (grade <= 5) return ["Hindi", "English", "Mathematics", "Environmental Studies", "General Knowledge"];
  return ["Hindi", "English", "Mathematics", "Science", "Social Studies"];
}

async function ensureTeacher(tx, schoolId, assignment, passwordHash) {
  const email = assignment.email;
  let user = await tx.user.findUnique({ where: { email }, include: { teacherProfile: true } });
  if (user && (user.schoolId !== schoolId || user.role !== Role.TEACHER)) {
    throw new Error(`${email} already belongs to a different school or account role.`);
  }

  if (!user) {
    user = await tx.user.create({
      data: {
        name: `${assignment.name} (Class ${assignment.grade} Lead)`,
        email,
        passwordHash,
        role: Role.TEACHER,
        schoolId,
        teacherProfile: {
          create: {
            schoolId,
            employeeId: assignment.employeeId,
            specialization: assignment.specialization,
          },
        },
      },
      include: { teacherProfile: true },
    });
  } else if (!user.teacherProfile) {
    const profile = await tx.teacher.create({
      data: { userId: user.id, schoolId, employeeId: assignment.employeeId, specialization: assignment.specialization },
    });
    user = { ...user, teacherProfile: profile };
  }

  return user;
}

export async function ensureSchoolRoutine(prisma, schoolId) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const result = { classes: 0, teachers: 0, students: 0, periods: 0, existingPeriods: 0, conflicts: [] };

  await prisma.$transaction(async (tx) => {
    const school = await tx.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error(`School ${schoolId} was not found.`);

    const classesByGrade = new Map();
    for (let grade = 1; grade <= 8; grade += 1) {
      let schoolClass = await tx.class.findFirst({ where: { schoolId, gradeLevel: grade }, orderBy: { createdAt: "asc" } });
      if (!schoolClass) {
        schoolClass = await tx.class.create({ data: { name: `Class ${grade}`, gradeLevel: grade, schoolId } });
        result.classes += 1;
      }
      classesByGrade.set(grade, schoolClass);
    }

    const sectionByKey = new Map();
    for (const assignment of TEACHER_ASSIGNMENTS) {
      const schoolClass = classesByGrade.get(assignment.grade);
      let section = await tx.section.findFirst({ where: { classId: schoolClass.id, name: assignment.section } });
      if (!section) section = await tx.section.create({ data: { classId: schoolClass.id, name: assignment.section } });
      sectionByKey.set(`${assignment.grade}:${assignment.section}`, section);
    }

    const teacherByKey = new Map();
    for (const assignment of TEACHER_ASSIGNMENTS) {
      const user = await ensureTeacher(tx, schoolId, assignment, passwordHash);
      const profile = user.teacherProfile;
      if (!profile) throw new Error(`Teacher profile could not be created for ${assignment.email}.`);
      result.teachers += 1;

      const schoolClass = classesByGrade.get(assignment.grade);
      const assignedClasses = await tx.teacher.findUnique({ where: { id: profile.id }, select: { assignedClasses: { select: { id: true } } } });
      if (!assignedClasses?.assignedClasses.some((item) => item.id === schoolClass.id)) {
        await tx.class.update({ where: { id: schoolClass.id }, data: { teachers: { connect: { id: profile.id } } } });
      }

      const section = sectionByKey.get(`${assignment.grade}:${assignment.section}`);
      if (!section.classTeacherId) {
        await tx.section.update({ where: { id: section.id }, data: { classTeacherId: profile.id } });
      }
      teacherByKey.set(`${assignment.grade}:${assignment.section}`, profile);
    }

    for (const assignment of TEACHER_ASSIGNMENTS) {
      const schoolClass = classesByGrade.get(assignment.grade);
      const section = sectionByKey.get(`${assignment.grade}:${assignment.section}`);
      const teacher = teacherByKey.get(`${assignment.grade}:${assignment.section}`);
      const subjects = subjectsForGrade(assignment.grade);

      const activeEnrollmentCount = await tx.enrollment.count({
        where: {
          sectionId: section.id,
          isActive: true,
          student: { schoolId, status: "ACTIVE" },
        },
      });
      if (activeEnrollmentCount === 0) {
        const sectionCode = assignment.section.replace(/[^a-z0-9]/gi, "").toUpperCase();
        for (let index = 0; index < SAMPLE_STUDENTS.length; index += 1) {
          const sample = SAMPLE_STUDENTS[index];
          const rollNumber = String(index + 1).padStart(2, "0");
          const studentId = `DEMO-2026-C${String(assignment.grade).padStart(2, "0")}-${sectionCode}-${rollNumber}`;
          const existingStudent = await tx.student.findUnique({ where: { studentId } });
          if (existingStudent) continue;

          await tx.student.create({
            data: {
              studentId,
              name: sample.name,
              rollNumber,
              gender: sample.gender,
              guardianName: sample.guardianName,
              guardianPhone: "+91 90000 00000",
              address: "Sundarpur, Bolpur",
              schoolId,
              classId: schoolClass.id,
              status: "ACTIVE",
              enrollments: {
                create: {
                  sectionId: section.id,
                  academicYear: "2026-2027",
                  rollNumber,
                },
              },
            },
          });
          result.students += 1;
        }
      }

      for (const dayOfWeek of DAYS) {
        for (let periodIndex = 0; periodIndex < PERIODS.length; periodIndex += 1) {
          const period = PERIODS[periodIndex];
          const subject = subjects[(periodIndex + dayOfWeek - 1) % subjects.length];
          const sectionSlot = await tx.timetableEntry.findFirst({
            where: { schoolId, sectionId: section.id, dayOfWeek, startTime: period.startTime, endTime: period.endTime, isActive: true },
          });
          if (sectionSlot) {
            const isSameAssignment = sectionSlot.teacherId === teacher.id && sectionSlot.subject === subject;
            if (isSameAssignment) result.existingPeriods += 1;
            else result.conflicts.push(`Class ${assignment.grade} ${assignment.section}, ${dayOfWeek}, ${period.startTime}`);
            continue;
          }

          const teacherSlot = await tx.timetableEntry.findFirst({
            where: { schoolId, teacherId: teacher.id, dayOfWeek, startTime: period.startTime, endTime: period.endTime, isActive: true },
          });
          if (teacherSlot) {
            result.conflicts.push(`${assignment.name}, ${dayOfWeek}, ${period.startTime}`);
            continue;
          }

          await tx.timetableEntry.create({
            data: {
              schoolId,
              teacherId: teacher.id,
              classId: schoolClass.id,
              sectionId: section.id,
              subject,
              dayOfWeek,
              startTime: period.startTime,
              endTime: period.endTime,
              isActive: true,
            },
          });
          result.periods += 1;
        }
      }
    }
  });

  return result;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const school = await prisma.school.findUnique({ where: { code: SCHOOL_CODE } });
    if (!school) throw new Error(`School ${SCHOOL_CODE} was not found. Create the school before adding its class routine.`);
    const result = await ensureSchoolRoutine(prisma, school.id);
    console.log(`School routine ready: ${result.classes} classes added, ${result.teachers} teacher accounts checked, ${result.students} sample students added, ${result.periods} periods added, ${result.existingPeriods} already present.`);
    if (result.conflicts.length) {
      console.warn(`Skipped ${result.conflicts.length} occupied timetable slots to preserve existing assignments. Review these in Classes & Sections:`);
      for (const conflict of result.conflicts.slice(0, 20)) console.warn(`- ${conflict}`);
      if (result.conflicts.length > 20) console.warn(`- and ${result.conflicts.length - 20} more`);
    }
    console.log(`Teacher quick-fill password: ${PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

const invokedDirectly = process.argv[1]?.endsWith("seed-school-routine.js");
if (invokedDirectly) {
  main().catch((error) => {
    console.error("Could not add the school class routine:", error);
    process.exitCode = 1;
  });
}
