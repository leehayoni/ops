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
  const add = (level, check, msg, fix) => findings.push({ level, check, msg, ...(fix ? { fix } : {}) });
  const result = { id: s.id, name: s.name, url: s.url, status: s.status, pages: [], api: [], findings };

  if (s.status !== "active") return result;

  // 1) 페이지 응답
  let firstHtml = "";
  for (const p of s.pages || ["/"]) {
    const url = new URL(p, s.url).href;
    const r = await get(url);
    result.pages.push({ path: p, status: r.status, ms: r.ms });
    if (!r.ok) add("fail", `down:${p}`, `${p} 응답 실패 (${r.status || r.error})`, "배포 대시보드에서 최근 배포 실패 여부 확인 후 재배포");
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

  // 2.5) 성장 기본기: 방문자 측정 · 링크 미리보기 · 검색 등록 · 포털
  if (firstHtml) {
    const vercelAnalytics = firstHtml.includes("/_vercel/insights/script.js");
    const cfAnalytics = /static\.cloudflareinsights\.com|cf-beacon/i.test(firstHtml);
    const gaTag = /googletagmanager\.com\/gtag|gtag\(/i.test(bundle);
    if (vercelAnalytics) {
      const r = await get(new URL("/_vercel/insights/script.js", s.url).href);
      if (!r.ok) add("warn", "analytics-off", `Vercel Web Analytics가 꺼져 있음 (스크립트 ${r.status || r.error}) → 방문자 수가 0으로 쌓이는 중`,
        "Vercel → 이 프로젝트 → Analytics 탭 → Enable (무료)");
    } else if (!cfAnalytics && !gaTag && !s.ga) {
      add("warn", "no-analytics", "방문자 측정 도구가 없음 → 이 서비스는 판정할 숫자가 안 쌓임",
        "Vercel이면 Analytics 탭에서 Enable 후 index.html에 스크립트 추가, Cloudflare면 Web Analytics 켜기");
    }

    const og = firstHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || firstHtml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!og) {
      add("warn", "og-image", "링크 미리보기 이미지(og:image)가 없음 → 카톡·Threads에 공유하면 글자만 보임",
        "1200×630 이미지를 만들어 <meta property=\"og:image\" content=\"https://…/og.png\"> 추가");
    } else {
      const r = await get(new URL(og[1], s.url).href);
      if (!r.ok) add("warn", "og-image", `미리보기 이미지 주소가 열리지 않음 (${r.status || r.error}): ${og[1]}`, "이미지 파일이 배포에 포함됐는지 확인");
    }

    if (s.seo) {
      for (const f of ["robots.txt", "sitemap.xml"]) {
        const r = await get(new URL("/" + f, s.url).href);
        const looksHtml = r.ok && /<html/i.test(r.text.slice(0, 500));
        if (!r.ok || looksHtml) add("warn", `seo:${f}`, `${f} 파일이 없음${looksHtml ? " (앱 화면이 대신 나옴)" : ""} → 검색엔진이 페이지를 찾기 어려움`, `public/${f} 추가 후 재배포`);
      }
      if (!s.searchConsole) add("info", "search-console", "Google Search Console 등록 여부가 services.json에 기록돼 있지 않음",
        "등록·인증했으면 services.json에 \"searchConsole\": \"YYYY-MM-DD\" 추가");
    }
  }
  for (const pt of s.portals || []) {
    const label = { review: "심사 중", live: "출시됨", rejected: "반려", draft: "준비 중" }[pt.status] || pt.status;
    if (pt.status === "rejected") add("warn", `portal:${pt.name}`, `${pt.name} ${label}${pt.note ? ` — ${pt.note}` : ""}`, "반려 사유 확인 후 수정해서 재제출");
    else if (pt.status === "review") {
      const days = pt.since ? Math.floor((now - new Date(pt.since)) / 864e5) : null;
      add(days != null && days > 7 ? "warn" : "info", `portal:${pt.name}`, `${pt.name} ${label}${days != null ? ` (${days}일째)` : ""}`,
        days != null && days > 7 ? "개발자 포털에서 진행 상황 확인" : undefined);
    }
  }
  result.portals = s.portals || [];

  // 3) GA 측정
  if (s.ga) {
    if (bundle && !bundle.includes(s.ga)) add("fail", "ga", `배포본에 GA ID(${s.ga})가 없음 → 방문·이벤트가 기록되지 않는 중`, "빌드 환경변수에 GA ID가 들어갔는지 확인 후 재배포");
  } else {
  }

  // 4) 수익 모델 vs 호스팅 정책
  const host = new URL(s.url).hostname;
  const onHobby = host.endsWith(".vercel.app");
  const moneyFound = MONEY_PATTERNS.test(bundle);
  if (onHobby && COMMERCIAL.has(s.money)) {
    add("warn", "policy", `Vercel Hobby(비상업 전용)에서 수익 모델 '${s.money}' 운영 중 → 프로젝트 정지 위험`, "Cloudflare Pages(무료, 상업 이용 가능)로 이전");
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
      if (errs.length) add("fail", "user-errors", `사용자 신고 에러/다운 이슈 ${errs.length}건 열림 (${s.repo})`, "GitHub 이슈 확인");
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
const rank = { fail: 0, warn: 1, info: 2 };
for (const r of results) {
  r.state = worst(r);
  const top = [...r.findings].filter((f) => f.fix).sort((a, b) => rank[a.level] - rank[b.level])[0];
  r.next = top ? { level: top.level, msg: top.msg, fix: top.fix } : null;
}
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
