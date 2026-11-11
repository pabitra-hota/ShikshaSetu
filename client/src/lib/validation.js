import { z } from "zod";
export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});
export const studentSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    rollNumber: z.string().min(1, "Roll number is required"),
    classId: z.string().min(1, "Class is required"),
    sectionId: z.string().min(1, "Section is required"),
    gender: z.string().default("Not Specified"),
    dob: z.string().optional().nullable(),
    guardianName: z.string().optional().nullable(),
    guardianPhone: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    photoUrl: z.string().optional().nullable(),
    descriptor: z.string().optional().nullable(),
});
export const attendanceItemSchema = z.object({
    studentId: z.string().min(1),
    markedByUserId: z.string().min(1).optional(),
    timetableEntryId: z.string().min(1).optional(),
    sectionId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
    verifiedByAi: z.boolean().default(false),
    aiConfidence: z.number().min(0).max(1).optional().nullable(),
    verificationMethod: z.enum(["AI_FACIAL", "MANUAL_ROSTER", "TEACHER_OVERRIDE", "PRINCIPAL_CORRECTION"]),
    clientRecordedAt: z.string(),
    remarks: z.string().optional().nullable(),
    offlineCreated: z.boolean().default(false),
});
export const syncBatchSchema = z.object({
    operationId: z.string().min(5),
    deviceId: z.string().min(3),
    timestamp: z.string(),
    timetableEntryId: z.string().min(1).optional(),
    legacyDaily: z.boolean().optional(),
    records: z.array(attendanceItemSchema).min(1, "At least one record is required in sync batch"),
});
export const classSchema = z.object({
    name: z.string().min(2, "Class name required"),
    gradeLevel: z.coerce.number().int().min(1).max(12),
    sections: z.array(z.string().min(1)).min(1, "At least one section required"),
});
export const correctionLogSchema = z.object({
    attendanceId: z.string().min(1),
    newStatus: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
    reason: z.string().min(3, "Reason for correction is required"),
});

export const attendanceRectificationSchema = z.object({
    newStatus: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
    reason: z.string().trim().min(5, "Explain why this attendance record is being corrected").max(500),
});

export const timetableEntrySchema = z.object({
    teacherId: z.string().min(1),
    classId: z.string().min(1),
    sectionId: z.string().min(1),
    subject: z.string().trim().min(2).max(80),
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
}).refine((entry) => entry.startTime < entry.endTime, {
    message: "The end time must be later than the start time",
    path: ["endTime"],
});

const teacherFields = {
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().email("Enter a valid email address").transform((value) => value.toLowerCase()),
    employeeId: z.string().trim().min(1, "Employee ID is required"),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    specialization: z.string().trim().max(120).optional().or(z.literal("")),
    classIds: z.array(z.string().min(1)).default([]).refine((ids) => new Set(ids).size === ids.length, "Choose each class once"),
};

export const teacherCreateSchema = z.object({
    ...teacherFields,
    password: z.string().min(8, "Use at least 8 characters for the initial password"),
});

export const teacherUpdateSchema = z.object(teacherFields).partial();

export const schoolSettingsSchema = z.object({
    academicYear: z.string().trim().regex(/^\d{4}-\d{4}$/, "Use the format YYYY-YYYY"),
    attendanceCutoffTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid 24-hour time"),
    allowOfflineAttendance: z.boolean(),
    requireTeacherConfirmation: z.boolean(),
    aiConfidenceThreshold: z.coerce.number().min(0.5).max(0.95),
    offlineRetentionDays: z.coerce.number().int().min(1).max(365),
});
