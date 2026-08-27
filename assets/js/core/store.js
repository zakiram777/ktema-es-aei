/* ═══════════════════════════════════════════════════════════════
   store.js — 설정을 브라우저에 남긴다

   서버가 없다. 그러니 취향은 보는 사람의 브라우저에만 남는다.
   사생활 보호 창에서는 저장이 실패할 수 있으므로 전부 감싼다.
   ═══════════════════════════════════════════════════════════════ */

import { emit } from './bus.js';

const KEY = 'ktema.v1';

/** 처음 오는 사람이 보게 될 값 */
export const DEFAULTS = {
  /* ── 소식 ── */
  tab:          'all',
  autoRefresh:  true,
  refreshSec:   180,
  perSource:    12,
  sourcesOff:   [],      // 꺼 둔 출처 id

  /* ── 알림 ── */
  breaking:     true,    // 속보를 스스로 읽어 준다
  breakingMax:  3,       // 한 번에 최대 몇 개까지
  chime:        true,

  /* ── 시장 ── */
  symbol:       '^KS11',
  range:        '6mo',
  tint:         'kr',    // kr(오름 빨강) | global(오름 초록)
  watch:        null,    // null 이면 기본 목록

  /* ── 화면 ── */
  view:         'chart', // 마지막으로 보던 화면 (nav.js)

  /* ── 차트의 지표 ── 만든 것이 여기 남는다 (market/indicators.js) ── */
  indicators:   null,    // null 이면 기본값(MA20·MA60)

  /* ── 분석 ──
     무위험 이자율은 샤프·소르티노를 셈할 때 쓴다. 이 숫자에 소수점
     아래까지 매달릴 일은 없어서, 바깥에 묻지 않고 손으로 둔다. */
  riskFree:     3,       // 연 %
  anaMarket:    '^KS11', // 베타를 무엇에 대고 잴 것인가
  fxOn:         false,   // 차트를 원화로 환산해 볼지
  fxBase:       'KRW',   // 무엇으로 환산할지

  /* ── 바깥 열쇠 ──
     전부 공짜로 발급되지만 이 브라우저에만 남는다. 내보내지 않는다. */
  keyFred:      '',
  keyDart:      '',
  keyAlpha:     '',      // 야후가 막힌 날의 뒷길

  /* ── 전략 시험 ── */
  strategy:     null,    // null 이면 보기 전략(골든크로스)
  btSymbol:     '^KS11',
  btRange:      '5y',
  btTab:        'rules', // rules | mix | map
  mix:          null,    // 비중 갈래에 고른 것 (backtest/labview.js)

  /* ── 모습 ── */
  motion:       true,    // 배경 움직임
  seen:         false,   // 관문을 지난 적이 있나
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { /* 사생활 보호 창 — 이번 방문에만 남는다 */ }
}

export const get = (key) => (key === undefined ? { ...state } : state[key]);

export function set(key, value) {
  if (typeof key === 'object') {
    let changed = false;
    for (const [k, v] of Object.entries(key)) {
      if (state[k] === v) continue;
      state[k] = v; changed = true;
      emit('settings:changed', { key: k, value: v });
    }
    if (changed) save();
    return;
  }
  if (state[key] === value) return;
  state[key] = value;
  save();
  emit('settings:changed', { key, value });
}

export function reset() {
  state = { ...DEFAULTS };
  save();
  emit('settings:changed', { key: '*', value: null });
}

/* ── 읽은 것 · 본 것 ──
   목록이 새로 올 때 "못 보던 것"을 가려내려면 무엇을 봤는지 알아야 한다.
   글의 id 를 해시로만 들고 있고, 오래된 것은 버린다. */

const SEEN_KEY = 'ktema.seen.v1';
const SEEN_MAX = 900;

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
}
function saveSet(key, set) {
  try {
    const arr = [...set];
    localStorage.setItem(key, JSON.stringify(arr.slice(-SEEN_MAX)));
  } catch { /* 무시 */ }
}

