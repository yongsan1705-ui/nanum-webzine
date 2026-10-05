// ─────────────────────────────────────────────
// 관리자 전용: 로그인, 운영 대시보드, 관리자 계정 해시 만들기
// 계정은 admin-config.js에서 관리합니다.
//
// ※ 이 방식은 서버 없이 동작하는 연습용 접근 제한입니다.
//   브라우저 개발자 도구로 우회할 수 있으므로 실제 개인정보를 다루기 전에
//   반드시 서버 측 인증(호스팅 로그인, 사내 SSO 등)으로 교체하세요.
// ─────────────────────────────────────────────

const root = document.getElementById("admin");
const byId = id => ARTICLES.find(a => a.id === id);
const SESSION_KEY = "nanum-admin-session";
const LOCK_KEY = "nanum-admin-lock";
const LOG_KEY = "nanum-admin-log";

// ── SHA-256 (crypto.subtle이 없는 환경을 위한 대체 구현 포함) ──
async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Fallback(bytes);
}

function sha256Fallback(bytes) {
  const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const l = bytes.length, withPad = ((l + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(withPad); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(withPad - 4, (l * 8) >>> 0); dv.setUint32(withPad - 8, Math.floor(l / 0x20000000));
  const w = new Uint32Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < withPad; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = r(w[i-15], 7) ^ r(w[i-15], 18) ^ (w[i-15] >>> 3), s1 = r(w[i-2], 17) ^ r(w[i-2], 19) ^ (w[i-2] >>> 10);
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
  }
  return H.map(v => v.toString(16).padStart(8, "0")).join("");
}

// ── 저장 도우미 ──
const readJSON = (store, key, fallback) => { try { return JSON.parse(store.getItem(key)) ?? fallback; } catch { return fallback; } };
const writeJSON = (store, key, val) => { try { store.setItem(key, JSON.stringify(val)); } catch {} };

function log(type, id) {
  const list = readJSON(localStorage, LOG_KEY, []);
  list.push({ type, id: id || "", ts: Date.now() });
  writeJSON(localStorage, LOG_KEY, list.slice(-100));
}

// ── 세션 ──
function getSession() {
  const s = readJSON(sessionStorage, SESSION_KEY, null);
  if (!s || s.exp < Date.now() || !ADMINS.some(a => a.id === s.id)) { sessionStorage.removeItem(SESSION_KEY); return null; }
  return s;
}
function touchSession() {
  const s = getSession();
  if (s) { s.exp = Date.now() + ADMIN_POLICY.sessionMinutes * 60000; writeJSON(sessionStorage, SESSION_KEY, s); }
}
function logout(reason) {
  const s = readJSON(sessionStorage, SESSION_KEY, null);
  if (s) log(reason || "logout", s.id);
  sessionStorage.removeItem(SESSION_KEY);
  render();
}

// 활동이 있으면 세션 연장, 1분마다 만료 확인
["click", "keydown", "scroll"].forEach(t => addEventListener(t, touchSession, { passive: true }));
setInterval(() => { if (readJSON(sessionStorage, SESSION_KEY, null) && !getSession()) { log("timeout"); render(); toast("오래 활동이 없어 로그아웃되었습니다"); } }, 60000);

// ── 로그인 화면 ──
function viewLogin(msg) {
  const lock = readJSON(localStorage, LOCK_KEY, { fails: 0, until: 0 });
  const locked = lock.until > Date.now();
  root.innerHTML = `
    <section class="section">
      <div class="wrap login-wrap">
        <form class="form login" novalidate>
          <h1>관리자 로그인</h1>
          <p class="muted">운영 대시보드는 지정된 관리자만 볼 수 있습니다.</p>
          <label>관리자 ID <input name="uid" autocomplete="username" required ${locked ? "disabled" : ""}></label>
          <label>비밀번호 <input name="pw" type="password" autocomplete="current-password" required ${locked ? "disabled" : ""}></label>
          <p class="form-error" role="alert">${esc(locked ? `로그인 시도가 너무 많습니다. ${Math.ceil((lock.until - Date.now()) / 60000)}분 후 다시 시도하세요.` : msg || "")}</p>
          <button class="btn btn-primary" type="submit" ${locked ? "disabled" : ""}>로그인</button>
          <a class="muted back" href="index.html">← 웹진으로 돌아가기</a>
        </form>
      </div>
    </section>`;
  const form = root.querySelector("form");
  if (!locked) form.uid.focus();
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const id = form.uid.value.trim(), pw = form.pw.value;
    const admin = ADMINS.find(a => a.id === id);
    const ok = admin && (await sha256(`${admin.salt}:${pw}`)) === admin.hash;
    if (ok) {
      writeJSON(localStorage, LOCK_KEY, { fails: 0, until: 0 });
      writeJSON(sessionStorage, SESSION_KEY, { id: admin.id, name: admin.name, exp: Date.now() + ADMIN_POLICY.sessionMinutes * 60000 });
      log("login", admin.id);
      render();
    } else {
      const l = readJSON(localStorage, LOCK_KEY, { fails: 0, until: 0 });
      l.fails += 1;
      if (l.fails >= ADMIN_POLICY.maxAttempts) { l.until = Date.now() + ADMIN_POLICY.lockMinutes * 60000; l.fails = 0; }
      writeJSON(localStorage, LOCK_KEY, l);
      log("fail", id);
      viewLogin("ID 또는 비밀번호가 올바르지 않습니다.");
    }
  });
}

