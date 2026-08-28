/* ═══════════════════════════════════════════════════════════════
   sources.js — 누구의 말을 찾아다니나

   ── 이 화면이 하려는 일 ──
   "투자 격언" 을 파는 곳은 많다. 대개 출처도 날짜도 없이 떠도는 글귀
   모음이고, 그중 상당수는 그 사람이 한 적 없는 말이다. 워런 버핏이
   했다는 말의 절반쯤은 워런 버핏이 한 말이 아니다.

   그래서 여기서는 글귀 모음을 사 오지 않는다. 실제로 보도된 기사에서
   따옴표 안에 든 말을 꺼내 오고, 누가·어디서·언제를 반드시 함께
   적는다. 출처를 못 대는 말은 싣지 않는다.

   ── 어디서 긁나 ──
   구글 뉴스 검색 RSS 를 쓴다. 한 번 물으면 수백 매체가 한꺼번에
   걸리므로, 매체를 하나하나 등록하는 것보다 넓고 또 공평하다.
   여기에 중앙은행의 연설문 목록을 더한다 — 그쪽은 아예 공식 원문이라
   따옴표를 의심할 필요가 없다.

   ── 왜 사람 이름으로 찾나 ──
   '투자 격언' 으로 찾으면 격언 장사글이 걸린다. 사람 이름으로 찾으면
   그 사람이 이번 주에 실제로 한 말이 걸린다. 뒤엣것이 이 화면이 있는
   이유다.
   ═══════════════════════════════════════════════════════════════ */

/** 구글 뉴스 검색 한 줄 */
const gnews = (q, ko = false) =>
  'https://news.google.com/rss/search?q=' + encodeURIComponent(q)
  + (ko ? '&hl=ko&gl=KR&ceid=KR:ko' : '&hl=en-US&gl=US&ceid=US:en');

/* ═══════════════════ 사람 ═══════════════════

   ── 누구를 넣고 누구를 뺐나 ──
   넣은 이: 자기 돈을 굴리며 그 판단을 글이나 말로 남기는 사람, 그리고
   시장 전체가 그 입을 보는 자리에 있는 사람.

   뺀 이: 방송에 나와 종목을 찍어 주는 사람들. 그것은 격언이 아니라
   광고이고, 그런 것을 이 화면에 섞으면 나머지도 같은 것으로 읽힌다.

   찰리 멍거는 2023년에 세상을 떠났지만 남겨 두었다. 이 화면이 '오늘
   한 말' 만 모으는 곳은 아니고, 그의 말은 지금도 새로 인용되며 그
   인용에는 날짜와 출처가 있다. */
export const VOICES = [
  // ── 값을 보는 이들 ──
  { id: 'buffett', ko: '워런 버핏', en: 'Warren Buffett',
    role: '버크셔 해서웨이', tag: 'value' },
  { id: 'munger', ko: '찰리 멍거', en: 'Charlie Munger',
    role: '버크셔 해서웨이 (1924–2023)', tag: 'value' },
  { id: 'marks', ko: '하워드 막스', en: 'Howard Marks',
    role: '오크트리 캐피털', tag: 'value' },
  { id: 'klarman', ko: '세스 클라만', en: 'Seth Klarman',
    role: '바우포스트 그룹', tag: 'value' },
  { id: 'einhorn', ko: '데이비드 아인혼', en: 'David Einhorn',
    role: '그린라이트 캐피털', tag: 'value' },

  // ── 크게 보는 이들 ──
  { id: 'dalio', ko: '레이 달리오', en: 'Ray Dalio',
    role: '브리지워터', tag: 'macro' },
  { id: 'druckenmiller', ko: '스탠리 드러켄밀러', en: 'Stanley Druckenmiller',
    role: '듀케인 패밀리 오피스', tag: 'macro' },
  { id: 'elerian', ko: '모하메드 엘에리언', en: 'Mohamed El-Erian',
    role: '알리안츠 · 케임브리지 퀸스칼리지', tag: 'macro' },
  { id: 'summers', ko: '래리 서머스', en: 'Lawrence Summers',
    role: '전 미 재무장관', tag: 'macro' },

  // ── 크게 거는 이들 ──
  { id: 'ackman', ko: '빌 애크먼', en: 'Bill Ackman',
    role: '퍼싱스퀘어', tag: 'active' },
  { id: 'burry', ko: '마이클 버리', en: 'Michael Burry',
    role: '사이언 에셋', tag: 'active' },
  { id: 'wood', ko: '캐시 우드', en: 'Cathie Wood',
    role: '아크 인베스트', tag: 'active' },
  { id: 'griffin', ko: '켄 그리핀', en: 'Ken Griffin',
    role: '시타델', tag: 'active' },

  // ── 돈의 문을 쥔 이들 ──
  { id: 'dimon', ko: '제이미 다이먼', en: 'Jamie Dimon',
    role: 'JP모건', tag: 'bank' },
  { id: 'fink', ko: '래리 핑크', en: 'Larry Fink',
    role: '블랙록', tag: 'bank' },
  { id: 'solomon', ko: '데이비드 솔로몬', en: 'David Solomon',
    role: '골드만삭스', tag: 'bank' },

  // ── 금리를 정하는 이들 ──
  { id: 'powell', ko: '제롬 파월', en: 'Jerome Powell',
    role: '미 연방준비제도 의장', tag: 'central' },
  { id: 'lagarde', ko: '크리스틴 라가르드', en: 'Christine Lagarde',
    role: '유럽중앙은행 총재', tag: 'central' },

  // ── 국내 ──
  { id: 'leechangyong', ko: '이창용', en: null,
    role: '한국은행 총재', tag: 'korea', q: '이창용 한국은행 총재' },
  { id: 'parkhyeonju', ko: '박현주', en: null,
    role: '미래에셋 회장', tag: 'korea', q: '박현주 미래에셋 회장' },
  { id: 'johnlee', ko: '존 리', en: null,
    role: '전 메리츠자산운용 대표', tag: 'korea', q: '"존 리" 투자' },
  { id: 'kangbangcheon', ko: '강방천', en: null,
    role: '에셋플러스 창업자', tag: 'korea', q: '강방천 투자' },
];

