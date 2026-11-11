import { test } from "node:test";
import assert from "node:assert";
import { attendanceItemSchema, attendanceRectificationSchema, loginSchema, schoolSettingsSchema, syncBatchSchema, teacherCreateSchema, teacherUpdateSchema, timetableEntrySchema } from "../client/src/lib/validation.js";
test("loginSchema accepts valid email and password", () => {
    const result = loginSchema.safeParse({
        email: "teacher@ruralshiksha.gov.in",
        password: "Password@123",
    });
    assert.strictEqual(result.success, true);
});
test("loginSchema rejects invalid email", () => {
    const result = loginSchema.safeParse({
        email: "not-an-email",
        password: "Password@123",
    });
    assert.strictEqual(result.success, false);
});
test("attendanceItemSchema validates attendance payload format", () => {
    const validRecord = {
        studentId: "stu_123",
        sectionId: "sec_abc",
        date: "2026-10-16",
        status: "PRESENT",
        verifiedByAi: true,
        aiConfidence: 0.94,
        verificationMethod: "AI_FACIAL",
        clientRecordedAt: new Date().toISOString(),
    };
    const result = attendanceItemSchema.safeParse(validRecord);
    assert.strictEqual(result.success, true);
});
test("syncBatchSchema enforces non-empty records list", () => {
    const emptyBatch = {
        operationId: "op_test_12345",
        deviceId: "device_laptop_1",
        timestamp: new Date().toISOString(),
        records: [],
    };
    const result = syncBatchSchema.safeParse(emptyBatch);
    assert.strictEqual(result.success, false);
});

test("teacherCreateSchema normalizes email and requires a secure initial password", () => {
    const result = teacherCreateSchema.safeParse({
        name: "Anita Das",
        email: "ANITA@SCHOOL.EDU",
        password: "securepass123",
        employeeId: "EMP-04",
        classIds: ["class-1"],
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.email, "anita@school.edu");
    assert.strictEqual(teacherCreateSchema.safeParse({ ...result.data, password: "short" }).success, false);
});

test("teacherUpdateSchema rejects duplicate class assignments", () => {
    const result = teacherUpdateSchema.safeParse({ classIds: ["class-1", "class-1"] });
    assert.strictEqual(result.success, false);
});

test("schoolSettingsSchema validates time, threshold, and retention range", () => {
    const valid = {
        academicYear: "2026-2027",
        attendanceCutoffTime: "10:30",
        allowOfflineAttendance: true,
        requireTeacherConfirmation: true,
        aiConfidenceThreshold: 0.65,
        offlineRetentionDays: 30,
    };
    assert.strictEqual(schoolSettingsSchema.safeParse(valid).success, true);
    assert.strictEqual(schoolSettingsSchema.safeParse({ ...valid, attendanceCutoffTime: "25:80" }).success, false);
    assert.strictEqual(schoolSettingsSchema.safeParse({ ...valid, aiConfidenceThreshold: 0.99 }).success, false);
});

test("attendance rectification requires a reason and valid replacement status", () => {
    assert.strictEqual(attendanceRectificationSchema.safeParse({ newStatus: "PRESENT", reason: "Paper register checked" }).success, true);
    assert.strictEqual(attendanceRectificationSchema.safeParse({ newStatus: "PRESENT", reason: "typo" }).success, false);
    assert.strictEqual(attendanceRectificationSchema.safeParse({ newStatus: "UNKNOWN", reason: "Paper register checked" }).success, false);
});

test("timetable entries require a valid weekday and non-overlapping period time range", () => {
    const entry = {
        teacherId: "teacher-1",
        classId: "class-1",
        sectionId: "section-1",
        subject: "Mathematics",
        dayOfWeek: "1",
        startTime: "09:00",
        endTime: "09:45",
    };
    const valid = timetableEntrySchema.safeParse(entry);
    assert.strictEqual(valid.success, true);
    assert.strictEqual(valid.data.dayOfWeek, 1);
    assert.strictEqual(timetableEntrySchema.safeParse({ ...entry, endTime: "09:00" }).success, false);
    assert.strictEqual(timetableEntrySchema.safeParse({ ...entry, dayOfWeek: "7" }).success, false);
});
