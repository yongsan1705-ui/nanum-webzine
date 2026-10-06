// ─────────────────────────────────────────────
// 웹진 설정
//   mode: "demo"     → 서버 없이 시연. 접수·측정 데이터는 이 브라우저에만 저장됩니다.
//         "supabase" → Supabase(연습용 DB)에 저장. 데이터는 Supabase 관리 화면 > Table Editor에서 확인합니다.
//         "server"   → 홈페이지 서버(api/submit.php)로 전송해 DB에 저장합니다.
// 업체가 서버에 올린 뒤 "server"로 바꿉니다.
//
// supabaseKey는 브라우저 공개용(publishable) 키입니다. DB 쪽 보안 규칙(RLS)으로
// 웹진은 "추가"만 할 수 있고 조회·수정·삭제는 막혀 있어 공개되어도 됩니다.
// service_role / secret 키는 절대 여기에 넣지 마세요.
// ─────────────────────────────────────────────
window.NANUM_CONFIG = {
  mode: "supabase",
  api: "api/submit.php",
  supabaseUrl: "https://vugwtywxrdbubqpbtzch.supabase.co",
  supabaseKey: "sb_publishable_mX-EryN9cP2F8mVChfktSg_mSEv7nk-"
};
