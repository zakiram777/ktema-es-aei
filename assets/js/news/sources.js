/* ═══════════════════════════════════════════════════════════════
   sources.js — 어디서 소식을 길어 오는가

   전부 각 언론사가 스스로 열어 둔 공개 RSS 다. 여기 적힌 주소만
   고치면 출처가 바뀐다. 새 곳을 더할 때는 아래 모양만 지키면 된다.

     id     안에서만 쓰는 이름표 (설정에 저장된다. 바꾸지 말 것)
     name   화면에 뜨는 이름
     url    RSS 주소
     lang   ko | en
     cats   이 출처가 채우는 갈래들
     weight 같은 기사가 여러 곳에서 왔을 때 누구 것을 남길지
   ═══════════════════════════════════════════════════════════════ */

export const CATEGORIES = [
  { id: 'all',    gr: 'Πάντα',    ko: '전체' },
  { id: 'stock',  gr: 'Μετοχαί',  ko: '증시' },
  { id: 'econ',   gr: 'Οἰκονομία',ko: '경제' },
  { id: 'invest', gr: 'Ἐπένδυσις',ko: '투자' },
  { id: 'world',  gr: 'Κόσμος',   ko: '해외' },
];

export const SOURCES = [
  /* ─────────── 한국어 ─────────── */
  {
    id: 'yna-econ', name: '연합뉴스', lang: 'ko', weight: 9,
    url: 'https://www.yna.co.kr/rss/economy.xml',
    cats: ['econ', 'stock'],
  },
  /* ── 연합인포맥스 ──
     채권·외환·해외주식을 따로 떼어 다루는 데가 드물다. 다른 경제지는
     그것을 '경제' 한 갈래에 뭉쳐 놓는데, 인포맥스는 그 셋이 각각
     제 섹션을 갖는다. 여기서 값진 것은 그 갈래다.

     ── 회원 자료가 아니다 ──
     이것은 인포맥스가 스스로 열어 둔 공개 RSS 다(robots.txt 도 /admin/
     만 막는다). 로그인 뒤의 단말 자료와는 다른 것이고, 그쪽은 이
     사이트에 들이지 않는다 — §9 에 적어 두었다. */
  {
    id: 'imx-bond', name: '연합인포맥스', lang: 'ko', weight: 9,
    url: 'https://news.einfomax.co.kr/rss/S1N16.xml',
    cats: ['econ', 'invest'],
  },
  {
    id: 'imx-stock', name: '연합인포맥스', lang: 'ko', weight: 9,
    url: 'https://news.einfomax.co.kr/rss/S1N2.xml',
    cats: ['stock', 'invest'],
  },
  {
    id: 'imx-world', name: '연합인포맥스', lang: 'ko', weight: 9,
    url: 'https://news.einfomax.co.kr/rss/S1N21.xml',
    cats: ['world', 'stock'],
  },
  {
    id: 'imx-policy', name: '연합인포맥스', lang: 'ko', weight: 8,
    url: 'https://news.einfomax.co.kr/rss/S1N15.xml',
    cats: ['econ'],
  },
  {
    id: 'imx-column', name: '연합인포맥스', lang: 'ko', weight: 8,
    url: 'https://news.einfomax.co.kr/rss/S1N9.xml',
    cats: ['invest', 'world'],
  },
  {
    id: 'imx-ib', name: '연합인포맥스', lang: 'ko', weight: 7,
    url: 'https://news.einfomax.co.kr/rss/S1N7.xml',
    cats: ['stock', 'invest'],
  },

  {
    id: 'hk-fin', name: '한국경제', lang: 'ko', weight: 8,
    url: 'https://www.hankyung.com/feed/finance',
    cats: ['stock', 'invest'],
  },
  {
    id: 'hk-econ', name: '한국경제', lang: 'ko', weight: 7,
    url: 'https://www.hankyung.com/feed/economy',
    cats: ['econ'],
  },
  {
    id: 'mk-stock', name: '매일경제', lang: 'ko', weight: 8,
    url: 'https://www.mk.co.kr/rss/50200011/',
    cats: ['stock', 'invest'],
  },
  {
    id: 'mk-econ', name: '매일경제', lang: 'ko', weight: 7,
    url: 'https://www.mk.co.kr/rss/30100041/',
    cats: ['econ'],
  },
  {
    id: 'edaily-stk', name: '이데일리', lang: 'ko', weight: 7,
    url: 'https://rss.edaily.co.kr/stock_news.xml',
    cats: ['stock', 'invest'],
  },
  {
    id: 'edaily-eco', name: '이데일리', lang: 'ko', weight: 6,
    url: 'https://rss.edaily.co.kr/economy_news.xml',
    cats: ['econ'],
  },
  {
    id: 'chosunbiz-stk', name: '조선비즈', lang: 'ko', weight: 6,
    url: 'https://biz.chosun.com/arc/outboundfeeds/rss/category/stock/?outputType=xml',
    cats: ['stock', 'invest'],
  },
  {
    id: 'donga-eco', name: '동아일보', lang: 'ko', weight: 5,
    url: 'https://rss.donga.com/economy.xml',
    cats: ['econ'],
  },
  {
    id: 'hani-eco', name: '한겨레', lang: 'ko', weight: 5,
    url: 'https://www.hani.co.kr/rss/economy/',
    cats: ['econ'],
  },

  /* ─────────── 영어 ─────────── */
  {
    id: 'yahoo-fin', name: 'Yahoo Finance', lang: 'en', weight: 8,
    url: 'https://finance.yahoo.com/news/rssindex',
    cats: ['world', 'invest', 'stock'],
  },
  {
    id: 'mw-pulse', name: 'MarketWatch', lang: 'en', weight: 8,
    url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse',
    cats: ['world', 'stock'],
  },
  {
    id: 'mw-top', name: 'MarketWatch', lang: 'en', weight: 7,
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    cats: ['world', 'invest'],
  },
  {
    id: 'wsj-mkt', name: 'WSJ Markets', lang: 'en', weight: 7,
    url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',
    cats: ['world', 'stock', 'invest'],
  },
  {
    id: 'ft-home', name: 'Financial Times', lang: 'en', weight: 6,
    url: 'https://www.ft.com/rss/home',
    cats: ['world', 'econ'],
  },
  {
    id: 'investing', name: 'Investing.com', lang: 'en', weight: 5,
    url: 'https://www.investing.com/rss/news_25.rss',
    cats: ['world', 'econ'],
  },
  {
    id: 'seekalpha', name: 'Seeking Alpha', lang: 'en', weight: 5,
    url: 'https://seekingalpha.com/market_currents.xml',
    cats: ['invest', 'world'],
  },
  {
    id: 'fed', name: 'Federal Reserve', lang: 'en', weight: 6,
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    cats: ['econ', 'world'],
  },
];

