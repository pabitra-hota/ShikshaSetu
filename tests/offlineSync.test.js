import { test } from "node:test";
import assert from "node:assert";
import { generateOperationId } from "../client/src/lib/offline/service.js";
test("generateOperationId creates unique keys with op_ prefix", () => {
    const id1 = generateOperationId();
    const id2 = generateOperationId();
    assert.ok(id1.startsWith("op_"));
    assert.ok(id2.startsWith("op_"));
    assert.notStrictEqual(id1, id2);
});
