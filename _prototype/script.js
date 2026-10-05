// ─────────────────────────────────────────────
// 소식지 동작: 화면 전환, 측정, 상담·신청 접수
// (운영 대시보드는 관리자 전용 admin.html로 분리)
// 콘텐츠는 data.js에서 고칩니다.
// ─────────────────────────────────────────────

const app = document.getElementById("app");
const byId = id => ARTICLES.find(a => a.id === id);

// ── 측정 ──
// 이벤트 7종: view, dwell, scroll, consult_click, consult_submit, subscribe, share
const source = (() => {
  const p = new URLSearchParams(location.search);
  if (p.get("utm_source")) return p.get("utm_source");
  try { return document.referrer ? new URL(document.referrer).hostname : "direct"; } catch { return "direct"; }
})();

function track(type, article, value) {
  const d = Store.load();
  d.events.push({ type, article: article || null, value: value ?? null, source, ts: Date.now() });
  Store.save();
}

// 현재 읽고 있는 기사의 체류시간·스크롤 측정
const reading = {
  id: null, visibleSince: 0, total: 0, marks: new Set(),
  start(id) {
    this.stop();
    this.id = id; this.total = 0; this.marks = new Set();
    this.visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
    track("view", id);
  },
  pause() { if (this.visibleSince) { this.total += Date.now() - this.visibleSince; this.visibleSince = 0; } },
  resume() { if (this.id && !this.visibleSince) this.visibleSince = Date.now(); },
  stop() {
    if (!this.id) return;
    this.pause();
    if (this.total > 500) track("dwell", this.id, Math.round(this.total / 1000));
    this.id = null;
  },
  checkScroll() {
    if (!this.id) return;
    const body = document.querySelector(".article-body");
    if (!body) return;
    const r = body.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((innerHeight - r.top) / r.height) * 100));
    for (const m of [25, 50, 75, 100]) {
      if (pct >= m && !this.marks.has(m)) { this.marks.add(m); track("scroll", this.id, m); }
    }
  }
};
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" ? reading.resume() : reading.pause());
addEventListener("pagehide", () => reading.stop());
addEventListener("scroll", () => reading.checkScroll(), { passive: true });

