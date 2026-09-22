import test from "node:test";
import assert from "node:assert/strict";
import { loadAppData, saveAppData } from "../src/lib/storage.js";

test("계획과 운동 기록을 로컬 저장소에서 다시 읽는다", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const data = { intake: { goal: "근육 증가" }, plan: { split: "full_body" }, drafts: {}, history: [{ date: "2026-09-22", exercises: [] }], revisions: [] };
  assert.equal(saveAppData(data), true);
  assert.deepEqual(loadAppData(), data);
});