export const byId = (id) => SOURCES.find((s) => s.id === id);

/** 어떤 갈래에 어떤 출처가 필요한가 */
export function sourcesFor(cat, off = []) {
  return SOURCES.filter(
    (s) => !off.includes(s.id) && (cat === 'all' || s.cats.includes(cat)),
  );
}

/* ═══════════════════ 긴급함을 알아보는 눈 ═══════════════════

   기사 제목만 보고 "이건 지금 알려야 한다" 를 가른다.
   점수가 임계를 넘으면 유리아가 스스로 말한다.
   지나치게 자주 울리면 잔소리가 되므로 문턱을 높게 잡았다. */

const URGENT_KO = [
  [/\[?속보\]?/,            10],
  [/\[?긴급\]?/,             9],
  [/\[?단독\]?/,             4],
  [/서킷\s?브레이커|사이드카/, 10],
  [/거래\s?정지|매매\s?정지/,  7],
  [/폭락|급락|패닉/,          6],
  [/폭등|급등/,              5],
  [/사상\s?최(고|저)/,        5],
  [/장중\s?최(고|저)/,        4],
  [/금리\s?(인상|인하|동결)/,  5],
  [/기준금리/,               4],
  [/디폴트|파산|상장폐지/,     7],
  [/전쟁|침공|테러/,          6],
  [/환율.*(급등|급락)|원달러.*(돌파|붕괴)/, 5],
];

const URGENT_EN = [
  [/\bbreaking\b/i,          10],
  [/\balert\b/i,              6],
  [/\bhalt(ed|s)?\b/i,        7],
  [/\bcircuit breaker\b/i,   10],
  [/\bplunge|plummet|crash\b/i, 6],
  [/\bsurge|soar|spike\b/i,   5],
  [/\brecord (high|low)\b/i,  5],
  [/\brate (hike|cut|decision)\b/i, 5],
  [/\bfed\b.*\b(cuts?|raises?|holds?)\b/i, 6],
  [/\bdefault|bankrupt/i,     7],
  [/\bemergency\b/i,          6],
];

/**
 * 0 ~ 10 남짓의 점수. 7 이상이면 속보로 본다.
 */
export function urgency(item) {
  const t = `${item.title} ${item.summary || ''}`;
  const table = item.lang === 'en' ? URGENT_EN : URGENT_KO;
  let score = 0;
  for (const [re, w] of table) if (re.test(t)) score = Math.max(score, w);

  // 방금 나온 것일수록 무겁게 본다
  if (item.time) {
    const mins = (Date.now() - item.time) / 60000;
    if (mins > 90) score -= 3;
    else if (mins > 30) score -= 1;
  }
  return Math.max(0, score);
}

export const URGENT_AT = 7;

/** 제목 앞에 붙은 [속보] 같은 머리표를 떼어 따로 돌려준다 */
export function splitFlag(title) {
  const m = /^\s*[\[【]\s*([^\]】]{1,10})\s*[\]】]\s*/.exec(title || '');
  if (!m) return { flag: null, rest: title || '' };
  return { flag: m[1].trim(), rest: title.slice(m[0].length).trim() };
}
