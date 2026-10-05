<?php
// 관리자 공통: 세션, 로그인 확인, CSRF 토큰, 화면 틀
require __DIR__ . '/../lib/bootstrap.php';

header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
session_name('NANUMADMIN');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/',
    'secure'   => $https,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">';
}

function csrf_check(): void
{
    $t = $_POST['csrf'] ?? '';
    if (!is_string($t) || !hash_equals(csrf_token(), $t)) {
        http_response_code(400);
        exit('잘못된 요청입니다. 화면을 새로 고친 뒤 다시 시도해 주세요.');
    }
}

// 로그인한 관리자 정보. 없으면 null. 활동이 없으면 자동 만료.
function current_admin(): ?array
{
    if (empty($_SESSION['admin'])) return null;
    $idle = (int) cfg('admin.session_minutes', 30) * 60;
    if (time() - (int) ($_SESSION['last'] ?? 0) > $idle) {
        admin_log($_SESSION['admin']['username'], 'timeout');
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['flash'] = ['err', '오래 활동이 없어 로그아웃되었습니다.'];
        return null;
    }
    $_SESSION['last'] = time();
    return $_SESSION['admin'];
}

function flash(string $type, string $msg): void
{
    $_SESSION['flash'] = [$type, $msg];
}

function take_flash(): string
{
    if (empty($_SESSION['flash'])) return '';
    [$t, $m] = $_SESSION['flash'];
    unset($_SESSION['flash']);
    return '<p class="flash' . ($t === 'err' ? ' err' : '') . '" role="status">' . h($m) . '</p>';
}

function redirect(string $to): void
{
    header('Location: ' . $to);
    exit;
}

function admin_page(string $title, string $body, ?array $admin = null, string $tab = ''): void
{
    $tabs = [
        'dashboard'   => '통계',
        'consults'    => '상담 신청',
        'subscribers' => '웹진 신청',
        'logs'        => '접속 기록',
        'account'     => '관리자 계정',
    ];
    $nav = '';
    if ($admin) {
        foreach ($tabs as $k => $label) {
            $nav .= '<a href="index.php?p=' . $k . '"' . ($k === $tab ? ' aria-current="page"' : '') . '>' . h($label) . '</a>';
        }
    }
    $who = $admin
        ? '<div class="who"><span>' . h($admin['display_name']) . ' (' . h($admin['username']) . ')</span>'
          . '<form class="inline-form" method="post" action="index.php?a=logout">' . csrf_field() . '<button class="tool" type="submit">로그아웃</button></form></div>'
        : '';
    echo '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<meta name="robots" content="noindex, nofollow"><title>' . h($title) . ' | 웹진 관리자</title>'
        . '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">'
        . '<link rel="stylesheet" href="../assets/css/style.css"></head><body class="admin">'
        . '<header class="site-header"><div class="wrap admin-header"><a class="brand" href="index.php"><small>센트럴서울안과 소식지</small><strong>웹진 관리자</strong></a>' . $who . '</div></header>'
        . '<main id="main"><section class="section dash"><div class="wrap">'
        . ($nav ? '<nav class="admin-tabs" aria-label="관리 메뉴">' . $nav . '</nav>' : '')
        . take_flash() . $body
        . '</div></section></main></body></html>';
    exit;
}