// ── 렌더링: 블록 ──
function renderBlock(b) {
  switch (b.type) {
    case "p": return `<p>${esc(b.text)}</p>`;
    case "h": return `<h3>${esc(b.text)}</h3>`;
    case "quote": return `<blockquote><p>${esc(b.text)}</p>${b.by ? `<cite>${esc(b.by)}</cite>` : ""}</blockquote>`;
    case "img": return `<figure><div class="ph-img" role="img" aria-label="${esc(b.alt)}"><span>사진 자리</span></div>${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
    case "qa": return `<div class="qa"><p class="q">${esc(b.q)}</p><p class="a">${esc(b.a)}</p></div>`;
    case "list": return `<ul>${b.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "timeline": return `<ol class="timeline">${b.items.map(i => `<li><time>${esc(i.date)}</time><p>${esc(i.text)}</p></li>`).join("")}</ol>`;
    case "tag": return `<div class="tag-card"><span class="tag">${esc(b.tag)}</span><strong>${esc(b.title)}</strong><p>${esc(b.text)}</p></div>`;
    case "note": return `<p class="note">${esc(b.text)}</p>`;
    case "video": return `<figure><div class="ph-video" role="img" aria-label="영상: ${esc(b.title)}"><span>▶</span></div><figcaption>${esc(b.title)}</figcaption></figure>`;
    case "consult": return `<aside class="cta-box"><div><strong>궁금한 점이 있으신가요?</strong><p>관련 진료에 대해 상담을 신청하실 수 있습니다.</p></div><button class="btn btn-primary" type="button" data-open="consult">상담받기</button></aside>`;
    case "subscribe": return `<aside class="cta-box alt"><div><strong>내년 호도 받아보세요</strong><p>새 호가 발행되면 이메일로 알려 드립니다.</p></div><button class="btn btn-primary" type="button" data-open="subscribe">웹진 신청하기</button></aside>`;
    default: return "";
  }
}

const TEMPLATE_LABEL = { column: "칼럼", interview: "인터뷰", photo: "포토 스토리" };

// ── 화면: 메인 ──
function viewHome() {
  const features = ARTICLES.filter(a => a.feature);
  const card = a => `
            <a class="card" href="#/a/${a.id}">
              <div class="card-thumb" style="background:${a.color}"><span>${esc(TEMPLATE_LABEL[a.template])}</span></div>
              <div class="card-body">
                <p class="card-kicker">${esc(a.kicker)}</p>
                <h3>${esc(a.title)}</h3>
                <p class="card-summary">${esc(a.summary)}</p>
                <span class="more">자세히 보기 →</span>
              </div>
            </a>`;
  app.innerHTML = `
    <section class="cover">
      <div class="wrap cover-inner">
        <p class="cover-label">${esc(ISSUE.label)}</p>
        <h1>${esc(ISSUE.title)}</h1>
        <p class="cover-issue">${esc(ISSUE.year)} · Vol.${esc(ISSUE.vol)}</p>
        <a class="btn btn-light" href="#/a/greeting">${esc(ISSUE.year)} 인사말 보러가기</a>
      </div>
    </section>
    <section class="section">
      <div class="wrap">
        ${GROUPS.map(g => {
          const list = ARTICLES.filter(a => a.group === g && !a.feature);
          return list.length ? `
        <div class="group">
          <h2 class="group-title">${esc(g)}</h2>
          <div class="grid">${list.map(card).join("")}</div>
        </div>` : "";
        }).join("")}
        <div class="features">
          ${features.map(a => `
            <a class="feature" href="#/a/${a.id}" style="--tone:${a.color}">
              <p>${esc(a.kicker)}</p>
              <h3>${esc(a.title)}</h3>
            </a>`).join("")}
        </div>
      </div>
    </section>
    <section class="section subscribe-band">
      <div class="wrap center">
        <h2>내년 호도 받아보세요</h2>
        <p>매년 새로 발간되는 소식지를 이메일로 알려 드립니다.</p>
        <button class="btn btn-primary" type="button" data-open="subscribe">웹진 신청하기</button>
      </div>
    </section>`;
}

// ── 화면: 기사 상세 ──
function viewArticle(id) {
  const a = byId(id);
  if (!a) return viewNotFound();
  const i = ARTICLES.indexOf(a);
  const prev = ARTICLES[i - 1], next = ARTICLES[i + 1];
  app.innerHTML = `
    <article class="article tpl-${a.template}">
      <header class="article-head" style="--tone:${a.color}">
        <div class="wrap narrow">
          <p class="article-kicker">${esc(a.kicker)} · ${esc(TEMPLATE_LABEL[a.template])}</p>
          <h1>${esc(a.title)}</h1>
          <p class="article-byline">${esc(a.byline || "")}</p>
        </div>
      </header>
      <div class="wrap narrow">
        <div class="toolbar">
          <button type="button" class="tool" data-share="copy">링크 복사</button>
          <button type="button" class="tool" data-share="native">공유하기</button>
          <button type="button" class="tool" data-fontsize aria-pressed="${document.documentElement.classList.contains("large")}">글자 크게</button>
        </div>
        <div class="article-body">${a.blocks.map(renderBlock).join("")}</div>
        <p class="article-note">※ 의학 정보는 참고용이며, 정확한 진단은 전문의 진료를 통해 받으세요.</p>
        <nav class="pager" aria-label="이전·다음 기사">
          ${prev ? `<a href="#/a/${prev.id}"><small>이전 기사</small>${esc(prev.title)}</a>` : "<span></span>"}
          ${next ? `<a class="next" href="#/a/${next.id}"><small>다음 기사</small>${esc(next.title)}</a>` : "<span></span>"}
        </nav>
      </div>
    </article>`;
  reading.start(id);
}

// ── 화면: 지난 호 ──
function viewArchive() {
  app.innerHTML = `
    <section class="section">
      <div class="wrap">
        <h1 class="page-title">지난 호 보기</h1>
        <ul class="archive">
          ${ARCHIVE.map(v => `
            <li class="${v.current ? "is-current" : ""}">
              <div class="arc-cover"><span>Vol.${esc(v.vol)}</span></div>
              <p><strong>${esc(v.year)} Vol.${esc(v.vol)}</strong></p>
              ${v.note ? `<p class="muted">${esc(v.note)}</p>` : ""}
              ${v.current ? `<a href="#/">이번 호 보기</a>`
                : v.pdf ? `<a href="${esc(v.pdf)}" target="_blank" rel="noopener">PDF 보기</a>`
                : `<span class="muted">PDF 준비 중</span>`}
            </li>`).join("")}
        </ul>
      </div>
    </section>`;
}

function viewNotFound() {
  app.innerHTML = `<section class="section"><div class="wrap center"><h1 class="page-title">페이지를 찾을 수 없습니다</h1><a class="btn btn-primary" href="#/">메인으로</a></div></section>`;
}

// ── 라우터 ──
function route() {
  reading.stop();
  const h = location.hash.replace(/^#/, "") || "/";
  const m = h.match(/^\/a\/([\w-]+)/);
  if (m) viewArticle(m[1]);
  else if (h === "/archive") viewArchive();
  else viewHome();
  window.scrollTo(0, 0);
  closeMenu();
  markToc();
}
addEventListener("hashchange", route);

// ── 헤더·목차 ──
document.getElementById("hd-year").textContent = ISSUE.year;
document.getElementById("hd-vol").textContent = " " + ISSUE.vol;
document.getElementById("hd-label").textContent = ISSUE.label;
document.getElementById("hd-title").textContent = ISSUE.title;
document.getElementById("ft-year").textContent = ISSUE.year;
document.getElementById("ft-title").textContent = ISSUE.title;
document.getElementById("toc").innerHTML = ARTICLES.map(a => `<li><a href="#/a/${a.id}">${esc(a.kicker)}</a></li>`).join("");

function markToc() {
  document.querySelectorAll("#toc a").forEach(a => a.toggleAttribute("aria-current", a.getAttribute("href") === location.hash));
}

const toggle = document.querySelector(".menu-toggle");
const nav = document.getElementById("nav");
function closeMenu() { nav.classList.remove("is-open"); toggle.setAttribute("aria-expanded", "false"); }
toggle.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});

