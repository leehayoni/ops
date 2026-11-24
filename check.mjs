// 모든 서비스 운영 점검. 의존성 없음 (Node 20+ 내장 fetch).
// 사용: node check.mjs            → status.json, STATUS.md 생성
//       GITHUB_TOKEN, GITHUB_REPOSITORY 가 있으면 문제별 이슈를 열고, 해결되면 닫는다.
import { readFileSync, writeFileSync } from "node:fs";

const TIMEOUT_MS = 15000;
const SLOW_MS = 4000;
const PRICE_MAX_AGE_DAYS = 30;
const MONEY_PATTERNS = /referralCode=|[?&](ref|via|aff|affiliate|referral)=|adsbygoogle|googlesyndication/i;
const COMMERCIAL = new Set(["affiliate", "ads", "paid"]);

const now = new Date();
const today = now.toISOString().slice(0, 10);
const { services, accounts = {} } = JSON.parse(readFileSync(new URL("./services.json", import.meta.url)));

// GitHub 리포 읽기: 계정(owner)별 토큰 → 없으면 기본 GITHUB_TOKEN(공개 리포만 읽힘)
async function gh(repo, path) {
  const owner = repo.split("/")[0];
  const token = process.env[accounts[owner]] || process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json", "user-agent": "ops-check" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers });
  return { status: r.status, json: r.ok ? await r.json() : null };
}

async function get(url, opts = {}) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "user-agent": "ops-check", ...(opts.headers || {}) } });
    const text = await r.text();
    return { ok: r.ok, status: r.status, ms: Date.now() - t0, text };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, text: "", error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(timer);
  }
}

