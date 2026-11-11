import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAiMatchSuggestion, createReviewItems, hasUnreviewedAttendance } from "../client/src/lib/attendance/review.js";

test("new roster entries require a teacher-selected attendance status", () => {
  const [item] = createReviewItems([{ id: "student-1", name: "Aarav Roy", rollNumber: "01" }]);
  assert.equal(item.status, null);
  assert.equal(hasUnreviewedAttendance([item]), true);
});

test("an uncertain AI match remains a suggestion and does not decide attendance", () => {
  const [item] = createReviewItems([{ id: "student-1", name: "Aarav Roy", rollNumber: "01" }]);
  const suggestion = applyAiMatchSuggestion(item, {
    matchStatus: "UNCERTAIN",
    suggestedStudentId: "student-1",
    confidence: 0.63,
  }, "data:image/jpeg;base64,preview");

  assert.equal(suggestion.status, null);
  assert.equal(suggestion.matchFlag, "UNCERTAIN");
  assert.equal(suggestion.verifiedByAi, true);
  assert.equal(hasUnreviewedAttendance([suggestion]), true);
});

test("an AI suggestion does not overwrite a teacher's explicit status", () => {
  const [item] = createReviewItems([{ id: "student-1", name: "Aarav Roy", rollNumber: "01" }]);
  const reviewedItem = { ...item, status: "ABSENT", verificationMethod: "MANUAL_ROSTER" };
  const suggestion = applyAiMatchSuggestion(reviewedItem, {
    matchStatus: "CONFIRMED",
    suggestedStudentId: "student-1",
    confidence: 0.94,
  }, "data:image/jpeg;base64,preview");

  assert.equal(suggestion.status, "ABSENT");
  assert.equal(hasUnreviewedAttendance([suggestion]), false);
});
