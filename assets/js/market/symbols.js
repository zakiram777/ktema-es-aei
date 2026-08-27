/* ═══════════════════════════════════════════════════════════════
   symbols.js — 무엇을 지켜볼 것인가

   야후 파이낸스의 기호를 쓴다.
     ^KS11    코스피          ^KQ11  코스닥
     ^GSPC    S&P 500        ^IXIC  나스닥      ^DJI  다우
     005930.KS 삼성전자 (한국 종목은 .KS / .KQ)
     KRW=X    원·달러         ^VIX   변동성
     GC=F     금              CL=F   유가       BTC-USD 비트코인

   설정에서 목록을 바꿀 수 있고, 바꾼 것은 브라우저에 남는다.
   ═══════════════════════════════════════════════════════════════ */

export const DEFAULT_WATCH = [
  { symbol: '^KS11',   ko: '코스피',     name: 'KOSPI',        kind: 'index', tz: 'Asia/Seoul' },
  { symbol: '^KQ11',   ko: '코스닥',     name: 'KOSDAQ',       kind: 'index', tz: 'Asia/Seoul' },
  { symbol: '^GSPC',   ko: 'S&P 500',   name: 'S&P 500',      kind: 'index', tz: 'America/New_York' },
  { symbol: '^IXIC',   ko: '나스닥',     name: 'Nasdaq',       kind: 'index', tz: 'America/New_York' },
  { symbol: '^DJI',    ko: '다우',       name: 'Dow Jones',    kind: 'index', tz: 'America/New_York' },
  { symbol: '^N225',   ko: '닛케이',     name: 'Nikkei 225',   kind: 'index', tz: 'Asia/Tokyo' },
  { symbol: 'KRW=X',   ko: '원·달러',    name: 'USD/KRW',      kind: 'fx' },
  { symbol: '^VIX',    ko: '변동성',     name: 'VIX',          kind: 'index' },
  { symbol: 'GC=F',    ko: '금',         name: 'Gold',         kind: 'commodity' },
  { symbol: 'CL=F',    ko: '유가',       name: 'WTI Crude',    kind: 'commodity' },
  { symbol: 'BTC-USD', ko: '비트코인',   name: 'Bitcoin',      kind: 'crypto' },
  { symbol: '005930.KS', ko: '삼성전자', name: 'Samsung Elec', kind: 'stock', tz: 'Asia/Seoul' },
];

/** 차트에서 곧바로 고를 수 있는 것들 */
export const QUICK = [
  '^KS11', '^KQ11', '^GSPC', '^IXIC', '^DJI', '^N225',
  '005930.KS', '000660.KS', 'AAPL', 'NVDA', 'MSFT', 'TSLA',
  'KRW=X', 'BTC-USD', 'GC=F',
];

/** 이름을 아는 것들 — 차트 머리에 한글로 적어 준다 */
export const NAMES = {
  '^KS11': '코스피', '^KQ11': '코스닥', '^GSPC': 'S&P 500', '^IXIC': '나스닥',
  '^DJI': '다우존스', '^N225': '닛케이 225', '^HSI': '항셍', '^FTSE': 'FTSE 100',
  '^VIX': '변동성 지수', 'KRW=X': '원·달러 환율', 'JPY=X': '엔·달러',
  'GC=F': '금', 'SI=F': '은', 'CL=F': 'WTI 유가', 'BTC-USD': '비트코인', 'ETH-USD': '이더리움',
  '005930.KS': '삼성전자', '000660.KS': 'SK하이닉스', '035420.KS': 'NAVER',
  '207940.KS': '삼성바이오로직스', '005380.KS': '현대차', '051910.KS': 'LG화학',
  'AAPL': '애플', 'MSFT': '마이크로소프트', 'NVDA': '엔비디아', 'TSLA': '테슬라',
  'GOOGL': '알파벳', 'AMZN': '아마존', 'META': '메타',
};

export const nameOf = (sym) => NAMES[sym] || sym;

/** 시장 시간 — 머리의 시계에 불이 들어온다 */
export const MARKETS = [
  { id: 'seoul', label: 'SEOUL', tz: 'Asia/Seoul',       open: [9, 0],  close: [15, 30], days: [1, 2, 3, 4, 5] },
  { id: 'ny',    label: 'NEW YORK', tz: 'America/New_York', open: [9, 30], close: [16, 0], days: [1, 2, 3, 4, 5] },
  { id: 'london',label: 'LONDON', tz: 'Europe/London',    open: [8, 0],  close: [16, 30], days: [1, 2, 3, 4, 5] },
];

/** 그 시장이 지금 열려 있나 (공휴일은 보지 않는다 — 참고용이다) */
export function isOpen(m, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: m.tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);

  const get = (t) => parts.find((p) => p.type === t)?.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  if (!m.days.includes(wd)) return false;

  const h = Number(get('hour')) % 24;
  const mi = Number(get('minute'));
  const mins = h * 60 + mi;
  return mins >= m.open[0] * 60 + m.open[1] && mins < m.close[0] * 60 + m.close[1];
}

/**
 * 소리 내어 읽을 때 값 뒤에 붙일 단위.
 *
 * 지수에는 단위가 없다. 코스피를 "6,808 원" 이라고 읽으면 틀린 말이
 * 된다 — 야후가 지수의 통화를 KRW 로 적어 보내기 때문에 그대로
 * 믿으면 그렇게 된다. 그래서 통화가 아니라 종류를 보고 정한다.
 */
/**
 * 기호만 보고 통화를 짚는다.
 *
 * 시세를 묶어서 한 번에 부르는 길(spark)에는 통화가 딸려 오지 않는다.
 * 그런데 단위를 붙이려면 통화를 알아야 한다 — 삼성전자를 "달러" 로
 * 읽으면 안 된다. 기호에 이미 답이 적혀 있으므로 거기서 읽는다.
 *   005930.KS → KRW      KRW=X → KRW      JPY=X → JPY
 *   BTC-USD  → USD       GC=F  → USD      그 밖 → USD
 */
export function currencyOf(symbol) {
  const s = String(symbol || '');
  if (/\.(KS|KQ)$/i.test(s)) return 'KRW';
  if (/\.T$/i.test(s)) return 'JPY';
  if (/\.(L|IL)$/i.test(s)) return 'GBP';
  const fx = /^([A-Z]{3})=X$/i.exec(s);
  if (fx) return fx[1].toUpperCase();
  return 'USD';
}

export function unitFor(q) {
  if (!q) return '';
  switch (q.kind) {
    case 'index':     return '';            // 포인트다. 굳이 붙이지 않는다
    case 'fx':        return q.currency === 'KRW' ? '원' : '';
    case 'stock':     return q.currency === 'KRW' ? '원' : '달러';
    case 'commodity':
    case 'crypto':    return q.currency === 'USD' ? '달러' : '';
    default:          return '';
  }
}

/** 차트에서 고를 수 있는 기간 */
export const RANGES = [
  { id: '5d',  label: '5일',  interval: '30m' },
  { id: '1mo', label: '1개월', interval: '1d' },
  { id: '3mo', label: '3개월', interval: '1d' },
  { id: '6mo', label: '6개월', interval: '1d' },
  { id: '1y',  label: '1년',  interval: '1d' },
  { id: '5y',  label: '5년',  interval: '1wk' },
];
