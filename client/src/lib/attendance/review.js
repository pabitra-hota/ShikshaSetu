const SUGGESTION_STATUSES = new Set(["CONFIRMED", "UNCERTAIN", "DUPLICATE"]);
const ATTENDANCE_STATUSES = new Set(["PRESENT", "ABSENT", "LATE", "EXCUSED"]);

export function isAttendanceStatus(status) {
  return ATTENDANCE_STATUSES.has(status);
}

export function createReviewItems(students) {
  return students.map((student) => ({
    studentId: student.id,
    studentName: student.name,
    rollNumber: student.rollNumber,
    status: null,
    verifiedByAi: false,
    aiConfidence: null,
    verificationMethod: "MANUAL_ROSTER",
  }));
}

export function applyAiMatchSuggestion(reviewItem, match, faceThumbnail) {
  if (!SUGGESTION_STATUSES.has(match.matchStatus) || !match.suggestedStudentId) return reviewItem;

  return {
    ...reviewItem,
    verifiedByAi: true,
    aiConfidence: match.confidence,
    matchFlag: match.matchStatus,
    faceThumbnail,
    verificationMethod: "AI_FACIAL",
  };
}

export function hasUnreviewedAttendance(reviewItems) {
  return reviewItems.some((item) => !isAttendanceStatus(item.status));
}
