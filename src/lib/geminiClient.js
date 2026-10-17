export class GeminiError extends Error {
  constructor(message, { code, status = 0, retryAfterSeconds = 0 } = {}) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function upstreamError(response, payload, now) {
  const status = response.status;
  const details = payload?.error?.details || [];
  const diagnostic = JSON.stringify(payload?.error || {});
  const header = response.headers?.get?.("retry-after");
  const retryInfo = details.find((detail) => detail["@type"]?.endsWith("RetryInfo"));
  const seconds = header == null ? Number.parseFloat(retryInfo?.retryDelay || "")
    : /^\d+(?:\.\d+)?$/.test(header) ? Number(header) : (Date.parse(header) - now) / 1000;
  const retryAfterSeconds = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 0;
  if (status === 429) {
    const daily = /per.?day|daily|spend|quotaValue["\s:]+0\b|limit:\s*0\b/i.test(diagnostic);
    return new GeminiError(daily
      ? "Gemini의 일일 한도 또는 프로젝트 할당량을 사용할 수 없습니다. Google AI Studio에서 사용량과 한도를 확인해 주세요. 한도가 회복되기 전에는 다시 요청해도 해결되지 않습니다."
      : `Gemini 요청이 잠시 몰렸습니다.${retryAfterSeconds ? ` 약 ${retryAfterSeconds}초 후 다시 시도해 주세요.` : " 잠시 후 다시 시도해 주세요."} 같은 프로젝트의 다른 앱 사용량도 함께 계산됩니다.`,
    { code: daily ? "quota_exhausted" : "rate_limited", status, retryAfterSeconds });
  }
  if (status === 401 || (status === 400 && /API_KEY_INVALID|API key not valid/i.test(diagnostic))) return new GeminiError("Gemini API 키가 유효하지 않습니다. 프로필에서 키를 다시 확인해 주세요.", { code: "invalid_key", status });
  if (status === 403) return new GeminiError("Gemini API 사용 권한 또는 키 제한을 확인해 주세요. 키가 속한 프로젝트에서 API 사용이 허용되어야 합니다.", { code: "forbidden", status });
  if (status === 400) return new GeminiError("Gemini가 요청 형식이나 사진을 처리하지 못했습니다. 입력을 확인하고 다시 시도해 주세요.", { code: "bad_request", status });
  if (status === 404) return new GeminiError("현재 Gemini 모델을 사용할 수 없습니다. 앱의 AI 모델 설정을 확인해야 합니다.", { code: "model_unavailable", status });
  return new GeminiError(status >= 500 ? "Gemini 서버에 일시적인 오류가 있습니다. 잠시 후 다시 시도해 주세요." : `Gemini 요청에 실패했습니다 (${status}).`, { code: "upstream_error", status });
}

export function parseGeminiResponse(payload) {
  const candidate = payload?.candidates?.[0];
  if (payload?.promptFeedback?.blockReason || ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate?.finishReason)) throw new GeminiError("Gemini가 이 입력의 응답 생성을 제한했습니다. 음식 이름이나 사진을 다시 확인해 주세요.", { code: "blocked" });
  if (candidate?.finishReason === "MAX_TOKENS") throw new GeminiError("AI 응답이 길어 중간에 끊겼습니다. 입력을 짧게 나눠 다시 시도해 주세요.", { code: "truncated" });
  const output = candidate?.content?.parts?.filter((part) => !part.thought).map((part) => part.text || "").join("");
  if (!output) throw new GeminiError("AI 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요.", { code: "empty_response" });
  try { return JSON.parse(output.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); }
  catch { throw new GeminiError("AI 응답 형식이 올바르지 않습니다. 다시 시도하거나 직접 입력해 주세요.", { code: "invalid_json" }); }
}

export function createGeminiClient({ fetchImpl = (...args) => fetch(...args), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now, timeoutMs = 30_000, spacingMs = 1_000 } = {}) {
  let queue = Promise.resolve();
  let lastRequestAt = null;
  const pending = new Map();
  const cache = new Map();
  const cooldowns = new Map();

  async function send(endpoint, apiKey, body) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cooldown = cooldowns.get(apiKey);
      if (cooldown && cooldown.until > now()) throw new GeminiError(cooldown.error.message, { ...cooldown.error, retryAfterSeconds: Math.ceil((cooldown.until - now()) / 1000) });
      if (lastRequestAt != null) await sleep(Math.max(0, spacingMs - (now() - lastRequestAt)));
      lastRequestAt = now();
      const controller = new AbortController();
      let timeout;
      const deadline = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, timeoutMs);
      });
      let response, payload;
      try {
        // Capacitor's patched native fetch may not honor AbortSignal. The race
        // also bounds the UI wait in that environment, including body parsing.
        ({ response, payload } = await Promise.race([deadline, (async () => {
          const response = await fetchImpl(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body, signal: controller.signal });
          let payload;
          try { payload = await response.json(); }
          catch (error) { if (controller.signal.aborted) throw error; payload = null; }
          return { response, payload };
        })()]));
      } catch {
        throw new GeminiError(controller.signal.aborted ? "Gemini 응답 시간이 초과되었습니다. 연결을 확인하고 다시 시도해 주세요." : "네트워크에 연결할 수 없습니다. 연결을 확인하고 다시 시도해 주세요.", { code: controller.signal.aborted ? "timeout" : "network_error" });
      } finally { clearTimeout(timeout); }
      if (response.ok) return parseGeminiResponse(payload);
      const error = upstreamError(response, payload, now());
      const waitSeconds = error.retryAfterSeconds || (attempt + 1);
      const retryable = error.code === "rate_limited" || [500, 502, 503, 504].includes(response.status);
      if (attempt === 0 && retryable && waitSeconds <= 3) { await sleep(waitSeconds * 1000); continue; }
      if (response.status === 429) cooldowns.set(apiKey, { until: now() + (error.retryAfterSeconds || 60) * 1000, error });
      throw error;
    }
  }

  return {
    request(endpoint, apiKey, input, { cacheMs = 0, validate = () => {} } = {}) {
      const body = JSON.stringify(input);
      const key = JSON.stringify([endpoint, apiKey, body]);
      const cached = cache.get(key);
      if (cached?.until > now()) return Promise.resolve(structuredClone(cached.value));
      if (pending.has(key)) return pending.get(key).then(structuredClone);
      const request = queue.then(() => send(endpoint, apiKey, body)).then((value) => { validate(value); return value; });
      queue = request.catch(() => {});
      pending.set(key, request);
      return request.then((value) => {
        if (cacheMs > 0) {
          cache.delete(key);
          cache.set(key, { value: structuredClone(value), until: now() + cacheMs });
          while (cache.size > 20) cache.delete(cache.keys().next().value);
        }
        return structuredClone(value);
      }).finally(() => pending.delete(key));
    },
    clearCache() { cache.clear(); cooldowns.clear(); },
  };
}