// ── 대시보드 ──
const LOG_LABEL = { login: "로그인", logout: "로그아웃", timeout: "자동 로그아웃", fail: "로그인 실패", reset: "데이터 초기화", export: "CSV 내보내기" };

function viewDashboard(session) {
  const d = Store.refresh();
  const ev = d.events;
  const count = (type, id) => ev.filter(e => e.type === type && (id === undefined || e.article === id)).length;
  const fmt = s => s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
  const time = ts => new Date(ts).toLocaleString("ko-KR");

  const rows = ARTICLES.map(a => {
    const views = count("view", a.id);
    const dwells = ev.filter(e => e.type === "dwell" && e.article === a.id).map(e => e.value);
    const avg = dwells.length ? Math.round(dwells.reduce((x, y) => x + y, 0) / dwells.length) : 0;
    const reach = views ? Math.round((ev.filter(e => e.type === "scroll" && e.article === a.id && e.value === 100).length / views) * 100) : 0;
    return { a, views, avg, reach, consult: count("consult_click", a.id), submit: count("consult_submit", a.id), sub: count("subscribe", a.id), share: count("share", a.id) };
  }).sort((x, y) => y.views - x.views);

  const sources = {};
  ev.filter(e => e.type === "view").forEach(e => { sources[e.source] = (sources[e.source] || 0) + 1; });

  const totalViews = count("view"), clicks = count("consult_click"), submits = count("consult_submit");
  const max = Math.max(totalViews, 1);
  const funnel = [["기사 조회", totalViews], ["상담받기 클릭", clicks], ["상담 신청 제출", submits]];
  const logs = readJSON(localStorage, LOG_KEY, []).slice(-15).reverse();

  root.innerHTML = `
    <section class="section dash">
      <div class="wrap">
        <div class="dash-head">
          <h1 class="page-title">운영 대시보드</h1>
          <div class="dash-actions">
            <button class="tool" type="button" data-act="refresh">새로고침</button>
            <button class="tool" type="button" data-act="export">CSV 내보내기</button>
            <button class="tool danger" type="button" data-act="reset">테스트 데이터 초기화</button>
          </div>
        </div>
        <p class="muted">연습 단계: 이 브라우저에 저장된 테스트 데이터만 집계합니다.</p>

        <div class="kpis">
          <div><span>총 조회</span><strong>${totalViews}</strong></div>
          <div><span>상담 클릭</span><strong>${clicks}</strong></div>
          <div><span>상담 신청</span><strong>${submits}</strong></div>
          <div><span>웹진 신청</span><strong>${d.subscribers.length}</strong></div>
          <div><span>공유</span><strong>${count("share")}</strong></div>
        </div>

        <h2>상담 전환 경로</h2>
        <div class="funnel">
          ${funnel.map(([label, n]) => `
            <div class="f-row"><span>${label}</span><div class="f-bar"><i style="width:${(n / max) * 100}%"></i></div><b>${n}</b></div>`).join("")}
        </div>

        <h2>기사별 성과</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>기사</th><th>조회</th><th>평균 체류</th><th>끝까지 읽음</th><th>상담 클릭</th><th>상담 신청</th><th>웹진 신청</th><th>공유</th></tr></thead>
            <tbody>${rows.map(r => `
              <tr><td><a href="index.html#/a/${r.a.id}" target="_blank" rel="noopener">${esc(r.a.kicker)}</a></td><td>${r.views}</td><td>${fmt(r.avg)}</td><td>${r.reach}%</td><td>${r.consult}</td><td>${r.submit}</td><td>${r.sub}</td><td>${r.share}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>

        <h2>유입 경로</h2>
        ${Object.keys(sources).length ? `<ul class="sources">${Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([s, n]) => `<li><span>${esc(s)}</span><b>${n}</b></li>`).join("")}</ul>` : `<p class="muted">아직 데이터가 없습니다.</p>`}

        <h2>상담 신청 접수 (테스트)</h2>
        ${d.consults.length ? `<div class="table-wrap"><table>
          <thead><tr><th>접수 시각</th><th>이름</th><th>연락처</th><th>관심 분야</th><th>희망 시간</th><th>신청한 기사</th></tr></thead>
          <tbody>${d.consults.slice().reverse().map(c => `<tr><td>${time(c.ts)}</td><td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.field)}</td><td>${esc(c.time)}</td><td>${esc(byId(c.article)?.kicker || "메인")}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="muted">접수 내역이 없습니다.</p>`}

        <h2>웹진 신청 접수 (테스트)</h2>
        ${d.subscribers.length ? `<div class="table-wrap"><table>
          <thead><tr><th>접수 시각</th><th>이메일</th><th>이름</th><th>수신 동의</th></tr></thead>
          <tbody>${d.subscribers.slice().reverse().map(s => `<tr><td>${time(s.ts)}</td><td>${esc(s.email)}</td><td>${esc(s.name || "-")}</td><td>${s.marketing ? "동의" : "-"}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="muted">접수 내역이 없습니다.</p>`}

        <h2>관리자 접속 기록 (최근 15건)</h2>
        ${logs.length ? `<div class="table-wrap"><table>
          <thead><tr><th>시각</th><th>관리자 ID</th><th>구분</th></tr></thead>
          <tbody>${logs.map(l => `<tr><td>${time(l.ts)}</td><td>${esc(l.id || "-")}</td><td>${esc(LOG_LABEL[l.type] || l.type)}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="muted">기록이 없습니다.</p>`}

        <h2>관리자 계정 해시 만들기</h2>
        <form class="form hash-tool" novalidate>
          <p class="muted">관리자를 추가하거나 비밀번호를 바꿀 때 사용합니다. 만든 한 줄을 admin-config.js의 ADMINS 목록에 붙여 넣으세요. 비밀번호 원문은 어디에도 저장되지 않습니다.</p>
          <div class="hash-grid">
            <label>관리자 ID <input name="uid" required autocomplete="off" pattern="[a-z0-9_-]{3,20}" placeholder="영문 소문자·숫자 3~20자"></label>
            <label>표시 이름 <input name="uname" required autocomplete="off" placeholder="예: 기획실 담당자"></label>
            <label>새 비밀번호 <input name="pw" type="password" required autocomplete="new-password" placeholder="10자 이상"></label>
            <label>비밀번호 확인 <input name="pw2" type="password" required autocomplete="new-password"></label>
          </div>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-primary" type="submit">해시 만들기</button>
          <pre class="hash-out" hidden></pre>
        </form>
      </div>
    </section>`;

  root.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
    const act = b.dataset.act;
    if (act === "refresh") { viewDashboard(session); toast("최신 데이터로 새로 고쳤습니다"); }
    if (act === "export") { exportCsv(); log("export", session.id); }
    if (act === "reset" && confirm("저장된 테스트 데이터를 모두 지울까요? 되돌릴 수 없습니다.")) {
      Store.reset(); log("reset", session.id); viewDashboard(session); toast("초기화했습니다");
    }
  }));

  const hf = root.querySelector(".hash-tool");
  hf.addEventListener("submit", async e => {
    e.preventDefault();
    const err = hf.querySelector(".form-error"), out = hf.querySelector(".hash-out");
    const id = hf.uid.value.trim(), name = hf.uname.value.trim(), pw = hf.pw.value;
    err.textContent = ""; out.hidden = true;
    if (!/^[a-z0-9_-]{3,20}$/.test(id)) return err.textContent = "관리자 ID는 영문 소문자·숫자·-·_ 3~20자로 입력하세요.";
    if (!name) return err.textContent = "표시 이름을 입력하세요.";
    if (pw.length < 10) return err.textContent = "비밀번호는 10자 이상이어야 합니다.";
    if (pw !== hf.pw2.value) return err.textContent = "비밀번호 확인이 일치하지 않습니다.";
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
    const hash = await sha256(`${salt}:${pw}`);
    out.textContent = `{ id: "${id}", name: "${name.replace(/["\\]/g, "")}", salt: "${salt}", hash: "${hash}" },`;
    out.hidden = false;
    hf.pw.value = ""; hf.pw2.value = "";
  });
}

function exportCsv() {
  const d = Store.refresh();
  const line = arr => arr.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
  const csv = [line(["type", "article", "value", "source", "time"]),
    ...d.events.map(e => line([e.type, e.article, e.value, e.source, new Date(e.ts).toISOString()]))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `nanum-events-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── 토스트 ──
const toastEl = document.querySelector(".toast");
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// ── 화면 결정 ──
const who = document.getElementById("who");
document.getElementById("logout").addEventListener("click", () => logout("logout"));

function render() {
  const s = getSession();
  who.hidden = !s;
  if (s) {
    document.getElementById("who-name").textContent = `${s.name} (${s.id})`;
    viewDashboard(s);
  } else {
    viewLogin();
  }
}

render();
