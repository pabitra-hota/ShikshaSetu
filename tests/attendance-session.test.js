import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attendanceSessionKey,
  dateStringToUtcDate,
  isAttendanceSessionComplete,
  isScheduledPeriodAuthorized,
} from "../client/src/lib/attendance/session.js";

test("period attendance sessions remain separate for the same student and school date", () => {
  const date = "2026-11-07";
  const firstPeriod = attendanceSessionKey({ timetableEntryId: "math-period", sectionId: "section-5a", date });
  const secondPeriod = attendanceSessionKey({ timetableEntryId: "science-period", sectionId: "section-5a", date });

  assert.equal(firstPeriod, "period:math-period:2026-11-07");
  assert.equal(secondPeriod, "period:science-period:2026-11-07");
  assert.notEqual(firstPeriod, secondPeriod);
  assert.equal(attendanceSessionKey({ timetableEntryId: "math-period", sectionId: "section-5a", date }), firstPeriod);
});

test("legacy daily attendance keeps a key that cannot be mistaken for a scheduled period", () => {
  const key = attendanceSessionKey({ timetableEntryId: null, sectionId: "section-5a", date: "2026-11-07" });
  assert.equal(key, "legacy:section-5a:2026-11-07");
  assert.notEqual(key, attendanceSessionKey({ timetableEntryId: "period-1", sectionId: "section-5a", date: "2026-11-07" }));
});

test("school date strings parse at UTC midnight and reject malformed values", () => {
  assert.equal(dateStringToUtcDate("2026-11-07")?.toISOString(), "2026-11-07T00:00:00.000Z");
  assert.equal(dateStringToUtcDate("not-a-date"), null);
});

test("a period is complete only when every active student has a period record", () => {
  assert.equal(isAttendanceSessionComplete(["s1", "s2"], ["s1", "s2"]), true);
  assert.equal(isAttendanceSessionComplete(["s1", "s2"], ["s1"]), false);
  assert.equal(isAttendanceSessionComplete([], []), false);
});

test("teachers can access only their own section and weekday period", () => {
  const entry = {
    id: "period-1",
    sectionId: "section-5a",
    dayOfWeek: 6,
    isActive: true,
    teacher: { user: { id: "teacher-1" } },
  };
  const date = dateStringToUtcDate("2026-11-07");
  const authorize = (overrides = {}) => isScheduledPeriodAuthorized({
    entry,
    role: "TEACHER",
    userId: "teacher-1",
    sectionId: "section-5a",
    date,
    ...overrides,
  });

  assert.equal(authorize(), true);
  assert.equal(authorize({ userId: "teacher-2" }), false);
  assert.equal(authorize({ sectionId: "section-5b" }), false);
  assert.equal(authorize({ date: dateStringToUtcDate("2026-11-08") }), false);
  assert.equal(authorize({ entry: { ...entry, isActive: false } }), false);
  assert.equal(authorize({ role: "ADMIN", userId: "principal-1" }), true);
});

test("a date-specific cover teacher can access only the covered period on that school date", () => {
  const date = dateStringToUtcDate("2026-11-07");
  const entry = {
    id: "period-1",
    sectionId: "section-5a",
    dayOfWeek: 6,
    isActive: true,
    teacher: { user: { id: "regular-teacher" } },
    coverages: [{
      date,
      teacher: { user: { id: "cover-teacher" } },
    }],
  };

  const authorize = (userId, selectedDate = date) => isScheduledPeriodAuthorized({
    entry,
    role: "TEACHER",
    userId,
    sectionId: "section-5a",
    date: selectedDate,
  });

  assert.equal(authorize("cover-teacher"), true);
  assert.equal(authorize("another-teacher"), false);
  assert.equal(authorize("cover-teacher", dateStringToUtcDate("2026-11-08")), false);
});