export const TAGS = {
  value: { ko: '값을 본다', gr: 'Ἀξία' },
  macro: { ko: '크게 본다', gr: 'Κόσμος' },
  active: { ko: '크게 건다', gr: 'Τόλμη' },
  bank: { ko: '돈의 문', gr: 'Τράπεζα' },
  central: { ko: '금리를 정한다', gr: 'Ἀρχή' },
  korea: { ko: '국내', gr: 'Κορέα' },
};

export const voiceById = (id) => VOICES.find((v) => v.id === id);

/* ═══════════════════ 묶어서 묻기 ═══════════════════

   ── 왜 한 사람씩 묻지 않나 ──
   처음에는 스물몇 사람을 각각 물었다. 그랬더니 공개 프록시가 스물몇
   번을 한꺼번에 두들겨 맞고 문을 닫았다. 오늘 몫이 통째로 0건이 되었다.

   남의 호의로 도는 프록시다. 우리가 조심하지 않으면 다음 사람이 못
   쓴다. 그리고 실제로 한 번에 물어도 결과는 나쁘지 않다 — 다섯 이름을
   OR 로 묶어 한 번 물으면 백 건이 오고 그중 아흔일곱 건에 따옴표가
   있었다.

   ── 왜 따옴표로 묶나 ──
   묶지 않으면 'Warren' 과 'Buffett' 이 따로 걸린다. 묶으면 그 이름이
   통째로 든 기사만 온다.

   ── 왜 다섯씩인가 ──
   구글 뉴스가 한 번에 백 건까지 준다. 다섯이면 한 사람당 스무 건쯤
   돌아가고, 열이면 열 건으로 줄어 목소리가 묻힌다. */

const GROUP = 5;

export function groups() {
  const out = [];
  const kr = VOICES.filter((v) => v.q);
  const en = VOICES.filter((v) => !v.q);

  for (let i = 0; i < en.length; i += GROUP) {
    const mine = en.slice(i, i + GROUP);
    out.push({
      voices: mine,
      url: gnews(mine.map((v) => `"${v.en || v.ko}"`).join(' OR '), false),
    });
  }
  for (let i = 0; i < kr.length; i += GROUP) {
    const mine = kr.slice(i, i + GROUP);
    out.push({
      voices: mine,
      url: gnews(mine.map((v) => v.q).join(' OR '), true),
    });
  }
  return out;
}

/* ═══════════════════ 원문 ═══════════════════

   기사를 거치지 않고 그 사람이 쓴 것이 그대로 오는 자리. 여기서 온
   것은 따옴표를 의심할 필요가 없어 더 무겁게 다룬다. */
export const PAPERS = [
  {
    id: 'fed-speech',
    name: '미 연준 — 연설문',
    ko: '연준 이사들이 실제로 한 연설. 시장이 이 문장 하나에 움직인다.',
    url: 'https://www.federalreserve.gov/feeds/speeches.xml',
    origin: true,
  },
  {
    id: 'fed-testimony',
    name: '미 연준 — 의회 증언',
    ko: '의장이 의회에서 답한 것. 준비된 원고보다 솔직할 때가 있다.',
    url: 'https://www.federalreserve.gov/feeds/testimony.xml',
    origin: true,
  },
  {
    id: 'ecb',
    name: '유럽중앙은행',
    ko: '유로 지역의 금리를 정하는 이들의 연설과 회견.',
    url: 'https://www.ecb.europa.eu/rss/press.html',
    origin: true,
  },
  {
    id: 'bok',
    name: '한국은행',
    ko: '국내 금리를 정하는 곳의 발표.',
    url: 'https://www.bok.or.kr/portal/bbs/P0000559/rss.do?menuNo=200690',
    origin: true,
  },
];
