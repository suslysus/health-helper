import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiClient } from "../src/lib/geminiClient.js";
import { validateStructuredOutput } from "../src/lib/ai.js";

const ok = (value = { value: "ok" }) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }) });
const fail = (status, error, retryAfter = null) => ({ ok: false, status, headers: { get: () => retryAfter }, json: async () => ({ error }) });
const fast = (options) => createGeminiClient({ spacingMs: 0, sleep: async () => {}, ...options });

test("동일 요청을 합치고 서로 다른 요청은 순서대로 실행해 순간 요청 폭주를 줄인다", async () => {
  let calls = 0, active = 0, peak = 0;
  const client = fast({ fetchImpl: async () => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--; return ok();
  } });
  const [a, b] = await Promise.all([client.request("endpoint", "key", { a: 1 }), client.request("endpoint", "key", { a: 1 }), client.request("endpoint", "key", { a: 2 })]);
  assert.equal(calls, 2);
  assert.equal(peak, 1);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
});

test("짧은 429 RetryInfo만 한 번 기다려 재시도하고 헤더는 노출하지 않는다", async () => {
  let calls = 0;
  const waits = [];
  const client = fast({ sleep: async (ms) => waits.push(ms), fetchImpl: async () => ++calls === 1
    ? fail(429, { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" }] }) : ok() });
  assert.deepEqual(await client.request("endpoint", "secret", {}), { value: "ok" });
  assert.equal(calls, 2);
  assert.ok(waits.includes(2000));
});

test("일일 한도와 0 할당량은 자동 재시도하지 않고 한국어로 구분한다", async () => {
  for (const details of [{ quotaId: "GenerateRequestsPerDayPerProject" }, { message: "Quota exceeded, limit: 0" }]) {
    let calls = 0;
    const client = fast({ fetchImpl: async () => { calls++; return fail(429, { message: "RESOURCE_EXHAUSTED", details: [details] }); } });
    await assert.rejects(client.request("endpoint", "secret", {}), (error) => error.code === "quota_exhausted" && /할당량/.test(error.message));
    assert.equal(calls, 1);
  }
});

test("긴 Retry-After를 무시하고 재요청하지 않으며 다음 버튼 요청도 제한한다", async () => {
  let calls = 0;
  const client = fast({ now: () => 1000, fetchImpl: async () => { calls++; return fail(429, {}, "45"); } });
  await assert.rejects(client.request("endpoint", "key", { name: "밥" }), (error) => error.code === "rate_limited" && error.retryAfterSeconds === 45);
  await assert.rejects(client.request("endpoint", "key", { name: "닭" }), (error) => error.code === "rate_limited");
  assert.equal(calls, 1);
});

test("유효한 영양 결과만 짧게 재사용하고 키·입력 차이와 만료를 구분한다", async () => {
  let calls = 0, now = 0;
  const client = fast({ now: () => now, fetchImpl: async () => { calls++; return ok(); } });
  const options = { cacheMs: 100 };
  await client.request("endpoint", "key", { name: "밥" }, options);
  await client.request("endpoint", "key", { name: "밥" }, options);
  assert.equal(calls, 1);
  await client.request("endpoint", "other-key", { name: "밥" }, options);
  await client.request("endpoint", "key", { name: "밥 2개" }, options);
  now = 101;
  await client.request("endpoint", "key", { name: "밥" }, options);
  assert.equal(calls, 4);
});

test("누락되거나 타입이 잘못된 JSON은 캐시하지 않고 다시 요청할 수 있다", async () => {
  let calls = 0;
  const schema = { type: "object", required: ["calories"], properties: { calories: { type: "number" } } };
  const client = fast({ fetchImpl: async () => { calls++; return ok(calls === 1 ? { calories: "알 수 없음" } : { calories: 100 }); } });
  const options = { cacheMs: 1000, validate: (value) => validateStructuredOutput(value, schema) };
  await assert.rejects(client.request("endpoint", "key", {}, options), (error) => error.code === "invalid_response");
  assert.deepEqual(await client.request("endpoint", "key", {}, options), { calories: 100 });
  assert.equal(calls, 2);
});

test("400 요청 형식 오류와 잘못된 키를 구분하고 원문 비밀값을 오류에 싣지 않는다", async () => {
  const malformed = fast({ fetchImpl: async () => fail(400, { message: "Invalid schema for SECRET" }) });
  await assert.rejects(malformed.request("endpoint", "SECRET", {}), (error) => error.code === "bad_request" && !error.message.includes("SECRET"));
  const invalidKey = fast({ fetchImpl: async () => fail(400, { message: "API key not valid" }) });
  await assert.rejects(invalidKey.request("endpoint", "SECRET", {}), (error) => error.code === "invalid_key");
});

test("30초 제한으로 멈춘 요청과 일반 네트워크 실패를 구분한다", async () => {
  const timeout = fast({ timeoutMs: 5, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("abort")))) });
  await assert.rejects(timeout.request("endpoint", "key", {}), (error) => error.code === "timeout");
  const network = fast({ fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(network.request("endpoint", "key", {}), (error) => error.code === "network_error");
});

test("생각 파트는 JSON에서 빼고 응답 차단과 길이 초과는 별도 오류로 다룬다", async () => {
  const client = fast({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: "thinking" }, { text: '{"ok":true}' }] } }] }) }) });
  assert.deepEqual(await client.request("endpoint", "key", {}), { ok: true });
  for (const [reason, code] of [["SAFETY", "blocked"], ["MAX_TOKENS", "truncated"]]) {
    const blocked = fast({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: reason }] }) }) });
    await assert.rejects(blocked.request("endpoint", "key", {}), (error) => error.code === code);
  }
});

test("분당 제한의 일반 billing 안내 문구만으로 일일 소진으로 오인하지 않는다", async () => {
  const client = fast({ fetchImpl: async () => fail(429, { message: "You exceeded your current quota, please check your plan and billing details", details: [{ quotaId: "GenerateRequestsPerMinutePerProject" }] }, "30") });
  await assert.rejects(client.request("endpoint", "key", {}), (error) => error.code === "rate_limited");
});

test("취소 신호를 지원하지 않는 네이티브 fetch도 UI 대기 제한은 종료된다", async () => {
  const client = fast({ timeoutMs: 5, fetchImpl: () => new Promise(() => {}) });
  await assert.rejects(client.request("endpoint", "key", {}), (error) => error.code === "timeout");
});