let seen = loadSet(SEEN_KEY);
let read = loadSet('ktema.read.v1');

export const hasSeen = (id) => seen.has(id);
export function markSeen(ids) {
  for (const id of [].concat(ids)) seen.add(id);
  if (seen.size > SEEN_MAX) seen = new Set([...seen].slice(-SEEN_MAX));
  saveSet(SEEN_KEY, seen);
}

export const hasRead = (id) => read.has(id);
export function markRead(id) {
  read.add(id);
  if (read.size > SEEN_MAX) read = new Set([...read].slice(-SEEN_MAX));
  saveSet('ktema.read.v1', read);
}

/** 첫 방문인지 — 첫 방문이면 목록 전체를 "새 것"으로 보지 않는다 */
export const isFirstVisit = () => seen.size === 0;

/* ═══════════════════ 설정을 들고 다니기 ═══════════════════

   서버가 없으니 설정은 이 브라우저에만 남는다. 그래서 PC 를 옮기면
   고른 목소리도 말투도 처음으로 돌아간다. 파일 한 장으로 내보내고
   들여올 수 있게 해 두면 그 문제가 없어진다.

   읽은 기사 목록은 담지 않는다. 옮겨 봐야 쓸모가 없고 파일만 커진다. */

export const EXPORT_VERSION = 1;

/* 내보내지 않는 것들.

   ── 마지막으로 보던 화면 ──
   옮겨 봐야 쓸모가 없다. 새 기기에서는 그 기기의 첫 화면이 맞다.

   ── keyFred · keyDart ──
   공짜로 발급되는 열쇠지만 그래도 열쇠다. 이 파일은 settings.json 이라는
   이름으로 받아지고, README 는 그것을 폴더에 넣거나 웹호스팅에 올려도
   된다고 적어 두었다. 열쇠가 그 안에 있으면 올리는 순간 아무나 읽는다.
   옮길 때는 새 기기에서 다시 넣는 편이 옳다.

   ── chatKey* / chatUrl ──
   지금은 쓰이지 않는 이름이다. 그래도 자를 마름은 남겨 둔다. 예전에
   내보낸 settings.json 을 다시 들여올 수 있고, 그 안에 열쇠가 들어
   있다면 이 파일을 거쳐 다시 밖으로 나가서는 안 되기 때문이다. */
const NEVER_EXPORT = /^chatKey|^chatUrl$|^view$|^key[A-Z]/;

export function exportAll() {
  const settings = {};
  for (const [k, v] of Object.entries(state)) {
    if (NEVER_EXPORT.test(k)) continue;
    settings[k] = v;
  }
  return {
    app: 'ktema-es-aei',
    version: EXPORT_VERSION,
    savedAt: new Date().toISOString(),
    settings,
  };
}

/**
 * 들여온다. 모르는 항목은 버리고, 아는 것만 받는다.
 * @returns {{applied:number, skipped:string[]}}
 */
export function importAll(data) {
  if (!data || data.app !== 'ktema-es-aei') {
    throw new Error('Κτῆμα ἐς Ἀεί 의 설정 파일이 아닙니다');
  }
  if (typeof data.settings !== 'object' || !data.settings) {
    throw new Error('설정이 들어 있지 않습니다');
  }

  const known = Object.keys(DEFAULTS);
  const patch = {};
  const skipped = [];

  for (const [k, v] of Object.entries(data.settings)) {
    if (!known.includes(k)) { skipped.push(k); continue; }
    // 기본값과 종류가 다르면 받지 않는다 — 망가진 파일에 당하지 않게
    const want = typeof DEFAULTS[k];
    const got = typeof v;
    if (DEFAULTS[k] !== null && want !== got && !(Array.isArray(DEFAULTS[k]) && Array.isArray(v))) {
      skipped.push(k); continue;
    }
    patch[k] = v;
  }

  set(patch);
  return { applied: Object.keys(patch).length, skipped };
}
