<?php
// ─────────────────────────────────────────────
// 웹진 관리자 (DB 페이지)
//   통계 · 상담 신청 · 웹진 신청 · 접속 기록 · 관리자 계정
// 첫 관리자는 setup.php에서 만듭니다.
// ─────────────────────────────────────────────
require __DIR__ . '/_auth.php';

if (!config_ready()) {
    admin_page('설정 필요', '<h1 class="page-title">설정이 필요합니다</h1><p>config/config.php의 <code>secret</code>을 32자 이상 무작위 문자열로 바꿔 주세요.</p>');
}

$pdo = db();
if ((int) $pdo->query('SELECT COUNT(*) FROM admins')->fetchColumn() === 0) redirect('setup.php');

$act    = (string) ($_GET['a'] ?? '');
$isPost = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST';
$STATUSES = ['접수', '연락 완료', '종결'];

// ── 로그인 ──
if ($act === 'login' && $isPost) {
    csrf_check();
    $username = strtolower(trim((string) ($_POST['username'] ?? '')));
    $password = (string) ($_POST['password'] ?? '');
    $key      = hash('sha256', ip_hash() . '|' . $username);
    $window   = (int) cfg('admin.lock_minutes', 5) * 60;
    $max      = (int) cfg('admin.max_attempts', 5);

    $st = $pdo->prepare('SELECT COUNT(*) FROM rate_hits WHERE bucket = ? AND key_hash = ? AND ts >= ?');
    $st->execute(['login', $key, time() - $window]);
    if ((int) $st->fetchColumn() >= $max) {
        admin_log($username, 'locked');
        flash('err', '로그인 시도가 너무 많습니다. ' . cfg('admin.lock_minutes', 5) . '분 후 다시 시도하세요.');
        redirect('index.php');
    }

    $st = $pdo->prepare('SELECT * FROM admins WHERE username = ?');
    $st->execute([$username]);
    $row = $st->fetch();
    // 존재하지 않는 ID도 비슷한 시간이 걸리도록 임시 해시와 비교
    $ok = password_verify($password, $row ? $row['password_hash'] : password_hash(random_bytes(16), PASSWORD_DEFAULT));

    if ($row && $ok) {
        rate_clear('login', $key);
        session_regenerate_id(true);
        $_SESSION['admin'] = ['id' => (int) $row['id'], 'username' => $row['username'], 'display_name' => $row['display_name']];
        $_SESSION['last']  = time();
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $row['id']]);
        }
        $pdo->prepare('UPDATE admins SET last_login_at = ? WHERE id = ?')->execute([now(), $row['id']]);
        admin_log($row['username'], 'login');
        redirect('index.php');
    }
    $pdo->prepare('INSERT INTO rate_hits (bucket, key_hash, ts) VALUES (?, ?, ?)')->execute(['login', $key, time()]);
    admin_log($username, 'login_fail');
    flash('err', 'ID 또는 비밀번호가 올바르지 않습니다.');
    redirect('index.php');
}

