import { test } from "node:test";
import assert from "node:assert";
import { euclideanDistance, distanceToConfidence } from "../client/src/lib/ai/faceMatcher.js";
test("Euclidean distance returns 0 for identical vectors", () => {
    const v1 = [0.1, 0.2, 0.3, 0.4];
    const v2 = [0.1, 0.2, 0.3, 0.4];
    const dist = euclideanDistance(v1, v2);
    assert.strictEqual(dist, 0);
});
test("Euclidean distance computes correct distance for orthogonal unit vectors", () => {
    const v1 = [1, 0, 0, 0];
    const v2 = [0, 1, 0, 0];
    const dist = euclideanDistance(v1, v2);
    assert.strictEqual(Math.round(dist * 1000) / 1000, 1.414); // sqrt(2) ~ 1.414
});
test("Distance to confidence maps distance to percentage correctly", () => {
    const conf1 = distanceToConfidence(0); // perfect match
    assert.strictEqual(conf1, 1);
    const conf2 = distanceToConfidence(0.5); // close match
    assert.ok(conf2 > 0.5 && conf2 <= 0.8);
    const conf3 = distanceToConfidence(1.2); // far match
    assert.strictEqual(conf3, 0.04);
});
