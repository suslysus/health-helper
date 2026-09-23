import test from "node:test";
import assert from "node:assert/strict";
import { loadAppData, saveAppData } from "../src/lib/storage.js";
import { INITIAL_INTAKE } from "../src/lib/program.js";

test("계획과 운동 기록을 로컬 저장소에서 다시 읽는다", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const data = { intake: { ...INITIAL_INTAKE, goal: "근육 증가" }, plan: { split: "full_body" }, drafts: {}, history: [{ date: "2026-09-22", exercises: [] }], revisions: [], locations: [{ id: "gym", name: "헬스장", equipment: ["맨몸", "덤벨"], ready: true }] };
  assert.equal(saveAppData(data), true);
  assert.deepEqual(loadAppData(), data);
});

test("기존 프로필의 주간 횟수·고정 시간·개인 기구 설정은 읽을 때 제거한다", () => {
  const legacy = { intake: { goal: "근육 증가", experience: "초급", preferences: "", avoid: "", daysPerWeek: 4, durationMinutes: 60, equipment: ["덤벨"] }, plan: { split: "hybrid", daysPerWeek: 4, durationMinutes: 60 }, locations: [{ id: "gym", name: "헬스장", equipment: ["덤벨"] }, { id: "place-1", name: "공원", equipment: ["철봉"] }] };
  globalThis.localStorage = { getItem: () => JSON.stringify(legacy), setItem: () => {} };
  assert.deepEqual(loadAppData().intake, { goal: "근육 증가", experience: "초급", preferences: "", avoid: "" });
  assert.deepEqual(loadAppData().plan, { split: "hybrid" });
  assert.deepEqual(loadAppData().locations.map((item) => item.ready), [false, true]);
});