$admin = current_admin();
if (!$admin) {
    admin_page('로그인', '
      <div class="login-wrap">
        <form class="form login" method="post" action="index.php?a=login">
          ' . csrf_field() . '
          <h1>관리자 로그인</h1>
          <p class="muted">웹진 접수 데이터는 지정된 관리자만 볼 수 있습니다.</p>
          <label>관리자 ID <input name="username" autocomplete="username" required autofocus></label>
          <label>비밀번호 <input name="password" type="password" autocomplete="current-password" required></label>
          <button class="btn btn-primary" type="submit">로그인</button>
        </form>
      </div>');
}
$me = $admin['username'];

// ── CSV 내보내기 (POST) ──
if ($act === 'export' && $isPost) {
    csrf_check();
    $what = (string) ($_GET['what'] ?? '');
    $sets = [
        'consults'    => ['SELECT id, created_at, name, phone, field, message, article, source, status, memo, agreed_at FROM consults ORDER BY id DESC',
                          ['번호', '접수 시각', '이름', '연락처', '관심 진료과목', '문의 내용', '신청 기사', '유입 경로', '상태', '메모', '개인정보 동의 시각']],
        'subscribers' => ['SELECT id, created_at, email, name, article, source, agreed_at FROM subscribers WHERE unsubscribed_at IS NULL ORDER BY id DESC',
                          ['번호', '신청 시각', '이메일', '이름', '신청 기사', '유입 경로', '동의 시각']],
        'events'      => ['SELECT created_at, type, article, value, source, view_id FROM events ORDER BY id DESC',
                          ['시각', '이벤트', '기사', '값', '유입 경로', '조회 ID']],
    ];
    if (!isset($sets[$what])) redirect('index.php');
    [$sql, $head] = $sets[$what];
    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_NUM);
    admin_log($me, 'export', $what . ' ' . count($rows) . '건');

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="nanum-' . $what . '-' . date('Ymd') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF");
    // 엑셀 수식 실행 방지: = + - @ 로 시작하는 값 앞에 작은따옴표
    $safe = function ($v) { $v = (string) $v; return ($v !== '' && strpos('=+-@', $v[0]) !== false) ? "'" . $v : $v; };
    fputcsv($out, $head);
    foreach ($rows as $r) fputcsv($out, array_map($safe, $r));
    fclose($out);
    exit;
}

