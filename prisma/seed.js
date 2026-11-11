import "dotenv/config";
import { PrismaClient, Role, StudentStatus, AttendanceStatus, VerificationMethod, SyncStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ensureSchoolRoutine } from "./seed-school-routine.js";
const prisma = new PrismaClient();
// Helper to generate a normalized 128-d pseudo-random facial descriptor
function generateFaceDescriptor(seedNum) {
    const descriptor = new Float32Array(128);
    let norm = 0;
    for (let i = 0; i < 128; i++) {
        // Generate deterministic pseudo-random values based on seed
        const val = Math.sin(seedNum * 999 + i * 13) * 0.5 + Math.cos(i * 7 + seedNum * 3) * 0.5;
        descriptor[i] = val;
        norm += val * val;
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < 128; i++) {
        descriptor[i] /= norm;
    }
    return JSON.stringify(Array.from(descriptor));
}
async function main() {
    console.log("🌱 Starting ShikshaSetu database seed...");
    // 1. Clean existing records safely
    await prisma.attendanceCorrectionLog.deleteMany({});
    await prisma.syncOperation.deleteMany({});
    await prisma.attendance.deleteMany({});
    await prisma.biometricReference.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.section.deleteMany({});
    await prisma.teacher.deleteMany({});
    await prisma.class.deleteMany({});
    await prisma.schoolSettings.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.school.deleteMany({});
    // 2. Create Model School
    const school = await prisma.school.create({
        data: {
            name: "Gram Panchayat Model School, Sundarpur",
            code: "GPMS-SDR-101",
            district: "Birbhum",
            state: "West Bengal",
            address: "Sundarpur Village, Bolpur Block, PIN 731204",
            phone: "+91 94321 87650",
            settings: {
                create: {
                    academicYear: "2026-2027",
                    attendanceCutoffTime: "10:30",
                    allowOfflineAttendance: true,
                    requireTeacherConfirmation: true,
                    aiConfidenceThreshold: 0.65,
                    offlineRetentionDays: 30,
                },
            },
        },
    });
    console.log(`✓ School created: ${school.name}`);
    // 3. Create Users (Admin + Teachers)
    const salt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash("Password@123", salt);
    const teacherPasswordHash = await bcrypt.hash("Password@123", salt);
    const adminUser = await prisma.user.create({
        data: {
            name: "Principal Rajesh Sharma",
            email: "admin@ruralshiksha.gov.in",
            passwordHash: adminPasswordHash,
            role: Role.ADMIN,
            schoolId: school.id,
        },
    });
    const teacher1User = await prisma.user.create({
        data: {
            name: "Anita Das (Class 5 Lead)",
            email: "anita.das@ruralshiksha.gov.in",
            passwordHash: teacherPasswordHash,
            role: Role.TEACHER,
            schoolId: school.id,
            teacherProfile: {
                create: {
                    schoolId: school.id,
                    employeeId: "EMP-T-042",
                    phone: "+91 98301 23456",
                    specialization: "Mathematics & Science",
                },
            },
        },
        include: { teacherProfile: true },
    });
    const teacher2User = await prisma.user.create({
        data: {
            name: "Vikram Singh (Class 6 Lead)",
            email: "vikram.singh@ruralshiksha.gov.in",
            passwordHash: teacherPasswordHash,
            role: Role.TEACHER,
            schoolId: school.id,
            teacherProfile: {
                create: {
                    schoolId: school.id,
                    employeeId: "EMP-T-089",
                    phone: "+91 98302 98765",
                    specialization: "Language & Social Studies",
                },
            },
        },
        include: { teacherProfile: true },
    });
    console.log("✓ Admin and Teacher accounts created");
    // 4. Create Classes and Sections
    const class5 = await prisma.class.create({
        data: {
            name: "Class 5",
            gradeLevel: 5,
            schoolId: school.id,
            teachers: {
                connect: [{ id: teacher1User.teacherProfile.id }],
            },
        },
    });
    const sec5A = await prisma.section.create({
        data: {
            name: "Section A",
            classId: class5.id,
            classTeacherId: teacher1User.teacherProfile.id,
        },
    });
    const sec5B = await prisma.section.create({
        data: {
            name: "Section B",
            classId: class5.id,
        },
    });
    const class6 = await prisma.class.create({
        data: {
            name: "Class 6",
            gradeLevel: 6,
            schoolId: school.id,
            teachers: {
                connect: [{ id: teacher2User.teacherProfile.id }],
            },
        },
    });
    const sec6A = await prisma.section.create({
        data: {
            name: "Section A",
            classId: class6.id,
            classTeacherId: teacher2User.teacherProfile.id,
        },
    });
    const class4 = await prisma.class.create({
        data: {
            name: "Class 4",
            gradeLevel: 4,
            schoolId: school.id,
        },
    });
    const sec4A = await prisma.section.create({
        data: {
            name: "Section A",
            classId: class4.id,
        },
    });
    console.log("✓ Classes & Sections created");
    // 5. Create Students with Biometric Descriptors
    const rawStudents = [
        { name: "Aarav Roy", roll: "01", gender: "Male", guardian: "Pradeep Roy", phone: "+91 98001 11001", secId: sec5A.id, classId: class5.id },
        { name: "Pooja Mondal", roll: "02", gender: "Female", guardian: "Sumit Mondal", phone: "+91 98001 11002", secId: sec5A.id, classId: class5.id },
        { name: "Subham Sen", roll: "03", gender: "Male", guardian: "Ratan Sen", phone: "+91 98001 11003", secId: sec5A.id, classId: class5.id },
        { name: "Riya Ghosh", roll: "04", gender: "Female", guardian: "Bikash Ghosh", phone: "+91 98001 11004", secId: sec5A.id, classId: class5.id },
        { name: "Aniket Murmu", roll: "05", gender: "Male", guardian: "Chuni Murmu", phone: "+91 98001 11005", secId: sec5A.id, classId: class5.id },
        { name: "Sneha Soren", roll: "06", gender: "Female", guardian: "Hopna Soren", phone: "+91 98001 11006", secId: sec5A.id, classId: class5.id },
        { name: "Debabrata Pal", roll: "07", gender: "Male", guardian: "Gouranga Pal", phone: "+91 98001 11007", secId: sec5A.id, classId: class5.id },
        { name: "Tanushree Paul", roll: "08", gender: "Female", guardian: "Nityananda Paul", phone: "+91 98001 11008", secId: sec5A.id, classId: class5.id },
        { name: "Kunal Bauri", roll: "09", gender: "Male", guardian: "Shambhu Bauri", phone: "+91 98001 11009", secId: sec5A.id, classId: class5.id },
        { name: "Moumita Das", roll: "10", gender: "Female", guardian: "Uttam Das", phone: "+91 98001 11010", secId: sec5A.id, classId: class5.id },
        { name: "Suman Bagdi", roll: "11", gender: "Male", guardian: "Khokan Bagdi", phone: "+91 98001 11011", secId: sec5A.id, classId: class5.id },
        { name: "Ananya Majhi", roll: "12", gender: "Female", guardian: "Sukumar Majhi", phone: "+91 98001 11012", secId: sec5A.id, classId: class5.id },
        // Class 5 Section B
        { name: "Bikram Hansda", roll: "01", gender: "Male", guardian: "Babulal Hansda", phone: "+91 98001 11013", secId: sec5B.id, classId: class5.id },
        { name: "Rimpa Mal", roll: "02", gender: "Female", guardian: "Madhab Mal", phone: "+91 98001 11014", secId: sec5B.id, classId: class5.id },
        { name: "Soumen Karmakar", roll: "03", gender: "Male", guardian: "Ashok Karmakar", phone: "+91 98001 11015", secId: sec5B.id, classId: class5.id },
        { name: "Barsha Dhibar", roll: "04", gender: "Female", guardian: "Tapan Dhibar", phone: "+91 98001 11016", secId: sec5B.id, classId: class5.id },
        // Class 6 Section A
        { name: "Rohan Mukherjee", roll: "01", gender: "Male", guardian: "Prabir Mukherjee", phone: "+91 98001 11017", secId: sec6A.id, classId: class6.id },
        { name: "Payel Roy", roll: "02", gender: "Female", guardian: "Amal Roy", phone: "+91 98001 11018", secId: sec6A.id, classId: class6.id },
        { name: "Joydeep Sarkar", roll: "03", guardian: "Dilip Sarkar", gender: "Male", phone: "+91 98001 11019", secId: sec6A.id, classId: class6.id },
        { name: "Supriya Tudu", roll: "04", guardian: "Sunil Tudu", gender: "Female", phone: "+91 98001 11020", secId: sec6A.id, classId: class6.id },
    ];
    const createdStudents = [];
    let seedIndex = 1;
    for (const stu of rawStudents) {
        const studentId = `STU-2026-${String(seedIndex).padStart(3, "0")}`;
        const student = await prisma.student.create({
            data: {
                studentId,
                name: stu.name,
                rollNumber: stu.roll,
                gender: stu.gender,
                guardianName: stu.guardian,
                guardianPhone: stu.phone,
                address: "Sundarpur Rural Village, Bolpur",
                schoolId: school.id,
                classId: stu.classId,
                status: StudentStatus.ACTIVE,
                enrollments: {
                    create: {
                        sectionId: stu.secId,
                        academicYear: "2026-2027",
                        rollNumber: stu.roll,
                    },
                },
                biometricReferences: {
                    create: {
                        descriptor: generateFaceDescriptor(seedIndex),
                        qualityScore: 0.94,
                        photoThumbnail: null,
                    },
                },
            },
        });
        createdStudents.push({ ...student, secId: stu.secId });
        seedIndex++;
    }
    console.log(`✓ ${createdStudents.length} Students seeded with Biometric Reference vectors`);
    const schoolRoutine = await ensureSchoolRoutine(prisma, school.id);
    console.log(`✓ School routine ready: ${schoolRoutine.periods} weekly periods, ${schoolRoutine.students} sample students added for Classes 1–8`);
    // 6. Create Historical Attendance (Past 5 School Days)
    // To test analytics, repeated absences, charts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const pastDates = [];
    for (let d = 4; d >= 0; d--) {
        const past = new Date(today);
        past.setDate(today.getDate() - d);
        // Skip Sunday (0)
        if (past.getDay() !== 0) {
            pastDates.push(past);
        }
    }
    let totalAttendances = 0;
    const attendanceSessions = new Map();
    for (const date of pastDates) {
        for (let i = 0; i < createdStudents.length; i++) {
            const stu = createdStudents[i];
            const sessionDate = date.toISOString().slice(0, 10);
            const sessionKey = `legacy:${stu.secId}:${sessionDate}`;
            let attendanceSession = attendanceSessions.get(sessionKey);
            if (!attendanceSession) {
                attendanceSession = await prisma.attendanceSession.upsert({
                    where: { sessionKey },
                    update: {},
                    create: {
                        sessionKey,
                        schoolId: school.id,
                        sectionId: stu.secId,
                        isLegacy: true,
                        date,
                        subjectSnapshot: "Daily attendance",
                        markedByUserId: teacher1User.id,
                        markedAt: new Date(date.getTime() + 9 * 60 * 60 * 1000),
                    },
                });
                attendanceSessions.set(sessionKey, attendanceSession);
            }
            // Simulate realistic attendance pattern:
            // Student 5 (Aniket) and Student 9 (Kunal) have frequent absences to trigger repeated absence alerts
            let status = AttendanceStatus.PRESENT;
            let method = VerificationMethod.AI_FACIAL;
            let aiConfidence = 0.88 + (Math.sin(i * 11) * 0.08);
            if (stu.rollNumber === "05") {
                // Repeated absence student
                status = AttendanceStatus.ABSENT;
                method = VerificationMethod.MANUAL_ROSTER;
                aiConfidence = 0.0;
            }
            else if (stu.rollNumber === "09" && date.getDay() % 2 === 0) {
                status = AttendanceStatus.ABSENT;
                method = VerificationMethod.MANUAL_ROSTER;
            }
            else if (i === 3 && date.getDay() === 2) {
                status = AttendanceStatus.LATE;
                method = VerificationMethod.AI_FACIAL;
            }
            else if (i === 8 && date.getDay() === 4) {
                status = AttendanceStatus.EXCUSED;
                method = VerificationMethod.TEACHER_OVERRIDE;
            }
            await prisma.attendance.create({
                data: {
                    studentId: stu.id,
                    sectionId: stu.secId,
                    sessionId: attendanceSession.id,
                    date: date,
                    status: status,
                    verifiedByAi: method === VerificationMethod.AI_FACIAL,
                    aiConfidence: method === VerificationMethod.AI_FACIAL ? Number(aiConfidence.toFixed(2)) : null,
                    verificationMethod: method,
                    markedByUserId: teacher1User.id,
                    syncStatus: SyncStatus.SYNCED,
                    offlineCreated: false,
                    clientRecordedAt: new Date(date.getTime() + 9 * 60 * 60 * 1000 + (i * 30000)), // ~9:00 AM to 9:15 AM
                },
            });
            totalAttendances++;
        }
    }
    console.log(`✓ ${totalAttendances} Historical Attendance records seeded across 4 school days`);
    console.log("\n===========================================");
    console.log("🚀 ShikshaSetu Database Seeding Completed!");
    console.log("Credentials:");
    console.log("Admin:   admin@ruralshiksha.gov.in     / Password@123");
    console.log("Teacher: anita.das@ruralshiksha.gov.in / Password@123");
    console.log("Teacher: vikram.singh@ruralshiksha.gov.in / Password@123");
    console.log("===========================================\n");
}
main()
    .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
