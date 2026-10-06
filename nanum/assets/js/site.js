// ─────────────────────────────────────────────
// 웹진 공통 동작: 메뉴, 측정, 공유, 글자 크기, 상담·구독 폼
// 설정은 assets/js/config.js
// ─────────────────────────────────────────────
(function () {
  const CFG = window.NANUM_CONFIG || { mode: "demo", api: "api/submit.php" };
  const isSupabase = CFG.mode === "supabase" && CFG.supabaseUrl && CFG.supabaseKey;
  const isDemo = !isSupabase && CFG.mode !== "server";
  const article = document.body.dataset.article || null;

  // ── 시연 모드 저장소 (서버 없이 확인할 때만 사용) ──
  const Demo = {
    key: "nanum-store-v1",
    load() { try { return JSON.parse(localStorage.getItem(this.key)) || { events: [], consults: [], subscribers: [] }; } catch { return { events: [], consults: [], subscribers: [] }; } },
    save(d) { try { localStorage.setItem(this.key, JSON.stringify(d)); } catch {} }
  };

  if (isDemo || isSupabase) {
    const bar = document.getElementById("demo-bar");
    if (bar && isSupabase) bar.textContent = "연습 모드 · 입력한 내용은 연습용 DB에 저장됩니다. 실제 이름·연락처를 입력하지 마세요";
    bar?.removeAttribute("hidden");
    document.querySelectorAll(".demo-only").forEach(el => el.removeAttribute("hidden"));
  }

  // ── Supabase 저장 (INSERT만 가능한 공개 키 사용) ──
  // 409(같은 이메일 재신청)는 성공으로 처리: 이미 신청된 이메일인지 바깥에 알리지 않음
  function sbInsert(table, row, keepalive = false) {
    return fetch(`${CFG.supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(row),
      keepalive
    }).then(res => res.ok || res.status === 409);
  }

  // ── 유입 경로: 첫 방문 페이지 기준으로 세션 동안 유지 ──
  const source = (() => {
    try {
      const saved = sessionStorage.getItem("nanum-source");
      if (saved) return saved;
      const p = new URLSearchParams(location.search);
      let s = p.get("utm_source");
      if (!s && document.referrer) {
        const host = new URL(document.referrer).hostname;
        s = host && host !== location.hostname ? host : "";
      }
      s = (s || "direct").slice(0, 60);
      sessionStorage.setItem("nanum-source", s);
      return s;
    } catch { return "direct"; }
  })();

  // 기사 조회 1회를 묶는 ID (체류시간·스크롤을 조회 단위로 집계)
  const viewId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);

  // ── 전송 ──
  function sendEvent(type, value, art = article) {
    const ev = { kind: "event", type, article: art, value: value ?? null, source, view_id: viewId, ts: Date.now() };
    if (isDemo) { const d = Demo.load(); d.events.push(ev); Demo.save(d); return; }
    if (isSupabase) {
      sbInsert("events", { type, article: art, value: value == null ? null : String(value), source, view_id: viewId }, true).catch(() => {});
      return;
    }
    const body = JSON.stringify(ev);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(CFG.api, new Blob([body], { type: "application/json" }))) return;
    } catch {}
    fetch(CFG.api, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  }

  async function sendForm(kind, data) {
    if (isDemo) {
      const d = Demo.load();
      if (kind === "subscribe" && d.subscribers.some(s => s.email === data.email)) return { ok: false, error: "이미 신청한 이메일입니다." };
      const row = { ...data, ts: Date.now() };
      (kind === "consult" ? d.consults : d.subscribers).push(row);
      Demo.save(d);
      return { ok: true };
    }
    if (isSupabase) {
      const row = kind === "consult"
        ? { name: data.name, phone: data.phone, field: data.field, message: data.message || null, article: data.article, source: data.source, agree_privacy: true }
        : { email: data.email, name: data.name || null, article: data.article, source: data.source, agree_privacy: true, agree_marketing: true };
      try {
        return (await sbInsert(kind === "consult" ? "consults" : "subscribers", row))
          ? { ok: true }
          : { ok: false, error: "접수 중 문제가 생겼습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요." };
      } catch {
        return { ok: false, error: "네트워크 연결을 확인한 뒤 다시 시도해 주세요." };
      }
    }
    try {
      const res = await fetch(CFG.api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...data })
      });
      const json = await res.json().catch(() => ({}));
      return res.ok ? { ok: true } : { ok: false, error: json.error || "접수 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요." };
    } catch {
      return { ok: false, error: "네트워크 연결을 확인한 뒤 다시 시도해 주세요." };
    }
  }

  // ── 기사 측정: 조회, 체류시간, 스크롤 ──
  if (article) {
    sendEvent("view");
    let visibleSince = document.visibilityState === "visible" ? Date.now() : 0, total = 0;
    const marks = new Set();
    const flushDwell = () => {
      if (visibleSince) { total += Date.now() - visibleSince; visibleSince = 0; }
      if (total > 500) sendEvent("dwell", Math.round(total / 1000)); // 누적값을 보냄 → 서버는 조회별 최댓값 사용
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushDwell();
      else if (!visibleSince) visibleSince = Date.now();
    });
    addEventListener("pagehide", flushDwell);
    const body = document.querySelector(".article-body");
    const checkScroll = () => {
      if (!body) return;
      const r = body.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((innerHeight - r.top) / r.height) * 100));
      for (const m of [25, 50, 75, 100]) if (pct >= m && !marks.has(m)) { marks.add(m); sendEvent("scroll", m); }
    };
    addEventListener("scroll", checkScroll, { passive: true });
    checkScroll();
  }

  // ── 메뉴 ──
  // 오른쪽에서 밀려 나오는 목차. 바깥(배경)·닫기 버튼·Esc로 닫고, 닫으면 메뉴 버튼으로 초점을 돌려줌
  const toggle = document.querySelector(".menu-toggle"), nav = document.getElementById("nav");
  const backdrop = document.querySelector(".nav-backdrop");
  const setMenu = open => {
    if (!nav) return;
    nav.classList.toggle("is-open", open);
    if (backdrop) backdrop.hidden = !open;
    document.documentElement.classList.toggle("nav-locked", open);
    toggle?.setAttribute("aria-expanded", String(open));
    if (open) nav.querySelector(".nav-close")?.focus();
    else toggle?.focus();
  };
  toggle?.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav?.querySelector(".nav-close")?.addEventListener("click", () => setMenu(false));
  backdrop?.addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && nav?.classList.contains("is-open")) setMenu(false); });

  // ── 토스트 ──
  const toastEl = document.querySelector(".toast");
  let toastTimer;
  const toast = msg => {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  };

  // ── 글자 크기 ──
  try { if (localStorage.getItem("nanum-large")) document.documentElement.classList.add("large"); } catch {}
  document.querySelectorAll("[data-fontsize]").forEach(b => b.setAttribute("aria-pressed", String(document.documentElement.classList.contains("large"))));

  // ── 클릭: 상담 클릭 측정, 공유, 글자 크기 ──
  document.addEventListener("click", async e => {
    const tracked = e.target.closest('[data-track="consult_click"]');
    if (tracked) {
      const href = tracked.getAttribute("href") || "";
      const from = new URL(href, location.href).searchParams.get("from") || article;
      sendEvent("consult_click", null, from);
      return; // 링크 이동은 그대로 진행
    }
    const share = e.target.closest("[data-share]");
    if (share) {
      const url = location.href.split("#")[0];
      if (share.dataset.share === "native" && navigator.share) {
        try { await navigator.share({ title: document.title, url }); sendEvent("share", "native"); } catch {}
      } else {
        try { await navigator.clipboard.writeText(url); toast("링크를 복사했습니다"); }
        catch { prompt("아래 링크를 복사하세요", url); }
        sendEvent("share", "copy");
      }
      return;
    }
    const fs = e.target.closest("[data-fontsize]");
    if (fs) {
      const on = document.documentElement.classList.toggle("large");
      fs.setAttribute("aria-pressed", String(on));
      try { localStorage.setItem("nanum-large", on ? "1" : ""); } catch {}
    }
  });

  // ── 상담·구독 폼 ──
  const fromParam = (() => {
    const f = new URLSearchParams(location.search).get("from") || "";
    return /^[a-z0-9-]{1,40}$/.test(f) ? f : null;
  })();

  const validators = {
    consult(f) {
      if (!f.name.value.trim()) return "이름을 입력해 주세요.";
      if (!/^[0-9\-\s]{9,14}$/.test(f.phone.value.trim())) return "연락처를 숫자로 입력해 주세요. (예: 010-0000-0000)";
      if (!f.field.value) return "관심 진료과목을 선택해 주세요.";
      if (f.message.value.trim().length > 500) return "문의 내용은 500자 이내로 적어 주세요.";
      if (!f.agree_privacy.checked) return "개인정보 수집·이용에 동의해 주세요.";
    },
    subscribe(f) {
      if (!f.email.value || !f.email.checkValidity()) return "올바른 이메일 주소를 입력해 주세요.";
      if (!f.agree_privacy.checked) return "개인정보 수집·이용에 동의해 주세요.";
      if (!f.agree_marketing.checked) return "소식지를 받으려면 이메일 수신에 동의해 주세요.";
    }
  };
  const collect = {
    consult: f => ({ name: f.name.value.trim(), phone: f.phone.value.trim(), field: f.field.value, message: f.message.value.trim(), agree_privacy: true }),
    subscribe: f => ({ email: f.email.value.trim().toLowerCase(), name: f.name.value.trim(), agree_privacy: true, agree_marketing: true, marketing: true })
  };

  document.querySelectorAll("form[data-form]").forEach(form => {
    const kind = form.dataset.form;
    const err = form.querySelector(".form-error");
    const btn = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", async e => {
      e.preventDefault();
      err.textContent = "";
      if (form.website && form.website.value) return; // 자동 등록 방지용 숨김 칸
      const msg = validators[kind](form);
      if (msg) { err.textContent = msg; return; }
      btn.disabled = true;
      const res = await sendForm(kind, { ...collect[kind](form), article: fromParam, source });
      btn.disabled = false;
      if (!res.ok) { err.textContent = res.error; return; }
      sendEvent(kind === "consult" ? "consult_submit" : "subscribe", null, fromParam);
      form.hidden = true;
      const done = form.parentElement.querySelector(".done");
      done.hidden = false;
      done.querySelector("h2")?.setAttribute("tabindex", "-1");
      done.querySelector("h2")?.focus();
    });
  });
})();