function dig(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function sameOriginScripts(html, base) {
  const out = new Set();
  const re = /<(?:script[^>]+src|link[^>]+rel=["']modulepreload["'][^>]*href)=["']([^"']+\.js)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === new URL(base).origin) out.add(u.href);
    } catch {}
  }
  return [...out];
}

async function checkService(s) {
  const findings = []; // { level: fail|warn|info, check, msg }
  const add = (level, check, msg) => findings.push({ level, check, msg });
  const result = { id: s.id, name: s.name, url: s.url, status: s.status, pages: [], api: [], findings };

  if (s.status !== "active") return result;

  // 1) 페이지 응답
  let firstHtml = "";
  for (const p of s.pages || ["/"]) {
    const url = new URL(p, s.url).href;
    const r = await get(url);
    result.pages.push({ path: p, status: r.status, ms: r.ms });
    if (!r.ok) add("fail", `down:${p}`, `${p} 응답 실패 (${r.status || r.error})`);
    else if (r.ms > SLOW_MS) add("warn", `slow:${p}`, `${p} 응답 ${r.ms}ms (느림)`);
    if (!firstHtml && r.ok) firstHtml = r.text;
  }

  // 2) 번들 읽기 (GA·수익 링크 감지용)
  let bundle = firstHtml;
  if (firstHtml) {
    for (const src of sameOriginScripts(firstHtml, s.url)) {
      const r = await get(src);
      if (r.ok) bundle += "\n" + r.text;
    }
  }

  // 3) GA 측정
  if (s.ga) {
    if (bundle && !bundle.includes(s.ga)) add("fail", "ga", `배포본에 GA ID(${s.ga})가 없음 → 방문·이벤트가 기록되지 않는 중`);
  } else {
    add("info", "ga", "GA 미설정 (방문 수는 Vercel/Cloudflare Analytics로만 확인)");
  }

  // 4) 수익 모델 vs 호스팅 정책
  const host = new URL(s.url).hostname;
  const onHobby = host.endsWith(".vercel.app");
  const moneyFound = MONEY_PATTERNS.test(bundle);
  if (onHobby && COMMERCIAL.has(s.money)) {
    add("warn", "policy", `Vercel Hobby(비상업 전용)에서 수익 모델 '${s.money}' 운영 중 → 프로젝트 정지 위험. Cloudflare Pages 이전 필요`);
  }
  if (moneyFound && !COMMERCIAL.has(s.money)) {
    add("warn", "money-drift", `배포본에서 제휴/광고 링크 패턴 감지, services.json의 money='${s.money}'와 다름`);
  }

  // 5) API
  for (const a of s.api || []) {
    const url = a.url || new URL(a.path, s.url).href;
    const opts = a.method === "POST"
      ? { method: "POST", body: JSON.stringify(a.body || {}), headers: { "content-type": "application/json", origin: s.url } }
      : {};
    const r = await get(url, opts);
    let json = null;
    try { json = JSON.parse(r.text); } catch {}
    const entry = { name: a.name, status: r.status, ms: r.ms };
    result.api.push(entry);
    const key = `api:${a.name}`;
    if (!r.ok) { add("fail", key, `${a.name} 실패 (${r.status || r.error})`); continue; }
    if (a.expect && json) {
      for (const [k, v] of Object.entries(a.expect)) {
        if (dig(json, k) !== v) add("fail", key, `${a.name}: ${k}=${JSON.stringify(dig(json, k))} (기대값 ${JSON.stringify(v)})`);
      }
    }
    if (a.expectPath && (json == null || dig(json, a.expectPath) == null)) add("fail", key, `${a.name}: 응답에 ${a.expectPath} 없음`);
    const asOf = json && json.asOf;
    if (asOf) {
      const age = Math.floor((now - new Date(asOf)) / 864e5);
      entry.asOf = asOf;
      if (age > PRICE_MAX_AGE_DAYS) add("warn", "stale-data", `가격 데이터 기준일 ${asOf} (${age}일 지남) → 가격 재확인 필요`);
    }
  }

  // 6) 리포: 최근 커밋, 사용자 신고 이슈(feedback / error / down)
  if (s.repo) {
    const meta = await gh(s.repo, "");
    if (!meta.json) {
      add("warn", "repo-access", `리포 ${s.repo} 읽기 실패(${meta.status}) → 비공개라면 ops Secrets에 ${accounts[s.repo.split("/")[0]] || "토큰"} 필요`);
    } else {
      const since = new Date(now - 7 * 864e5).toISOString();
      const commits = await gh(s.repo, `/commits?per_page=1`);
      const last = commits.json?.[0]?.commit?.committer?.date;
      const issues = await gh(s.repo, `/issues?state=open&per_page=100`);
      const userIssues = (issues.json || []).filter((i) => !i.pull_request && i.labels.some((l) => ["feedback", "error", "down"].includes(l.name)));
      result.repo = {
        name: s.repo, private: meta.json.private, lastCommit: last || null,
        openUserIssues: userIssues.length,
        newUserIssues7d: userIssues.filter((i) => i.created_at >= since).length,
        issues: userIssues.slice(0, 10).map((i) => ({ title: i.title, labels: i.labels.map((l) => l.name), created: i.created_at, url: i.html_url })),
      };
      const errs = userIssues.filter((i) => i.labels.some((l) => ["error", "down"].includes(l.name)));
      if (errs.length) add("fail", "user-errors", `사용자 신고 에러/다운 이슈 ${errs.length}건 열림 (${s.repo})`);
    }
  }

  // 7) 운영 메모
  if (!s.repo) add("info", "no-repo", "GitHub 리포 없음 → 코드 백업·피드백 이슈 수집이 안 됨");
  if (s.seasonEnds && today > s.seasonEnds) add("info", "season", `시즌 종료(${s.seasonEnds}) → 접기 검토`);

  return result;
}

const results = [];
for (const s of services) results.push(await checkService(s));

// ---- 출력 ----
const icon = { fail: "🔴", warn: "🟡", info: "⚪" };
const worst = (r) => (r.status !== "active" ? "retired" : r.findings.some((f) => f.level === "fail") ? "fail" : r.findings.some((f) => f.level === "warn") ? "warn" : "ok");
writeFileSync("status.json", JSON.stringify({ checkedAt: now.toISOString(), results }, null, 2));

let md = `# 서비스 운영 상태\n\n점검 시각: ${now.toISOString()} (UTC)\n\n| 서비스 | 상태 | 페이지 | API | 리포 (최근 커밋 · 열린 신고) |\n|---|---|---|---|---|\n`;
for (const r of results) {
  const st = { ok: "🟢 정상", warn: "🟡 주의", fail: "🔴 문제", retired: "⚫ 접음" }[worst(r)];
  const pages = r.pages.map((p) => `${p.path} ${p.status} (${p.ms}ms)`).join("<br>") || "-";
  const api = r.api.map((a) => `${a.name} ${a.status}`).join("<br>") || "-";
  const rp = r.repo ? `${r.repo.name} · ${(r.repo.lastCommit || "-").slice(0, 10)} · ${r.repo.openUserIssues}건` : "-";
  md += `| [${r.name}](${r.url}) | ${st} | ${pages} | ${api} | ${rp} |\n`;
}
md += `\n## 발견 사항\n\n`;
for (const r of results) for (const f of r.findings) md += `- ${icon[f.level]} **${r.name}** — ${f.msg}\n`;
writeFileSync("STATUS.md", md);
console.log(md);

// ---- 이슈 동기화 (fail/warn만) ----
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (token && repo) {
  const api = (path, opts = {}) =>
    fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...opts,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
    }).then((r) => r.json());
  const open = await api(`/issues?state=open&labels=ops&per_page=100`);
  const openByTitle = new Map((Array.isArray(open) ? open : []).map((i) => [i.title, i]));
  const wanted = new Set();
  for (const r of results) {
    for (const f of r.findings.filter((f) => f.level !== "info")) {
      const title = `[ops] ${r.name}: ${f.check}`;
      wanted.add(title);
      if (!openByTitle.has(title)) {
        await api(`/issues`, { method: "POST", body: JSON.stringify({ title, labels: ["ops", f.level], body: `${icon[f.level]} ${f.msg}\n\n서비스: ${r.url}\n처음 발견: ${now.toISOString()}\n\n해결되면 다음 점검 때 자동으로 닫힙니다.` }) });
      }
    }
  }
  for (const [title, issue] of openByTitle) {
    if (!wanted.has(title)) {
      await api(`/issues/${issue.number}/comments`, { method: "POST", body: JSON.stringify({ body: `✅ ${now.toISOString()} 점검에서 해결 확인. 자동으로 닫습니다.` }) });
      await api(`/issues/${issue.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
    }
  }
}

if (results.some((r) => worst(r) === "fail")) process.exitCode = 0; // 실패는 이슈로 알리고, 워크플로 자체는 성공 처리
