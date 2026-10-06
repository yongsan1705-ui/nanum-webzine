// ─────────────────────────────────────────────
// 웹진 HTML 생성기
// 사용법: 이 폴더에서  node build.js
//   - 원고: build/data.js
//   - 결과: nanum/ 폴더 (업체에 전달·업로드하는 폴더)
// 생성되는 파일: index.html, 기사별 HTML, consult.html, subscribe.html,
//               archive.html, config/articles.php(관리자 화면용 기사 목록)
// assets/, api/, admin/, lib/, config/config.php 는 직접 관리하는 파일이라 덮어쓰지 않습니다.
// ─────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "data.js");
const OUT = path.join(__dirname, "..", "nanum");

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, "utf8") + "\nthis.__d = { ISSUE, GROUPS, ARTICLES, ARCHIVE, CONSULT_FIELDS };", ctx);
const { ISSUE, GROUPS, ARTICLES, ARCHIVE, CONSULT_FIELDS } = ctx.__d;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TEMPLATE_LABEL = { column: "칼럼", interview: "인터뷰", photo: "포토 스토리" };
const page = id => `${id}.html`;
const SITE = `${ISSUE.label} ${ISSUE.title}`;

// 연습 기간(GitHub Pages 공개 중)에는 검색엔진에 노출되지 않게 막음.
// 실제 운영 서버(www.cseye.net/nanum/)에 올릴 때 false로 바꾸고 다시 빌드할 것.
const NOINDEX = true;

// CSS·JS 주소 뒤에 파일 내용 기준 버전을 붙여, 고친 뒤에도 방문자 브라우저가 예전 파일을 쓰지 않게 함
const ver = f => require("crypto").createHash("md5").update(fs.readFileSync(path.join(OUT, f))).digest("hex").slice(0, 8);
const asset = f => `${f}?v=${ver(f)}`;

// ── 공통 틀 ──
function layout({ title, description, article = "", main, bodyClass = "" }) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">${NOINDEX ? `
  <meta name="robots" content="noindex, nofollow">` : ""}
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <!-- OG 이미지: 대표 이미지가 정해지면 주석을 풀고 경로 입력 -->
  <!-- <meta property="og:image" content="https://www.cseye.net/nanum/assets/img/cover.jpg"> -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <link rel="stylesheet" href="${asset("assets/css/style.css")}">
</head>
<body${article ? ` data-article="${esc(article)}"` : ""}${bodyClass ? ` class="${bodyClass}"` : ""}>
  <a class="skip" href="#main">본문 바로가기</a>
  <div class="test-bar" id="demo-bar" hidden>시연 모드 · 입력한 내용은 이 브라우저에만 저장됩니다. 실제 이름·연락처를 입력하지 마세요</div>

  <header class="site-header">
    <div class="wrap header-inner">
      <p class="issue-mark">${esc(ISSUE.year)}<span class="bar"></span>VOL.<strong> ${esc(ISSUE.vol)}</strong></p>
      <a class="brand" href="index.html" aria-label="소식지 홈">
        <small>${esc(ISSUE.label)}</small>
        <strong>${esc(ISSUE.title)}</strong>
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="메뉴 열기">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>
  <div class="nav-backdrop" hidden></div>
  <nav id="nav" class="nav" aria-label="목차">
      <div class="nav-inner">
        <div class="nav-head">
          <strong>목차</strong>
          <button class="nav-close" type="button" aria-label="메뉴 닫기">×</button>
        </div>
        <ol class="toc">
${ARTICLES.map(a => `          <li><a href="${page(a.id)}"${a.id === article ? ' aria-current="page"' : ""}>${esc(a.kicker)}</a></li>`).join("\n")}
        </ol>
        <div class="nav-actions">
          <a href="archive.html">지난 호 보기</a>
          <a href="subscribe.html">웹진 신청하기</a>
          <a href="consult.html" class="primary" data-track="consult_click">상담받기</a>
        </div>
      </div>
  </nav>

  <main id="main" tabindex="-1">
${main}
  </main>

  <footer class="site-footer">
    <div class="wrap">
      <p class="disclaimer">본 소식지의 내용은 일반적인 건강 정보로, 개인의 진단이나 치료를 대신하지 않습니다. 증상이 있거나 궁금한 점이 있으면 전문의와 상담하세요.</p>
      <p>발행처 센트럴서울안과 · 서울시 용산구 이촌로 224 한강쇼핑센터 2·3층 · 상담 및 예약 <a href="tel:027922226">02-792-2226</a></p>
      <p>© ${esc(ISSUE.year)} 센트럴서울안과 · 소식지 ${esc(ISSUE.title)} · <a href="archive.html">지난 호</a></p>
    </div>
  </footer>

  ${bodyClass.includes("form-page") ? "" : `<a class="fab" href="consult.html${article ? `?from=${esc(article)}` : ""}" data-track="consult_click">상담받기</a>`}
  <div class="toast" role="status" aria-live="polite"></div>

  <script src="${asset("assets/js/config.js")}"></script>
  <script src="${asset("assets/js/site.js")}"></script>
</body>
</html>
`;
}

