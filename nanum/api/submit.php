<?php
// ─────────────────────────────────────────────
// 웹진 접수 API: 상담 신청 · 웹진 신청 · 측정 이벤트를 받아 DB에 저장
// 요청: POST, JSON 본문 { "kind": "consult" | "subscribe" | "event", ... }
// 응답: JSON { ok: true } 또는 { ok: false, error: "..." }
// ─────────────────────────────────────────────

require __DIR__ . '/../lib/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function reply(int $code, array $body): void
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') reply(405, ['ok' => false, 'error' => 'POST만 허용됩니다.']);
if (!config_ready()) reply(503, ['ok' => false, 'error' => '서버 설정이 완료되지 않았습니다.']);

// 출처 확인: 다른 사이트에서 보낸 요청 차단
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $allowed = cfg('allowed_origins', []);
    $sameHost = parse_url($origin, PHP_URL_HOST) === ($_SERVER['HTTP_HOST'] ?? '');
    if (!$sameHost && !in_array($origin, $allowed, true)) reply(403, ['ok' => false, 'error' => '허용되지 않은 요청입니다.']);
}

$raw = file_get_contents('php://input', false, null, 0, 8192);
$in = json_decode((string) $raw, true);
if (!is_array($in)) reply(400, ['ok' => false, 'error' => '요청 형식이 올바르지 않습니다.']);

$kind    = (string) ($in['kind'] ?? '');
$article = isset($in['article']) && is_string($in['article']) && array_key_exists($in['article'], $ARTICLES) ? $in['article'] : null;
$source  = clean_text($in['source'] ?? 'direct', 60) ?: 'direct';

try {
    if ($kind === 'event') {
        if (!rate_ok('event', ip_hash(), (int) cfg('rate_limit.event_per_10min', 600), 600)) reply(429, ['ok' => false]);
        $type = (string) ($in['type'] ?? '');
        $types = ['view', 'dwell', 'scroll', 'consult_click', 'consult_submit', 'subscribe', 'share'];
        if (!in_array($type, $types, true)) reply(400, ['ok' => false]);

        $value = null;
        if ($type === 'dwell') {
            $value = (string) max(0, min(86400, (int) ($in['value'] ?? 0)));
        } elseif ($type === 'scroll') {
            $v = (int) ($in['value'] ?? 0);
            if (!in_array($v, [25, 50, 75, 100], true)) reply(400, ['ok' => false]);
            $value = (string) $v;
        } elseif ($type === 'share') {
            $value = in_array($in['value'] ?? '', ['copy', 'native'], true) ? $in['value'] : 'copy';
        }
        $viewId = preg_match('/^[a-z0-9]{8,30}$/', (string) ($in['view_id'] ?? '')) ? $in['view_id'] : null;

        db()->prepare('INSERT INTO events (type, article, value, source, view_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$type, $article, $value, $source, $viewId, now()]);
        http_response_code(204);
        exit;
    }

    if ($kind === 'consult' || $kind === 'subscribe') {
        if (!empty($in['website'])) reply(200, ['ok' => true]); // 자동 등록 방지용 숨김 칸이 채워짐 → 저장하지 않음
        if (!rate_ok('form', ip_hash(), (int) cfg('rate_limit.form_per_10min', 5), 600)) {
            reply(429, ['ok' => false, 'error' => '짧은 시간에 너무 많이 신청하셨습니다. 잠시 후 다시 시도해 주세요.']);
        }
    }

    if ($kind === 'consult') {
        $name  = clean_text($in['name'] ?? '', 30);
        $phone = clean_text($in['phone'] ?? '', 20);
        $field = (string) ($in['field'] ?? '');
        $time  = (string) ($in['time'] ?? '');
        if ($name === '') reply(400, ['ok' => false, 'error' => '이름을 입력해 주세요.']);
        if (!preg_match('/^[0-9\-\s]{9,14}$/', $phone)) reply(400, ['ok' => false, 'error' => '연락처를 숫자로 입력해 주세요.']);
        if (!in_array($field, $OPTIONS['consult_fields'], true)) reply(400, ['ok' => false, 'error' => '관심 분야를 선택해 주세요.']);
        if (!in_array($time, $OPTIONS['contact_times'], true)) reply(400, ['ok' => false, 'error' => '희망 연락 시간을 선택해 주세요.']);
        if (($in['agree_privacy'] ?? false) !== true) reply(400, ['ok' => false, 'error' => '개인정보 수집·이용에 동의해 주세요.']);

        $t = now();
        db()->prepare('INSERT INTO consults (name, phone, field, contact_time, article, source, agree_privacy, agreed_at, status, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
            ->execute([$name, $phone, $field, $time, $article, $source, $t, '접수', $t]);
        reply(200, ['ok' => true]);
    }

    if ($kind === 'subscribe') {
        $email = strtolower(trim((string) ($in['email'] ?? '')));
        $name  = clean_text($in['name'] ?? '', 30);
        if (strlen($email) > 100 || !filter_var($email, FILTER_VALIDATE_EMAIL)) reply(400, ['ok' => false, 'error' => '올바른 이메일 주소를 입력해 주세요.']);
        if (($in['agree_privacy'] ?? false) !== true) reply(400, ['ok' => false, 'error' => '개인정보 수집·이용에 동의해 주세요.']);
        if (($in['agree_marketing'] ?? false) !== true) reply(400, ['ok' => false, 'error' => '소식지를 받으려면 이메일 수신에 동의해 주세요.']);

        $pdo = db();
        $st = $pdo->prepare('SELECT id, unsubscribed_at FROM subscribers WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        $t = now();
        if ($row && $row['unsubscribed_at'] === null) reply(409, ['ok' => false, 'error' => '이미 신청한 이메일입니다.']);
        if ($row) {
            // 해지했던 이메일의 재신청: 동의 시각을 새로 기록
            $pdo->prepare('UPDATE subscribers SET name = ?, article = ?, source = ?, agree_privacy = 1, agree_marketing = 1, agreed_at = ?, unsubscribed_at = NULL WHERE id = ?')
                ->execute([$name, $article, $source, $t, $row['id']]);
        } else {
            $pdo->prepare('INSERT INTO subscribers (email, name, article, source, agree_privacy, agree_marketing, agreed_at, created_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)')
                ->execute([$email, $name, $article, $source, $t, $t]);
        }
        reply(200, ['ok' => true]);
    }

    reply(400, ['ok' => false, 'error' => '알 수 없는 요청입니다.']);
} catch (Throwable $e) {
    error_log('[nanum submit] ' . $e->getMessage());
    reply(500, ['ok' => false, 'error' => '접수 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.']);
}
