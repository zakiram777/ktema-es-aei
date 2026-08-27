<?php
/* ═══════════════════════════════════════════════════════════════
   proxy.php — 이 사이트가 직접 남의 집 문을 두드린다

   이 파일은 없어도 된다. 없으면 사이트는 공개 CORS 프록시를 쓴다.
   다만 공개 프록시는 남의 호의로 도는 것이라 느리거나 멎을 수 있다.
   PHP 가 되는 호스팅이라면 이 파일을 그대로 두는 편이 훨씬 안정적이다.
   사이트가 알아서 이 파일을 찾아 쓴다 (api/proxy.php?ping=1 로 확인).

   ── 아무 주소나 열어 주지 않는다 ──
   열린 프록시를 인터넷에 두면 남이 내 서버로 아무 데나 접속한다.
   그래서 아래 ALLOW 에 적힌 곳만 통과시킨다. 소식 출처를 늘렸다면
   여기에도 그 도메인을 적어야 한다.
   ═══════════════════════════════════════════════════════════════ */

declare(strict_types=1);

/** 살아 있는지 묻는 인사 — 사이트가 켜질 때 한 번 부른다 */
if (isset($_GET['ping'])) {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'ktema-proxy';
    exit;
}

/* ── 지나갈 수 있는 집들 ── */
const ALLOW = [
    // 시세
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com',
    'stooq.com',
    // 한국어 소식
    'www.yna.co.kr',
    'www.hankyung.com',
    'www.mk.co.kr',
    'rss.edaily.co.kr',
    'rss.donga.com',
    'www.hani.co.kr',
    'biz.chosun.com',
    'www.sedaily.com',
    // 영어 소식
    'finance.yahoo.com',
    'feeds.content.dowjones.io',
    'feeds.a.dj.com',
    'www.ft.com',
    'www.investing.com',
    'seekingalpha.com',
    'www.federalreserve.gov',
    'www.cnbc.com',
    'news.google.com',
];

const MAX_BYTES = 4 * 1024 * 1024;   // 4MB 넘게는 받지 않는다
const TIMEOUT   = 12;                 // 초

function fail(int $code, string $why): never {
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    echo $why;
    exit;
}

$url = $_GET['url'] ?? '';
if ($url === '') fail(400, 'url 이 없습니다');

$parts = parse_url($url);
if ($parts === false || empty($parts['scheme']) || empty($parts['host'])) {
    fail(400, '주소를 알아볼 수 없습니다');
}
if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
    fail(400, 'http 와 https 만 됩니다');
}

$host = strtolower($parts['host']);
if (!in_array($host, ALLOW, true)) {
    fail(403, "허락되지 않은 곳입니다: {$host}");
}

/* ── 받아 오기 ── */

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 4,
    CURLOPT_TIMEOUT        => TIMEOUT,
    CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_ENCODING       => '',          // gzip 을 알아서 푼다
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; KtemaEsAei/1.0; +rss-reader)',
    CURLOPT_HTTPHEADER     => ['Accept: application/rss+xml, application/xml, application/json, text/xml, */*'],
    // 되돌아오는 길에서 다른 집으로 새지 않게
    CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
    CURLOPT_BUFFERSIZE     => 65536,
    CURLOPT_NOPROGRESS     => false,
    CURLOPT_PROGRESSFUNCTION => static function ($ch, $dlTotal, $dlNow) {
        return $dlNow > MAX_BYTES ? 1 : 0;   // 너무 크면 끊는다
    },
]);

$body = curl_exec($ch);
$err  = curl_error($ch);
$code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($body === false) fail(502, '가져오지 못했습니다: ' . $err);
if ($code >= 400)    fail($code, "저쪽에서 {$code} 을 돌려주었습니다");

/* ── 그대로 넘겨주기 ── */

header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=45');
header('X-Content-Type-Options: nosniff');
header('Content-Type: ' . ($type !== '' ? $type : 'text/plain; charset=utf-8'));
echo $body;
