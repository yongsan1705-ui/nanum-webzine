<?php
// ─────────────────────────────────────────────
// 최초 관리자 계정 만들기
//   1) config/config.php의 'setup_token'에 임시 토큰을 넣는다
//   2) 이 페이지에서 토큰과 함께 첫 관리자 계정을 만든다
//   3) 만든 뒤 'setup_token'을 '' 로 비운다
// 관리자가 이미 있으면 이 페이지는 동작하지 않습니다.
// ─────────────────────────────────────────────
require __DIR__ . '/_auth.php';

if (!config_ready()) {
    admin_page('설정 필요', '<h1 class="page-title">설정이 필요합니다</h1><p>config/config.php의 <code>secret</code>을 32자 이상 무작위 문자열로 바꿔 주세요.</p>');
}
$pdo = db();
if ((int) $pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn() > 0) redirect('index.php');

$token = (string) cfg('setup_token', '');
if ($token === '' || strlen($token) < 16) {
    admin_page('최초 설정', '<h1 class="page-title">최초 관리자 만들기</h1><p>config/config.php의 <code>setup_token</code>에 16자 이상 임시 토큰을 넣은 뒤 이 페이지를 다시 여세요.</p>');
}

$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    csrf_check();
    if (!rate_ok('setup', ip_hash(), 10, 600)) {
        $error = '시도가 너무 많습니다. 10분 후 다시 시도하세요.';
    } else {
        $u = strtolower(trim((string) ($_POST['username'] ?? '')));
        $n = clean_text($_POST['display_name'] ?? '', 30);
        $p = (string) ($_POST['password'] ?? '');
        if (!hash_equals($token, (string) ($_POST['token'] ?? ''))) $error = '설치 토큰이 올바르지 않습니다.';
        elseif (!preg_match('/^[a-z0-9_-]{3,20}$/', $u)) $error = '관리자 ID는 영문 소문자·숫자·-·_ 3~20자입니다.';
        elseif ($n === '') $error = '표시 이름을 입력해 주세요.';
        elseif (strlen($p) < 10) $error = '비밀번호는 10자 이상이어야 합니다.';
        elseif ($p !== ($_POST['password2'] ?? '')) $error = '비밀번호 확인이 일치하지 않습니다.';
        else {
            $pdo->prepare('INSERT INTO admins (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
                ->execute([$u, $n, password_hash($p, PASSWORD_DEFAULT), now()]);
            admin_log($u, 'setup');
            flash('ok', '첫 관리자 계정을 만들었습니다. config/config.php의 setup_token을 지금 비워 주세요.');
            redirect('index.php');
        }
    }
}

admin_page('최초 설정', '
  <div class="login-wrap">
    <form class="form login" method="post" action="setup.php">
      ' . csrf_field() . '
      <h1>최초 관리자 만들기</h1>
      ' . ($error ? '<p class="flash err" role="alert">' . h($error) . '</p>' : '') . '
      <label>설치 토큰 <input name="token" type="password" required autocomplete="off"></label>
      <label>관리자 ID <input name="username" required pattern="[a-z0-9_-]{3,20}" autocomplete="off"></label>
      <label>표시 이름 <input name="display_name" required maxlength="30" autocomplete="off"></label>
      <label>비밀번호 (10자 이상) <input name="password" type="password" required minlength="10" autocomplete="new-password"></label>
      <label>비밀번호 확인 <input name="password2" type="password" required minlength="10" autocomplete="new-password"></label>
      <button class="btn btn-primary" type="submit">만들기</button>
    </form>
  </div>');
