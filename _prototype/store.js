// ─────────────────────────────────────────────
// 웹진(index.html)과 관리자 페이지(admin.html)가 함께 쓰는 저장소
// 연습 단계: 이 브라우저(localStorage)에만 저장됩니다.
// 실운영 시 아래 load/save만 서버 API로 바꾸면 나머지 코드는 그대로 씁니다.
// ─────────────────────────────────────────────

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const Store = {
  key: "nanum-store-v1",
  data: null,
  empty() { return { events: [], consults: [], subscribers: [] }; },
  load() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(localStorage.getItem(this.key)) || null; } catch { this.data = null; }
    this.data = this.data || this.empty();
    return this.data;
  },
  // 다른 탭에서 쌓인 데이터를 다시 읽을 때
  refresh() { this.data = null; return this.load(); },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch {} },
  reset() { this.data = this.empty(); this.save(); }
};
