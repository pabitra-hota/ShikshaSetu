BEGIN;

CREATE TABLE "AttendanceSession" (
  "id" TEXT NOT NULL,
  "sessionKey" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "timetableEntryId" TEXT,
  "isLegacy" BOOLEAN NOT NULL DEFAULT false,
  "date" TIMESTAMP(3) NOT NULL,
  "timetableEntryIdSnapshot" TEXT,
  "subjectSnapshot" TEXT,
  "teacherIdSnapshot" TEXT,
  "teacherNameSnapshot" TEXT,
  "classNameSnapshot" TEXT,
  "sectionNameSnapshot" TEXT,
  "dayOfWeekSnapshot" INTEGER,
  "startTimeSnapshot" TEXT,
  "endTimeSnapshot" TEXT,
  "markedByUserId" TEXT,
  "markedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttendanceSession_sessionKey_key" ON "AttendanceSession"("sessionKey");
CREATE UNIQUE INDEX "AttendanceSession_timetableEntryId_date_key" ON "AttendanceSession"("timetableEntryId", "date");
CREATE INDEX "AttendanceSession_schoolId_date_idx" ON "AttendanceSession"("schoolId", "date");
CREATE INDEX "AttendanceSession_sectionId_date_idx" ON "AttendanceSession"("sectionId", "date");

ALTER TABLE "Attendance" ADD COLUMN "sessionId" TEXT;

INSERT INTO "AttendanceSession" (
  "id", "sessionKey", "schoolId", "sectionId", "isLegacy", "date",
  "subjectSnapshot", "classNameSnapshot", "sectionNameSnapshot", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || substr(md5(a."sectionId" || ':' || to_char(a."date", 'YYYY-MM-DD')), 1, 24),
  'legacy:' || a."sectionId" || ':' || to_char(a."date", 'YYYY-MM-DD'),
  c."schoolId",
  a."sectionId",
  true,
  a."date",
  'Daily attendance',
  c."name",
  s."name",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Attendance" a
JOIN "Section" s ON s."id" = a."sectionId"
JOIN "Class" c ON c."id" = s."classId"
GROUP BY a."sectionId", a."date", c."schoolId", c."name", s."name";

UPDATE "Attendance" a
SET "sessionId" = s."id"
FROM "AttendanceSession" s
WHERE s."sessionKey" = 'legacy:' || a."sectionId" || ':' || to_char(a."date", 'YYYY-MM-DD');

ALTER TABLE "Attendance" ALTER COLUMN "sessionId" SET NOT NULL;
DROP INDEX IF EXISTS "Attendance_studentId_date_key";
CREATE UNIQUE INDEX "Attendance_sessionId_studentId_key" ON "Attendance"("sessionId", "studentId");
CREATE INDEX "Attendance_sectionId_date_idx" ON "Attendance"("sectionId", "date");

ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceSession_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceSession_timetableEntryId_fkey"
  FOREIGN KEY ("timetableEntryId") REFERENCES "TimetableEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceSession_markedByUserId_fkey"
  FOREIGN KEY ("markedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