// ── 처리 (POST) ──
if ($isPost) {
    csrf_check();
    switch ($act) {
        case 'logout':
            admin_log($me, 'logout');
            $_SESSION = [];
            session_regenerate_id(true);
            redirect('index.php');

        case 'consult_status':
            $id = (int) ($_POST['id'] ?? 0);
            $status = (string) ($_POST['status'] ?? '');
            $memo = clean_text($_POST['memo'] ?? '', 200);
            if (in_array($status, $STATUSES, true)) {
                $pdo->prepare('UPDATE consults SET status = ?, memo = ?, updated_at = ? WHERE id = ?')->execute([$status, $memo, now(), $id]);
                admin_log($me, 'consult_update', "#$id → $status");
                flash('ok', "상담 #$id 상태를 ‘$status’(으)로 바꿨습니다.");
            }
            redirect('index.php?p=consults');

        case 'consult_delete':
            $id = (int) ($_POST['id'] ?? 0);
            $pdo->prepare('DELETE FROM consults WHERE id = ?')->execute([$id]);
            admin_log($me, 'consult_delete', "#$id");
            flash('ok', "상담 #$id 를 삭제했습니다.");
            redirect('index.php?p=consults');

        case 'consult_purge':
            $days = (int) cfg('consult_retention_days', 180);
            $before = date('Y-m-d H:i:s', time() - $days * 86400);
            $st = $pdo->prepare('DELETE FROM consults WHERE created_at < ?');
            $st->execute([$before]);
            admin_log($me, 'consult_purge', $st->rowCount() . '건 (보유 ' . $days . '일 경과)');
            flash('ok', '보유 기간(' . $days . '일)이 지난 상담 ' . $st->rowCount() . '건을 파기했습니다.');
            redirect('index.php?p=consults');

        case 'sub_unsubscribe':
            $id = (int) ($_POST['id'] ?? 0);
            $pdo->prepare('UPDATE subscribers SET unsubscribed_at = ?, agree_marketing = 0 WHERE id = ? AND unsubscribed_at IS NULL')->execute([now(), $id]);
            admin_log($me, 'sub_unsubscribe', "#$id");
            flash('ok', "구독 #$id 를 해지 처리했습니다.");
            redirect('index.php?p=subscribers');

        case 'sub_delete':
            $id = (int) ($_POST['id'] ?? 0);
            $pdo->prepare('DELETE FROM subscribers WHERE id = ?')->execute([$id]);
            admin_log($me, 'sub_delete', "#$id");
            flash('ok', "구독 #$id 를 삭제했습니다.");
            redirect('index.php?p=subscribers');

        case 'password':
            $st = $pdo->prepare('SELECT password_hash FROM admins WHERE id = ?');
            $st->execute([$admin['id']]);
            $hash = (string) $st->fetchColumn();
            $new = (string) ($_POST['new'] ?? '');
            if (!password_verify((string) ($_POST['current'] ?? ''), $hash)) flash('err', '현재 비밀번호가 올바르지 않습니다.');
            elseif (strlen($new) < 10) flash('err', '새 비밀번호는 10자 이상이어야 합니다.');
            elseif ($new !== ($_POST['new2'] ?? '')) flash('err', '새 비밀번호 확인이 일치하지 않습니다.');
            else {
                $pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?')->execute([password_hash($new, PASSWORD_DEFAULT), $admin['id']]);
                admin_log($me, 'password_change');
                flash('ok', '비밀번호를 바꿨습니다.');
            }
            redirect('index.php?p=account');

        case 'admin_add':
            $u = strtolower(trim((string) ($_POST['username'] ?? '')));
            $n = clean_text($_POST['display_name'] ?? '', 30);
            $p = (string) ($_POST['password'] ?? '');
            if (!preg_match('/^[a-z0-9_-]{3,20}$/', $u)) flash('err', '관리자 ID는 영문 소문자·숫자·-·_ 3~20자입니다.');
            elseif ($n === '') flash('err', '표시 이름을 입력해 주세요.');
            elseif (strlen($p) < 10) flash('err', '비밀번호는 10자 이상이어야 합니다.');
            else {
                try {
                    $pdo->prepare('INSERT INTO admins (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
                        ->execute([$u, $n, password_hash($p, PASSWORD_DEFAULT), now()]);
                    admin_log($me, 'admin_add', $u);
                    flash('ok', "관리자 ‘$u’를 추가했습니다. 비밀번호는 본인에게 직접 전달하고 첫 로그인 후 바꾸도록 안내하세요.");
                } catch (PDOException $e) {
                    flash('err', '이미 있는 관리자 ID입니다.');
                }
            }
            redirect('index.php?p=account');

        case 'admin_delete':
            $id = (int) ($_POST['id'] ?? 0);
            if ($id === (int) $admin['id']) { flash('err', '본인 계정은 삭제할 수 없습니다.'); redirect('index.php?p=account'); }
            $st = $pdo->prepare('SELECT username FROM admins WHERE id = ?');
            $st->execute([$id]);
            $u = $st->fetchColumn();
            $pdo->prepare('DELETE FROM admins WHERE id = ?')->execute([$id]);
            admin_log($me, 'admin_delete', (string) $u);
            flash('ok', '관리자 계정을 삭제했습니다.');
            redirect('index.php?p=account');
    }
    redirect('index.php');
}

$p = (string) ($_GET['p'] ?? 'dashboard');
$exportBtn = function (string $what, string $label) { return '<form class="inline-form" method="post" action="index.php?a=export&amp;what=' . $what . '">' . csrf_field() . '<button class="tool" type="submit">' . h($label) . '</button></form>'; };
$confirm = function (string $msg) { return ' onsubmit="return confirm(\'' . h($msg) . '\')"'; };

// ── 통계 ──
if ($p === 'dashboard') {
    $days  = (int) ($_GET['days'] ?? 30);
    $since = $days > 0 ? date('Y-m-d H:i:s', time() - $days * 86400) : '1970-01-01 00:00:00';

    $count = function (string $type) use ($pdo, $since) {
        $st = $pdo->prepare('SELECT article, COUNT(*) c FROM events WHERE type = ? AND created_at >= ? GROUP BY article');
        $st->execute([$type, $since]);
        $m = [];
        foreach ($st as $r) $m[(string) $r['article']] = (int) $r['c'];
        return $m;
    };
    $views = $count('view'); $clicks = $count('consult_click'); $submits = $count('consult_submit');
    $subs = $count('subscribe'); $shares = $count('share');

    // 체류시간: 조회 1회(view_id)당 최댓값의 평균
    $st = $pdo->prepare('SELECT article, AVG(m) a FROM (SELECT article, view_id, MAX(CAST(value AS INTEGER)) m FROM events
                         WHERE type = ? AND created_at >= ? GROUP BY article, view_id) t GROUP BY article');
    $st->execute(['dwell', $since]);
    $dwell = [];
    foreach ($st as $r) $dwell[(string) $r['article']] = (int) round((float) $r['a']);

    $st = $pdo->prepare('SELECT article, COUNT(DISTINCT view_id) c FROM events WHERE type = ? AND value = ? AND created_at >= ? GROUP BY article');
    $st->execute(['scroll', '100', $since]);
    $reach = [];
    foreach ($st as $r) $reach[(string) $r['article']] = (int) $r['c'];

    $st = $pdo->prepare('SELECT source, COUNT(*) c FROM events WHERE type = ? AND created_at >= ? GROUP BY source ORDER BY c DESC LIMIT 15');
    $st->execute(['view', $since]);
    $sources = $st->fetchAll();

    $sum = function (array $m) { return array_sum($m); };
    $tv = $sum($views); $tc = $sum($clicks); $ts = $sum($submits);
    $fmt = function (int $s) { return $s >= 60 ? intdiv($s, 60) . '분 ' . ($s % 60) . '초' : $s . '초'; };
    $max = max($tv, 1);

    $rows = [];
    foreach ($ARTICLES as $id => $label) {
        $v = $views[$id] ?? 0;
        $rows[] = ['id' => $id, 'label' => $label, 'views' => $v, 'dwell' => $dwell[$id] ?? 0,
                   'reach' => $v ? (int) round(($reach[$id] ?? 0) / $v * 100) : 0,
                   'click' => $clicks[$id] ?? 0, 'submit' => $submits[$id] ?? 0, 'sub' => $subs[$id] ?? 0, 'share' => $shares[$id] ?? 0];
    }
    usort($rows, function ($a, $b) { return $b['views'] <=> $a['views']; });

    $periods = [7 => '최근 7일', 30 => '최근 30일', 0 => '전체'];
    $filter = '';
    foreach ($periods as $d => $label) $filter .= '<a href="index.php?p=dashboard&days=' . $d . '"' . ($d === $days ? ' aria-current="page"' : '') . '>' . $label . '</a>';

    $html = '<div class="dash-head"><h1 class="page-title">통계</h1><div class="dash-actions">' . $exportBtn('events', '측정 기록 CSV') . '</div></div>'
        . '<nav class="admin-tabs" aria-label="기간">' . $filter . '</nav>'
        . '<div class="kpis">'
        . '<div><span>기사 조회</span><strong>' . $tv . '</strong></div>'
        . '<div><span>상담 클릭</span><strong>' . $tc . '</strong></div>'
        . '<div><span>상담 신청</span><strong>' . $ts . '</strong></div>'
        . '<div><span>웹진 신청</span><strong>' . $sum($subs) . '</strong></div>'
        . '<div><span>공유</span><strong>' . $sum($shares) . '</strong></div></div>'
        . '<h2>상담 전환 경로</h2><div class="funnel">';
    foreach ([['기사 조회', $tv], ['상담받기 클릭', $tc], ['상담 신청 제출', $ts]] as [$l, $n]) {
        $html .= '<div class="f-row"><span>' . $l . '</span><div class="f-bar"><i style="width:' . round($n / $max * 100, 1) . '%"></i></div><b>' . $n . '</b></div>';
    }
    $html .= '</div><h2>기사별 성과</h2><div class="table-wrap"><table><thead><tr><th>기사</th><th>조회</th><th>평균 체류</th><th>끝까지 읽음</th><th>상담 클릭</th><th>상담 신청</th><th>웹진 신청</th><th>공유</th></tr></thead><tbody>';
    foreach ($rows as $r) {
        $html .= '<tr><td><a href="../' . h($r['id']) . '.html" target="_blank" rel="noopener">' . h($r['label']) . '</a></td><td>' . $r['views'] . '</td><td>' . $fmt($r['dwell'])
            . '</td><td>' . $r['reach'] . '%</td><td>' . $r['click'] . '</td><td>' . $r['submit'] . '</td><td>' . $r['sub'] . '</td><td>' . $r['share'] . '</td></tr>';
    }
    $html .= '</tbody></table></div><p class="muted">메인 화면·상담 페이지에서 바로 신청한 건은 기사별 표에 잡히지 않고 상단 합계에만 포함됩니다.</p><h2>유입 경로</h2>';
    if ($sources) {
        $html .= '<ul class="sources">';
        foreach ($sources as $s) $html .= '<li><span>' . h($s['source']) . '</span><b>' . (int) $s['c'] . '</b></li>';
        $html .= '</ul>';
    } else $html .= '<p class="muted">아직 데이터가 없습니다.</p>';
    admin_page('통계', $html, $admin, 'dashboard');
}

// ── 상담 신청 ──
if ($p === 'consults') {
    $status = (string) ($_GET['status'] ?? '');
    $page   = max(1, (int) ($_GET['page'] ?? 1));
    $per    = 50;
    $where  = in_array($status, $STATUSES, true) ? 'WHERE status = ?' : '';
    $args   = $where ? [$status] : [];
    $st = $pdo->prepare("SELECT COUNT(*) FROM consults $where"); $st->execute($args);
    $total = (int) $st->fetchColumn();
    $st = $pdo->prepare("SELECT * FROM consults $where ORDER BY id DESC LIMIT $per OFFSET " . (($page - 1) * $per));
    $st->execute($args);
    $list = $st->fetchAll();
    admin_log($me, 'view_consults', "page $page");

    $filter = '<a href="index.php?p=consults"' . ($status === '' ? ' aria-current="page"' : '') . '>전체</a>';
    foreach ($STATUSES as $s) $filter .= '<a href="index.php?p=consults&status=' . urlencode($s) . '"' . ($s === $status ? ' aria-current="page"' : '') . '>' . h($s) . '</a>';

    $html = '<div class="dash-head"><h1 class="page-title">상담 신청 <small class="muted">' . $total . '건</small></h1><div class="dash-actions">'
        . '' . $exportBtn('consults', 'CSV 내보내기') . ''
        . '<form class="inline-form" method="post" action="index.php?a=consult_purge"' . $confirm('보유 기간(' . (int) cfg('consult_retention_days', 180) . '일)이 지난 상담 신청을 모두 파기합니다. 되돌릴 수 없습니다.') . '>' . csrf_field() . '<button class="tool danger" type="submit">보유 기간 지난 건 파기</button></form>'
        . '</div></div><nav class="admin-tabs" aria-label="상태">' . $filter . '</nav>';
    if (!$list) $html .= '<p class="muted">접수 내역이 없습니다.</p>';
    else {
        $html .= '<div class="table-wrap"><table><thead><tr><th>번호</th><th>접수 시각</th><th>이름</th><th>연락처</th><th>관심 진료과목</th><th>문의 내용</th><th>신청 기사</th><th>상태·메모</th><th></th></tr></thead><tbody>';
        foreach ($list as $c) {
            $opts = '';
            foreach ($STATUSES as $s) $opts .= '<option' . ($s === $c['status'] ? ' selected' : '') . '>' . h($s) . '</option>';
            $html .= '<tr><td>' . (int) $c['id'] . '</td><td>' . h($c['created_at']) . '</td><td>' . h($c['name']) . '</td><td><a href="tel:' . h(preg_replace('/\D/', '', $c['phone'])) . '">' . h($c['phone']) . '</a></td>'
                . '<td>' . h($c['field']) . '</td><td class="msg">' . h((string) $c['message']) . '</td><td>' . h(article_label($c['article'])) . '</td>'
                . '<td><form class="inline-form" method="post" action="index.php?a=consult_status">' . csrf_field() . '<input type="hidden" name="id" value="' . (int) $c['id'] . '">'
                . '<select name="status">' . $opts . '</select> <input name="memo" value="' . h($c['memo']) . '" maxlength="200" placeholder="메모" size="12"> <button class="tool" type="submit">저장</button></form></td>'
                . '<td><form class="inline-form" method="post" action="index.php?a=consult_delete"' . $confirm('상담 #' . (int) $c['id'] . '를 삭제할까요? 되돌릴 수 없습니다.') . '>' . csrf_field()
                . '<input type="hidden" name="id" value="' . (int) $c['id'] . '"><button class="tool danger" type="submit">삭제</button></form></td></tr>';
        }
        $html .= '</tbody></table></div>';
        $pages = (int) ceil($total / $per);
        if ($pages > 1) {
            $html .= '<nav class="admin-tabs" aria-label="페이지">';
            for ($i = 1; $i <= $pages; $i++) $html .= '<a href="index.php?p=consults&status=' . urlencode($status) . '&page=' . $i . '"' . ($i === $page ? ' aria-current="page"' : '') . '>' . $i . '</a>';
            $html .= '</nav>';
        }
    }
    $html .= '<p class="muted">상담 신청 정보는 연락 목적 외로 쓰지 마세요. 이 화면의 열람·내보내기·삭제는 접속 기록에 남습니다.</p>';
    admin_page('상담 신청', $html, $admin, 'consults');
}

// ── 웹진 신청 ──
if ($p === 'subscribers') {
    $showAll = !empty($_GET['all']);
    $list = $pdo->query('SELECT * FROM subscribers ' . ($showAll ? '' : 'WHERE unsubscribed_at IS NULL ') . 'ORDER BY id DESC LIMIT 500')->fetchAll();
    $active = (int) $pdo->query('SELECT COUNT(*) FROM subscribers WHERE unsubscribed_at IS NULL')->fetchColumn();
    admin_log($me, 'view_subscribers');

    $html = '<div class="dash-head"><h1 class="page-title">웹진 신청 <small class="muted">구독 중 ' . $active . '명</small></h1><div class="dash-actions">'
        . '' . $exportBtn('subscribers', '구독자 CSV') . '</div></div>'
        . '<nav class="admin-tabs"><a href="index.php?p=subscribers"' . ($showAll ? '' : ' aria-current="page"') . '>구독 중</a><a href="index.php?p=subscribers&all=1"' . ($showAll ? ' aria-current="page"' : '') . '>해지 포함 전체</a></nav>';
    if (!$list) $html .= '<p class="muted">신청 내역이 없습니다.</p>';
    else {
        $html .= '<div class="table-wrap"><table><thead><tr><th>번호</th><th>신청 시각</th><th>이메일</th><th>이름</th><th>신청 기사</th><th>상태</th><th></th></tr></thead><tbody>';
        foreach ($list as $s) {
            $isActive = $s['unsubscribed_at'] === null;
            $html .= '<tr><td>' . (int) $s['id'] . '</td><td>' . h($s['created_at']) . '</td><td>' . h($s['email']) . '</td><td>' . h($s['name'] ?: '-') . '</td><td>' . h(article_label($s['article'])) . '</td>'
                . '<td>' . ($isActive ? '<span class="status done">구독 중</span>' : '<span class="status">해지 ' . h(substr($s['unsubscribed_at'], 0, 10)) . '</span>') . '</td><td>'
                . ($isActive ? '<form class="inline-form" method="post" action="index.php?a=sub_unsubscribe"' . $confirm('구독을 해지 처리할까요?') . '>' . csrf_field() . '<input type="hidden" name="id" value="' . (int) $s['id'] . '"><button class="tool" type="submit">해지</button></form> ' : '')
                . '<form class="inline-form" method="post" action="index.php?a=sub_delete"' . $confirm('구독 정보를 삭제할까요? 되돌릴 수 없습니다.') . '>' . csrf_field() . '<input type="hidden" name="id" value="' . (int) $s['id'] . '"><button class="tool danger" type="submit">삭제</button></form></td></tr>';
        }
        $html .= '</tbody></table></div>';
    }
    $html .= '<p class="muted">구독 해지 요청을 받으면 ‘해지’를 눌러 주세요. 해지된 이메일에는 소식을 보내면 안 됩니다.</p>';
    admin_page('웹진 신청', $html, $admin, 'subscribers');
}

// ── 접속 기록 ──
if ($p === 'logs') {
    $LABEL = ['login' => '로그인', 'login_fail' => '로그인 실패', 'locked' => '로그인 잠김', 'logout' => '로그아웃', 'timeout' => '자동 로그아웃',
              'view_consults' => '상담 목록 열람', 'view_subscribers' => '구독 목록 열람', 'export' => 'CSV 내보내기',
              'consult_update' => '상담 상태 변경', 'consult_delete' => '상담 삭제', 'consult_purge' => '상담 일괄 파기',
              'sub_unsubscribe' => '구독 해지', 'sub_delete' => '구독 삭제', 'password_change' => '비밀번호 변경',
              'admin_add' => '관리자 추가', 'admin_delete' => '관리자 삭제', 'setup' => '최초 관리자 생성'];
    $list = $pdo->query('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 300')->fetchAll();
    $html = '<h1 class="page-title">접속 기록 <small class="muted">최근 300건</small></h1><div class="table-wrap"><table><thead><tr><th>시각</th><th>관리자 ID</th><th>구분</th><th>내용</th></tr></thead><tbody>';
    foreach ($list as $l) $html .= '<tr><td>' . h($l['created_at']) . '</td><td>' . h($l['username'] ?: '-') . '</td><td>' . h($LABEL[$l['action']] ?? $l['action']) . '</td><td>' . h($l['detail']) . '</td></tr>';
    $html .= '</tbody></table></div>';
    admin_page('접속 기록', $html, $admin, 'logs');
}

// ── 관리자 계정 ──
if ($p === 'account') {
    $list = $pdo->query('SELECT id, username, display_name, created_at, last_login_at FROM admins ORDER BY id')->fetchAll();
    $html = '<h1 class="page-title">관리자 계정</h1><div class="table-wrap"><table><thead><tr><th>ID</th><th>이름</th><th>생성</th><th>마지막 로그인</th><th></th></tr></thead><tbody>';
    foreach ($list as $a) {
        $html .= '<tr><td>' . h($a['username']) . '</td><td>' . h($a['display_name']) . '</td><td>' . h($a['created_at']) . '</td><td>' . h($a['last_login_at'] ?: '-') . '</td><td>'
            . ((int) $a['id'] === (int) $admin['id'] ? '<span class="muted">본인</span>'
               : '<form class="inline-form" method="post" action="index.php?a=admin_delete"' . $confirm($a['username'] . ' 계정을 삭제할까요?') . '>' . csrf_field() . '<input type="hidden" name="id" value="' . (int) $a['id'] . '"><button class="tool danger" type="submit">삭제</button></form>')
            . '</td></tr>';
    }
    $html .= '</tbody></table></div>'
        . '<h2>내 비밀번호 변경</h2><form class="form panel" method="post" action="index.php?a=password">' . csrf_field()
        . '<label>현재 비밀번호 <input name="current" type="password" required autocomplete="current-password"></label>'
        . '<label>새 비밀번호 (10자 이상) <input name="new" type="password" required minlength="10" autocomplete="new-password"></label>'
        . '<label>새 비밀번호 확인 <input name="new2" type="password" required minlength="10" autocomplete="new-password"></label>'
        . '<button class="btn btn-primary" type="submit">변경</button></form>'
        . '<h2>관리자 추가</h2><form class="form panel" method="post" action="index.php?a=admin_add">' . csrf_field()
        . '<label>관리자 ID <input name="username" required pattern="[a-z0-9_-]{3,20}" placeholder="영문 소문자·숫자 3~20자" autocomplete="off"></label>'
        . '<label>표시 이름 <input name="display_name" required maxlength="30" autocomplete="off"></label>'
        . '<label>임시 비밀번호 (10자 이상) <input name="password" type="password" required minlength="10" autocomplete="new-password"></label>'
        . '<p class="hint">임시 비밀번호는 본인에게 직접 전달하고, 첫 로그인 후 바로 바꾸도록 안내하세요.</p>'
        . '<button class="btn btn-primary" type="submit">추가</button></form>';
    admin_page('관리자 계정', $html, $admin, 'account');
}

redirect('index.php');
