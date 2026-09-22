import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { EXERCISES } from "../src/lib/program.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const localEnv = resolve(root, ".env.local");
if (existsSync(localEnv)) process.loadEnvFile(localEnv);
const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || (dev ? 5173 : 8787));
const host = process.env.HOST || "127.0.0.1";

const planShape = {
  type: "object",
  additionalProperties: false,
  properties: {
    split: { type: "string", enum: ["full_body", "upper_lower", "ppl", "hybrid"] },
    daysPerWeek: { type: "integer" },
    durationMinutes: { type: "integer" },
    goalSummary: { type: "string" },
    focus: { type: "string" },
    rationale: { type: "string" },
    backVariety: { type: "boolean" },
    excludedExerciseIds: { type: "array", items: { type: "string" } },
    changeSummary: { type: "string" },
  },
  required: ["split", "daysPerWeek", "durationMinutes", "goalSummary", "focus", "rationale", "backVariety", "excludedExerciseIds", "changeSummary"],
};

const proposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    plan: planShape,
    exerciseIds: { type: "array", items: { type: "string" } },
    explanation: { type: "string" },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { split: { type: "string", enum: ["full_body", "upper_lower", "ppl", "hybrid"] }, reason: { type: "string" } },
        required: ["split", "reason"],
      },
    },
    questions: { type: "array", items: { type: "string" } },
  },
  required: ["plan", "exerciseIds", "explanation", "alternatives", "questions"],
};

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32_000) throw new Error("요청 내용이 너무 깁니다.");
  }
  return JSON.parse(body || "{}");
}

export async function requestPlan({ intake, currentPlan, request, scope, currentSession, history }) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("서버에 OPENAI_API_KEY가 설정되지 않았습니다.");
    error.status = 503;
    throw error;
  }
  if (!intake || typeof intake.goal !== "string" || intake.goal.trim().length < 5) {
    const error = new Error("운동 목표를 먼저 구체적으로 입력해주세요.");
    error.status = 400;
    throw error;
  }

  const catalog = EXERCISES.map(({ id, name, target, equipment }) => ({ id, name, target, equipment }));
  const userInput = JSON.stringify({ intake, currentPlan, request, scope, currentSession, recentHistory: (history || []).slice(-6), catalog });
  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      store: false,
      max_output_tokens: 1800,
      instructions: [
        "You are a practical strength-training plan assistant. Answer in Korean.",
        "Compare full-body, upper/lower, PPL and hybrid based on the user's goal, schedule, experience and preferences; never assume PPL by default.",
        "The user wants back exercise selections to differ on each back-training day, not to train back every day.",
        "Respect available equipment and avoid notes. Only use catalog exercise IDs.",
        "A plan is a flexible principle, not a fixed list of exercises. Today's exerciseIds are a concrete preview.",
        "Include two viable alternative splits with brief tradeoffs in alternatives.",
        "For initial onboarding only, ask up to two short clarification questions if a critical fact is missing. Otherwise return an empty questions array. If intake.clarifications exists, return an empty questions array and make the proposal.",
        "For scope=today, keep the long-term plan unchanged and change only exerciseIds.",
        "Do not diagnose pain or prescribe treatment. For pain or injury concerns suggest a qualified professional.",
        "Keep explanation and rationale brief and clear.",
      ].join(" "),
      input: userInput,
      text: { format: { type: "json_schema", name: "training_proposal", strict: true, schema: proposalSchema } },
    }),
    signal: AbortSignal.timeout(35_000),
  });

  if (!upstream.ok) {
    const error = new Error(upstream.status === 401 ? "OpenAI API 키를 확인해주세요." : `AI 요청에 실패했습니다. (${upstream.status})`);
    error.status = 502;
    throw error;
  }
  const response = await upstream.json();
  const text = response.output_text ?? response.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("AI 응답에서 계획을 읽지 못했습니다. 다시 시도해주세요.");
  return JSON.parse(text);
}

let vite;
if (dev) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    appType: "spa",
  });
}

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (url.pathname === "/api/status" && req.method === "GET") {
      sendJson(res, 200, { configured: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || "gpt-5-mini" });
      return;
    }
    if (url.pathname === "/api/plan" && req.method === "POST") {
      const payload = await readJson(req);
      const proposal = await requestPlan(payload);
      sendJson(res, 200, proposal);
      return;
    }
    if (dev) {
      vite.middlewares(req, res);
      return;
    }
    const dist = resolve(root, "dist");
    const file = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    const target = file.startsWith(dist + sep) && (await stat(file).catch(() => null))?.isFile() ? file : resolve(dist, "index.html");
    const data = await readFile(target);
    res.writeHead(200, { "content-type": `${mime[extname(target)] || "application/octet-stream"}; charset=utf-8` });
    res.end(data);
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || "서버 오류가 발생했습니다." });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Health Helper ${dev ? "development" : "production"} server: http://${host}:${port}/\n`);
});
