import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const normalize = (path) => relative(root, path).replaceAll("\\", "/");
async function walk(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(resolve(folder, entry.name)) : [resolve(folder, entry.name)]))).flat();
}
const sources = (await walk(resolve(root, "src"))).filter((path) => /\.(?:js|jsx|css)$/.test(path));
const graph = new Map();
const external = new Set();
for (const path of sources) {
  const source = await readFile(path, "utf8");
  const imports = [...source.matchAll(/(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] || match[2]);
  const dependencies = [];
  for (const specifier of imports) {
    if (!specifier.startsWith(".")) { external.add(specifier); continue; }
    const base = resolve(dirname(path), specifier);
    let found;
    for (const candidate of extname(base) ? [base] : [base, `${base}.js`, `${base}.jsx`, `${base}.css`]) {
      if (await stat(candidate).then((entry) => entry.isFile()).catch(() => false)) { found = candidate; break; }
    }
    if (!found) throw new Error(`Missing import: ${normalize(path)} -> ${specifier}`);
    dependencies.push(found);
  }
  graph.set(path, [...new Set(dependencies)].sort());
}
const reached = new Set();
const visiting = new Set();
function visit(path) {
  if (visiting.has(path)) throw new Error(`Circular dependency: ${[...visiting, path].map(normalize).join(" -> ")}`);
  if (reached.has(path)) return;
  visiting.add(path);
  for (const dependency of graph.get(path) || []) visit(dependency);
  visiting.delete(path);
  reached.add(path);
}
visit(resolve(root, "src/main.jsx"));
const orphans = sources.filter((path) => !reached.has(path));
if (orphans.length) throw new Error(`Unreachable source files: ${orphans.map(normalize).join(", ")}`);
if (process.argv.includes("--write-doc")) {
  await mkdir(resolve(root, "docs"), { recursive: true });
  const rows = [...graph].sort(([a], [b]) => a.localeCompare(b)).map(([path, dependencies]) => `| ${normalize(path)} | ${dependencies.map(normalize).join("<br>") || "외부 라이브러리 또는 독립 모듈"} |`);
  await writeFile(resolve(root, "docs/DEPENDENCIES.md"), `# 소스 의존관계\n\n\`node scripts/check-dependencies.mjs --write-doc\`로 재생성합니다.\n\n진입점: \`src/main.jsx\`. 순환 참조·누락된 import·진입점에서 도달할 수 없는 JS/JSX/CSS 파일을 검사합니다.\n\n| 파일 | 직접 참조하는 로컬 파일 |\n|---|---|\n${rows.join("\n")}\n\n외부 패키지: ${[...external].sort().join(", ")}\n\nAndroid Java 및 정적 이미지 연결은 ARCHITECTURE.md를 참고하세요.\n`);
}
console.log(`Dependency check passed: ${sources.length} source files; no missing imports, cycles, or orphan sources.`);