// ── 토스트 ──
const toastEl = document.querySelector(".toast");
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// ── 클릭 위임: 모달 열기, 공유, 글자 크기 ──
const currentArticle = () => (location.hash.match(/^#\/a\/([\w-]+)/) || [])[1] || null;

document.addEventListener("click", async e => {
  const opener = e.target.closest("[data-open]");
  if (opener) {
    closeMenu();
    const id = opener.dataset.open;
    if (id === "consult") track("consult_click", currentArticle());
    openModal(id);
    return;
  }
  const share = e.target.closest("[data-share]");
  if (share) {
    const url = location.href;
    if (share.dataset.share === "native" && navigator.share) {
      try { await navigator.share({ title: document.title, url }); track("share", currentArticle(), "native"); } catch {}
    } else {
      try { await navigator.clipboard.writeText(url); toast("링크를 복사했습니다"); }
      catch { prompt("아래 링크를 복사하세요", url); }
      track("share", currentArticle(), "copy");
    }
    return;
  }
  const fs = e.target.closest("[data-fontsize]");
  if (fs) {
    const on = document.documentElement.classList.toggle("large");
    fs.setAttribute("aria-pressed", String(on));
    try { localStorage.setItem("nanum-large", on ? "1" : ""); } catch {}
    return;
  }
});

try { if (localStorage.getItem("nanum-large")) document.documentElement.classList.add("large"); } catch {}

// ── 모달·폼 ──
function openModal(id) {
  const dlg = document.getElementById(id);
  const form = dlg.querySelector("form");
  form.hidden = false; form.reset();
  form.querySelector(".form-error").textContent = "";
  dlg.querySelector(".done").hidden = true;
  dlg.dataset.article = currentArticle() || "";
  dlg.showModal();
}

document.querySelectorAll(".modal").forEach(dlg => {
  dlg.querySelector(".modal-close").addEventListener("click", () => dlg.close());
  dlg.querySelector(".modal-ok").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
});

const consultSelect = document.querySelector('#consult select[name="field"]');
consultSelect.insertAdjacentHTML("beforeend", CONSULT_FIELDS.map(f => `<option>${esc(f)}</option>`).join(""));

function handleForm(id, validate, onSubmit) {
  const dlg = document.getElementById(id);
  const form = dlg.querySelector("form");
  form.addEventListener("submit", e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const err = validate(f, form);
    if (err) { form.querySelector(".form-error").textContent = err; return; }
    onSubmit(f, dlg.dataset.article || null);
    form.hidden = true;
    dlg.querySelector(".done").hidden = false;
  });
}

handleForm("consult", (f, form) => {
  if (!f.name?.trim()) return "이름을 입력해 주세요.";
  if (!/^[0-9\-\s]{9,14}$/.test(f.phone || "")) return "연락처를 숫자로 입력해 주세요.";
  if (!f.field) return "관심 분야를 선택해 주세요.";
  if (!f.time) return "희망 연락 시간을 선택해 주세요.";
  if (!form.agree.checked) return "개인정보 수집·이용에 동의해 주세요.";
}, (f, article) => {
  const d = Store.load();
  d.consults.push({ name: f.name.trim(), phone: f.phone.trim(), field: f.field, time: f.time, article, ts: Date.now() });
  Store.save();
  track("consult_submit", article);
});

handleForm("subscribe", (f, form) => {
  if (!form.email.checkValidity() || !f.email) return "올바른 이메일 주소를 입력해 주세요.";
  if (!form.privacy.checked) return "개인정보 수집·이용에 동의해 주세요.";
  if (!form.marketing.checked) return "소식지를 받으려면 이메일 수신에 동의해 주세요.";
  if (Store.load().subscribers.some(s => s.email === f.email.trim())) return "이미 신청한 이메일입니다.";
}, (f, article) => {
  const d = Store.load();
  d.subscribers.push({ email: f.email.trim(), name: (f.name || "").trim(), marketing: true, article, ts: Date.now() });
  Store.save();
  track("subscribe", article);
});

route();