// ── 본문 블록 ──
function renderBlock(b, a) {
  switch (b.type) {
    case "p": return `<p>${esc(b.text)}</p>`;
    case "h": return b.flag
      ? `<h3 class="has-flag"><img class="flag flag-${esc(b.flag)}" src="assets/img/flags/${esc(b.flag)}.svg" alt="" width="40" height="40">${esc(b.text)}</h3>`
      : `<h3>${esc(b.text)}</h3>`;
    case "quote": return `<blockquote><p>${esc(b.text)}</p>${b.by ? `<cite>${esc(b.by)}</cite>` : ""}</blockquote>`;
    case "img": {
      const media = b.src
        ? `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${b.w}" height="${b.h}" loading="lazy" decoding="async">`
        : `<div class="ph-img" role="img" aria-label="${esc(b.alt)}"><span>사진 자리</span></div>`;
      // 작은 사진은 원래 크기보다 늘리지 않음 (흐려짐 방지)
      // 세로 사진은 .portrait(440px) 제한이 있으므로, 그보다 작을 때만 원래 크기로 제한
      const cap = b.h > b.w ? 440 : 740;
      const small = b.src && b.w < cap ? ` style="max-width:${b.w}px;margin-inline:auto"` : "";
      return `<figure${b.h > b.w ? ' class="portrait"' : ""}${small}>${media}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`;
    }
    case "qa": return `<div class="qa"><p class="q">${esc(b.q)}</p><p class="a">${esc(b.a)}</p></div>`;
    case "list": return `<ul>${b.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "timeline": return `<ol class="timeline">${b.items.map(i => `<li><time>${esc(i.date)}</time><p>${esc(i.text)}</p></li>`).join("")}</ol>`;
    case "tag": return `<div class="tag-card"><span class="tag">${esc(b.tag)}</span><strong>${esc(b.title)}</strong><p>${esc(b.text)}</p></div>`;
    case "note": return `<p class="note">${esc(b.text)}</p>`;
    case "video": return `<figure><div class="ph-video" role="img" aria-label="영상: ${esc(b.title)}"><span>▶</span></div><figcaption>${esc(b.title)}</figcaption></figure>`;
    case "consult": return `<aside class="cta-box"><div><strong>궁금한 점이 있으신가요?</strong><p>관련 진료에 대해 상담을 신청하실 수 있습니다.</p></div><a class="btn btn-primary" href="consult.html?from=${esc(a.id)}" data-track="consult_click">상담받기</a></aside>`;
    case "subscribe": return `<aside class="cta-box alt"><div><strong>다음 호도 받아보세요</strong><p>새 호가 발행되면 이메일로 알려 드립니다.</p></div><a class="btn btn-primary" href="subscribe.html?from=${esc(a.id)}">웹진 신청하기</a></aside>`;
    default: throw new Error(`알 수 없는 블록 종류: ${b.type} (${a.id})`);
  }
}

// ── 편지지 본문 (인사말) ── 상담·신청 안내 상자는 편지 밖, 서명 아래에 둠
function buildLetter(a) {
  const isCta = b => b.type === "consult" || b.type === "subscribe";
  const render = list => list.map(b => renderBlock(b, a)).join("\n          ");
  const ctas = a.blocks.filter(isCta);
  return `<div class="letter-wrap"><div class="letter">
        <div class="article-body">
          <span class="letter-float a" aria-hidden="true"></span><span class="letter-float b" aria-hidden="true"></span>
          ${render(a.blocks.filter(b => !isCta(b)))}
          ${a.byline ? `<p class="letter-sign">${esc(a.byline)}</p>` : ""}
        </div>
        </div></div>${ctas.length ? `
        <div class="article-body">
          ${render(ctas)}
        </div>` : ""}`;
}

// ── 메인 ──
function buildIndex() {
  const card = a => `
          <a class="card" href="${page(a.id)}">
            <div class="card-thumb" style="background:${a.thumb ? `url('${esc(a.thumb)}') ${esc(a.thumbPos || "center")} / cover, ` : ""}${esc(a.color)}"><span>${esc(TEMPLATE_LABEL[a.template])}</span></div>
            <div class="card-body">
              <p class="card-kicker">${esc(a.kicker)}</p>
              <h3>${esc(a.title)}</h3>
              <p class="card-summary">${esc(a.summary)}</p>
              <span class="more">자세히 보기 →</span>
            </div>
          </a>`;
  const groups = GROUPS.map(g => {
    const list = ARTICLES.filter(a => a.group === g && !a.feature);
    return list.length ? `
      <div class="group">
        <h2 class="group-title">${esc(g)}</h2>
        <div class="grid">${list.map(card).join("")}
        </div>
      </div>` : "";
  }).join("");
  const features = ARTICLES.filter(a => a.feature).map(a => `
        <a class="feature" href="${page(a.id)}" style="--tone:${esc(a.color)}">
          <p>${esc(a.kicker)}</p>
          <h3>${esc(a.title)}</h3>
        </a>`).join("");
  const main = `
    <section class="cover" aria-label="표지: 눈송이와 민들레 홀씨가 날리는 수채화">
      <div class="wrap cover-inner">
        <p class="cover-label">${esc(ISSUE.label)}</p>
        <h1 class="cover-title"><img src="assets/img/title-logo.svg" alt="${esc(ISSUE.title)}" width="380" height="214"></h1>
        <p class="cover-issue">${esc(ISSUE.year)} · Vol.${esc(ISSUE.vol)}</p>
        <a class="btn btn-primary" href="${page("greeting")}">${esc(ISSUE.year)} 인사말 보러가기</a>
      </div>
    </section>
    <section class="section">
      <div class="wrap">${groups}
      <div class="features">${features}
      </div>
      </div>
    </section>
    <section class="section subscribe-band">
      <div class="wrap center">
        <h2>다음 호도 받아보세요</h2>
        <p>새로 발간되는 소식지를 이메일로 알려 드립니다.</p>
        <a class="btn btn-primary" href="subscribe.html">웹진 신청하기</a>
      </div>
    </section>`;
  return layout({ title: `${ISSUE.title} | ${ISSUE.label} ${ISSUE.year} Vol.${ISSUE.vol}`, description: `${SITE} ${ISSUE.year} Vol.${ISSUE.vol}`, main });
}

// ── 기사 ──
function buildArticle(a, i) {
  const prev = ARTICLES[i - 1], next = ARTICLES[i + 1];
  const main = `
    <article class="article tpl-${a.template}">
      <header class="article-head" style="--tone:${esc(a.color)}">
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
          <button type="button" class="tool" data-fontsize aria-pressed="false">글자 크게</button>
        </div>
        ${a.letter ? buildLetter(a) : `<div class="article-body">
          ${a.blocks.map(b => renderBlock(b, a)).join("\n          ")}
        </div>`}
        <p class="article-note">※ 의학 정보는 참고용이며, 정확한 진단은 전문의 진료를 통해 받으세요.</p>
        <nav class="pager" aria-label="이전·다음 기사">
          ${prev ? `<a href="${page(prev.id)}"><small>이전 기사</small>${esc(prev.title)}</a>` : "<span></span>"}
          ${next ? `<a class="next" href="${page(next.id)}"><small>다음 기사</small>${esc(next.title)}</a>` : "<span></span>"}
        </nav>
      </div>
    </article>`;
  return layout({ title: `${a.title} | ${ISSUE.title}`, description: a.summary, article: a.id, main });
}

// ── 지난 호 ──
function buildArchive() {
  const main = `
    <section class="section">
      <div class="wrap">
        <h1 class="page-title">지난 호 보기</h1>
        <ul class="archive">
${ARCHIVE.map(v => `          <li class="${v.current ? "is-current" : ""}">
            <div class="arc-cover"><span>Vol.${esc(v.vol)}</span></div>
            <p><strong>${esc(v.year)} Vol.${esc(v.vol)}</strong></p>
            ${v.note ? `<p class="muted">${esc(v.note)}</p>` : ""}
            ${v.current ? `<a href="index.html">이번 호 보기</a>` : v.pdf ? `<a href="${esc(v.pdf)}" target="_blank" rel="noopener">PDF 보기</a>` : `<span class="muted">PDF 준비 중</span>`}
          </li>`).join("\n")}
        </ul>
      </div>
    </section>`;
  return layout({ title: `지난 호 보기 | ${ISSUE.title}`, description: `${SITE} 지난 호 목록`, main });
}

// ── 상담 신청 페이지 ──
function buildConsult() {
  const main = `
    <section class="section form-section">
      <div class="wrap narrow">
        <p class="article-kicker">상담 신청</p>
        <h1 class="page-title">상담받기</h1>
        <p class="lead">궁금하신 진료 분야와 연락 가능한 시간을 남겨 주시면 담당자가 연락드립니다. 급한 문의는 <a href="tel:027922226">02-792-2226</a>으로 전화 주세요.</p>

        <form class="form panel" data-form="consult" novalidate>
          <p class="test-note demo-only" hidden>시연 모드입니다. 실제 정보 대신 "홍길동", "010-0000-0000" 같은 테스트 값을 입력하세요.</p>
          <label>이름 <span class="req">필수</span><input name="name" required maxlength="30" autocomplete="name"></label>
          <label>연락처 <span class="req">필수</span><input name="phone" type="tel" required maxlength="20" autocomplete="tel" placeholder="010-0000-0000"></label>
          <label>관심 분야 <span class="req">필수</span>
            <select name="field" required>
              <option value="">선택해 주세요</option>
${CONSULT_FIELDS.map(f => `              <option>${esc(f)}</option>`).join("\n")}
            </select>
          </label>
          <label>희망 연락 시간 <span class="req">필수</span>
            <select name="time" required>
              <option value="">선택해 주세요</option>
              <option>오전 (9~12시)</option>
              <option>오후 (12~18시)</option>
              <option>무관</option>
            </select>
          </label>
          <p class="hint">증상이나 진료 기록은 적지 않으셔도 됩니다. 자세한 내용은 상담 전화로 안내드립니다.</p>
          <div class="hp" aria-hidden="true"><label>웹사이트 <input name="website" tabindex="-1" autocomplete="off"></label></div>
          <div class="notice-box">
            <strong>개인정보 수집·이용 안내</strong>
            <ul>
              <li>수집 목적: 상담 요청 확인 및 연락</li>
              <li>수집 항목: 이름, 연락처, 관심 분야, 희망 연락 시간</li>
              <li>보유 기간: [상담 완료 후 ○개월, 법무 확인 필요]</li>
              <li>동의를 거부할 수 있으며, 거부 시 상담 신청이 제한됩니다.</li>
            </ul>
          </div>
          <label class="check"><input type="checkbox" name="agree_privacy" required> (필수) 개인정보 수집·이용에 동의합니다</label>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-primary" type="submit">상담 신청</button>
        </form>

        <div class="done panel" hidden>
          <h2>상담 신청이 접수되었습니다</h2>
          <p>희망하신 시간에 담당자가 연락드립니다. 감사합니다.</p>
          <a class="btn btn-primary" href="index.html">웹진으로 돌아가기</a>
        </div>
      </div>
    </section>`;
  return layout({ title: `상담받기 | ${ISSUE.title}`, description: "센트럴서울안과 상담 신청", article: "", main, bodyClass: "form-page" });
}

// ── 구독 신청 페이지 ──
function buildSubscribe() {
  const main = `
    <section class="section form-section">
      <div class="wrap narrow">
        <p class="article-kicker">웹진 신청</p>
        <h1 class="page-title">웹진 신청하기</h1>
        <p class="lead">「${esc(ISSUE.title)}」 새 호가 발행되면 이메일로 알려 드립니다.</p>

        <form class="form panel" data-form="subscribe" novalidate>
          <p class="test-note demo-only" hidden>시연 모드입니다. test@example.com 같은 테스트 주소를 입력하세요.</p>
          <label>이메일 <span class="req">필수</span><input name="email" type="email" required maxlength="100" autocomplete="email"></label>
          <label>이름 <span class="opt">선택</span><input name="name" maxlength="30" autocomplete="name"></label>
          <div class="hp" aria-hidden="true"><label>웹사이트 <input name="website" tabindex="-1" autocomplete="off"></label></div>
          <div class="notice-box">
            <strong>개인정보 수집·이용 안내</strong>
            <ul>
              <li>수집 목적: 소식지 발행 알림 발송</li>
              <li>수집 항목: 이메일, 이름(선택)</li>
              <li>보유 기간: 구독 해지 시까지</li>
              <li>동의를 거부할 수 있으며, 거부 시 신청이 제한됩니다.</li>
            </ul>
          </div>
          <label class="check"><input type="checkbox" name="agree_privacy" required> (필수) 개인정보 수집·이용에 동의합니다</label>
          <label class="check"><input type="checkbox" name="agree_marketing" required> (필수) 소식지·병원 소식 이메일 수신에 동의합니다</label>
          <p class="hint">구독 해지는 받으신 메일 하단 또는 <a href="tel:027922226">02-792-2226</a>으로 요청하실 수 있습니다.</p>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-primary" type="submit">신청</button>
        </form>

        <div class="done panel" hidden>
          <h2>신청이 완료되었습니다</h2>
          <p>다음 호가 발행되면 이메일로 알려 드리겠습니다.</p>
          <a class="btn btn-primary" href="index.html">웹진으로 돌아가기</a>
        </div>
      </div>
    </section>`;
  return layout({ title: `웹진 신청하기 | ${ISSUE.title}`, description: `${SITE} 구독 신청`, main, bodyClass: "form-page" });
}

// ── 관리자 화면용 기사 목록 (PHP) ──
function buildArticlesPhp() {
  const q = s => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return `<?php
// build/build.js가 자동 생성하는 파일입니다. 직접 고치지 마세요.
// 접수 데이터 검증(허용 기사 ID)과 관리자 화면의 기사 이름 표시에 씁니다.
return [
${ARTICLES.map(a => `  ${q(a.id)} => ${q(a.kicker)},`).join("\n")}
];
`;
}

// ── 쓰기 ──
const ids = new Set();
ARTICLES.forEach(a => {
  if (!/^[a-z0-9-]+$/.test(a.id)) throw new Error(`기사 ID는 영문 소문자·숫자·-만 쓸 수 있습니다: ${a.id}`);
  if (ids.has(a.id)) throw new Error(`기사 ID 중복: ${a.id}`);
  if (["index", "consult", "subscribe", "archive", "demo-db", "db"].includes(a.id)) throw new Error(`예약된 이름은 기사 ID로 쓸 수 없습니다: ${a.id}`);
  ids.add(a.id);
  a.blocks.filter(b => b.type === "img").forEach(b => {
    if (!b.alt) throw new Error(`사진 대체텍스트(alt) 누락: ${a.id}`);
    if (b.src && !(b.w && b.h)) throw new Error(`사진 크기(w, h) 누락: ${a.id} ${b.src}`);
    if (b.src && !fs.existsSync(path.join(OUT, b.src))) throw new Error(`사진 파일 없음: ${a.id} ${b.src}`);
  });
  if (a.thumb && !fs.existsSync(path.join(OUT, a.thumb))) throw new Error(`썸네일 파일 없음: ${a.id} ${a.thumb}`);
  a.blocks.filter(b => b.type === "h" && b.flag).forEach(b => {
    if (!fs.existsSync(path.join(OUT, "assets/img/flags", `${b.flag}.svg`))) throw new Error(`국기 파일 없음: ${a.id} flags/${b.flag}.svg`);
  });
});

fs.mkdirSync(path.join(OUT, "config"), { recursive: true });
const files = {
  "index.html": buildIndex(),
  "archive.html": buildArchive(),
  "consult.html": buildConsult(),
  "subscribe.html": buildSubscribe(),
  "config/articles.php": buildArticlesPhp(),
  "config/options.php": `<?php
// build/build.js가 자동 생성하는 파일입니다. 직접 고치지 마세요.
// 상담 폼 선택지 (서버 검증용) — 웹진 화면의 선택지와 같아야 합니다.
return [
  'consult_fields' => [${CONSULT_FIELDS.map(f => `'${f.replace(/'/g, "\\'")}'`).join(", ")}],
  'contact_times' => ['오전 (9~12시)', '오후 (12~18시)', '무관'],
];
`
};
ARTICLES.forEach((a, i) => { files[page(a.id)] = buildArticle(a, i); });

// 시연 모드에서만: 이 브라우저에 쌓인 신청·통계를 보는 화면(demo-db.html)을 웹진과 같은 주소에 만듦.
// (브라우저 저장 데이터는 사이트 주소별로 따로 보관되므로 웹진 안에 있어야 보임) 서버 모드로 바꾸면 자동으로 지움.
const isDemoMode = /^\s*mode:\s*"demo"/m.test(fs.readFileSync(path.join(OUT, "assets/js/config.js"), "utf8"));
const demoDbPath = path.join(OUT, "demo-db.html");
if (isDemoMode) {
  const list = JSON.stringify(ARTICLES.map(a => ({ id: a.id, kicker: a.kicker }))).replace(/</g, "\\u003c");
  files["demo-db.html"] = fs.readFileSync(path.join(__dirname, "..", "_preview", "db-demo.html"), "utf8")
    .replace('<script src="../build/data.js"></script>', () => `<script>const ARTICLES = ${list};</script>`)
    .replace('href="../nanum/assets/css/style.css"', `href="${asset("assets/css/style.css")}"`)
    .replace(/\.\.\/nanum\//g, "");
} else if (fs.existsSync(demoDbPath)) fs.unlinkSync(demoDbPath);

// Supabase 모드에서만: 관리자 로그인 후 접수·통계를 보는 DB 화면(db.html)
const isSupabaseMode = /^\s*mode:\s*"supabase"/m.test(fs.readFileSync(path.join(OUT, "assets/js/config.js"), "utf8"));
const dbPath = path.join(OUT, "db.html");
if (isSupabaseMode) {
  const list = JSON.stringify(ARTICLES.map(a => ({ id: a.id, kicker: a.kicker }))).replace(/</g, "\\u003c");
  files["db.html"] = fs.readFileSync(path.join(__dirname, "db-template.html"), "utf8")
    .replace("{{CSS}}", () => asset("assets/css/style.css"))
    .replace("{{CONFIG}}", () => asset("assets/js/config.js"))
    .replace("{{ARTICLES}}", () => list);
} else if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
for (const [name, html] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), html);
console.log(`생성 완료: ${Object.keys(files).length}개 파일 → ${OUT}`);
