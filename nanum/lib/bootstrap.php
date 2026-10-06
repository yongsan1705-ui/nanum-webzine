<?php
// ─────────────────────────────────────────────
// 공통: 설정·DB 연결·테이블 생성·도우미 함수
// PHP 7.4 이상, PDO(SQLite 또는 MySQL) 필요
// ─────────────────────────────────────────────

date_default_timezone_set('Asia/Seoul');

$CONFIG   = require __DIR__ . '/../config/config.php';
$ARTICLES = require __DIR__ . '/../config/articles.php';
$OPTIONS  = require __DIR__ . '/../config/options.php';

function cfg(string $key, $default = null)
{
    global $CONFIG;
    $v = $CONFIG;
    foreach (explode('.', $key) as $k) {
        if (!is_array($v) || !array_key_exists($k, $v)) return $default;
        $v = $v[$k];
    }
    return $v;
}

function config_ready(): bool
{
    $s = (string) cfg('secret', '');
    return $s !== '' && $s !== 'CHANGE_ME' && strlen($s) >= 32;
}

function is_sqlite(): bool
{
    return strpos((string) cfg('db.dsn'), 'sqlite:') === 0;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO((string) cfg('db.dsn'), cfg('db.user'), cfg('db.pass'), [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    if (is_sqlite()) {
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA busy_timeout = 3000');
        create_schema_sqlite($pdo);
    }
    return $pdo;
}

// SQLite: 테이블이 없으면 만듭니다. (MySQL은 sql/schema-mysql.sql 사용)
function create_schema_sqlite(PDO $pdo): void
{
    $pdo->exec(file_get_contents(__DIR__ . '/../sql/schema-sqlite.sql'));
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

function client_ip(): string
{
    // 프록시·CDN 뒤에 있다면 업체 환경에 맞게 신뢰할 헤더를 지정하세요.
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// IP 원문은 저장하지 않고 비밀값을 섞은 해시만 씁니다.
function ip_hash(): string
{
    return hash('sha256', cfg('secret') . '|' . client_ip());
}

// 단순 요청 횟수 제한. 허용 범위면 true.
function rate_ok(string $bucket, string $key, int $limit, int $windowSec): bool
{
    $pdo = db();
    $now = time();
    $pdo->prepare('DELETE FROM rate_hits WHERE ts < ?')->execute([$now - 86400]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM rate_hits WHERE bucket = ? AND key_hash = ? AND ts >= ?');
    $st->execute([$bucket, $key, $now - $windowSec]);
    if ((int) $st->fetchColumn() >= $limit) return false;
    $pdo->prepare('INSERT INTO rate_hits (bucket, key_hash, ts) VALUES (?, ?, ?)')->execute([$bucket, $key, $now]);
    return true;
}

function rate_clear(string $bucket, string $key): void
{
    db()->prepare('DELETE FROM rate_hits WHERE bucket = ? AND key_hash = ?')->execute([$bucket, $key]);
}

function h($s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

function clean_text($s, int $max): string
{
    $s = trim(strip_tags((string) $s));
    $s = preg_replace('/[\x00-\x1F\x7F]/u', '', $s);
    return mb_substr($s, 0, $max, 'UTF-8');
}

// 여러 줄 글(문의 내용): 줄바꿈만 남기고 나머지 제어문자 제거
function clean_multiline($s, int $max): string
{
    $s = str_replace(["\r\n", "\r"], "\n", strip_tags((string) $s));
    $s = preg_replace('/[\x00-\x09\x0B-\x1F\x7F]/u', '', $s);
    $s = preg_replace("/\n{3,}/", "\n\n", trim($s));
    return mb_substr($s, 0, $max, 'UTF-8');
}

function article_label(?string $id): string
{
    global $ARTICLES;
    if (!$id) return '메인·직접 접속';
    return $ARTICLES[$id] ?? $id;
}

function admin_log(string $username, string $action, string $detail = ''): void
{
    db()->prepare('INSERT INTO admin_logs (username, action, detail, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        ->execute([$username, $action, mb_substr($detail, 0, 200, 'UTF-8'), substr(ip_hash(), 0, 16), now()]);
}
