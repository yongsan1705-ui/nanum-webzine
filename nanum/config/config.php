<?php
// ─────────────────────────────────────────────
// 웹진 서버 설정 (업체가 서버에 맞게 수정)
// 이 폴더(config/)는 웹에서 직접 열리면 안 됩니다. (.htaccess로 차단, nginx는 별도 설정)
// ─────────────────────────────────────────────
return [
    // DB 연결. 기본은 SQLite 파일(data/nanum.sqlite)입니다.
    // MySQL 사용 시 예: 'dsn' => 'mysql:host=localhost;dbname=nanum;charset=utf8mb4', 'user' => '...', 'pass' => '...'
    //   (MySQL은 sql/schema-mysql.sql로 테이블을 먼저 만들어 주세요)
    // ※ DB 계정 정보는 이 파일에만 두고 메일·메신저로 주고받지 마세요.
    'db' => [
        'dsn'  => 'sqlite:' . __DIR__ . '/../data/nanum.sqlite',
        'user' => null,
        'pass' => null,
    ],

    // 서버 고유 비밀값 (IP 해시 등에 사용). 설치 시 32자 이상 무작위 문자열로 바꿔야 동작합니다.
    'secret' => 'CHANGE_ME',

    // 최초 관리자 생성용 토큰. admin/setup.php에서 첫 계정을 만들 때만 쓰고, 만든 뒤에는 '' 로 비워 두세요.
    'setup_token' => '',

    // 접수를 허용할 출처(도메인). 비워 두면 같은 도메인만 허용합니다.
    'allowed_origins' => [], // 예: ['https://www.cseye.net']

    // 관리자 로그인 정책
    'admin' => [
        'session_minutes' => 30, // 이 시간 동안 활동이 없으면 자동 로그아웃
        'max_attempts'    => 5,  // 연속 실패 허용 횟수
        'lock_minutes'    => 5,  // 초과 시 잠금 시간
    ],

    // 상담 접수 보유 기간(일). 관리자 화면의 "보유 기간 지난 건 파기"에 사용. [법무 확인 후 확정]
    'consult_retention_days' => 180,

    // 접수 남용 방지: 같은 접속자(IP 기준) 10분당 허용 건수
    'rate_limit' => [
        'form_per_10min'  => 5,
        'event_per_10min' => 600,
    ],
];
