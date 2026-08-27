/* ═══════════════════════════════════════════════════════════════
   clips.js — 유리아의 낯빛 표

   원본은 셋이다.
     ito1  전신 정지 초상 한 장
     ito2  전신이 움직이는 영상 하나
     ito3  4열 3행 격자 — 고요한 낯빛 열둘
     ito4  3열 4행 격자 — 격한 낯빛 열둘

   격자를 셀마다 잘라 스물넷으로 나누어 두었다. 한 장의 그림에서
   스물넷을 얻은 셈이라, 유리아가 나타날 때마다 다른 얼굴로 나타날
   수 있다. 셀마다 원본에서 뜬 자리(초)를 달리했으므로 같은 몸짓이
   겹쳐 보이지도 않는다.

   ── 왜 잘라 두었나 ──
   격자를 통째로 띄우면 열두 명이 한꺼번에 나온다. 유리아는 하나다.
   하나가 여러 얼굴을 가진 것과 여럿이 한 번에 나오는 것은 아주
   다른 이야기다.
   ═══════════════════════════════════════════════════════════════ */

const BASE = 'assets/media/yuria/';

/** 셀 하나의 생김새 — 어느 파일, 어떤 낯빛, 얼마나 큰가 */
function cell(kind, n, mood, note) {
  const id = kind + '-' + String(n).padStart(2, '0');
  return {
    id,
    kind,                              // 'calm' | 'wild'
    mood,                              // mood.js 가 고를 때 쓴다
    note,                              // 무엇을 하고 있는 그림인가
    src: BASE + id + '.mp4',
    poster: BASE + 'poster/' + id + '.jpg',
    w: kind === 'calm' ? 236 : 314,
    h: kind === 'calm' ? 314 : 236,
  };
}

/* ── 고요한 낯빛 열둘 (ito3) ──
   손으로 얼굴을 감싸거나, 웅크리거나, 먼 데를 보거나. 시장이
   조용할 때, 값이 천천히 흐를 때 이쪽에서 고른다. */
export const CALM = [
  cell('calm', 1, 'sorrow', '두 손으로 얼굴을 감싸고 눈을 감았다'),
  cell('calm', 2, 'sorrow', '한 손을 뺨에 대고 고개를 숙였다'),
  cell('calm', 3, 'serene', '멀리 서서 두 손을 모으고 있다'),
  cell('calm', 4, 'talk', '이쪽을 곧게 바라본다'),
  cell('calm', 5, 'sorrow', '두 손으로 얼굴을 받치고 눈을 감았다'),
  cell('calm', 6, 'serene', '옆으로 앉아 가슴에 손을 얹었다'),
  cell('calm', 7, 'sorrow', '무릎을 안고 앉아 고개를 묻었다'),
  cell('calm', 8, 'intense', '두 주먹을 턱 앞에 모으고 눈을 크게 떴다'),
  cell('calm', 9, 'serene', '눈을 감고 고개를 살짝 기울였다'),
  cell('calm', 10, 'grave', '고개를 숙이고 손을 가슴에 모았다'),
  cell('calm', 11, 'serene', '멀리 서서 이쪽을 본다'),
  cell('calm', 12, 'grave', '두 손으로 얼굴을 감싸고 이쪽을 본다'),
];

/* ── 격한 낯빛 열둘 (ito4) ──
   웃고, 비명을 지르고, 머리를 쥐어뜯는다. 속보가 오거나 값이
   크게 흔들릴 때만 쓴다. 자주 쓰면 무서운 것이 아니라 시끄러운
   것이 된다. */
export const WILD = [
  cell('wild', 1, 'elated', '주먹을 모으고 웃는다'),
  cell('wild', 2, 'sorrow', '두 손으로 얼굴을 받치고 운다'),
  cell('wild', 3, 'alert', '눈을 부릅뜨고 입을 벌렸다'),
  cell('wild', 4, 'intense', '머리를 움켜쥐고 이를 드러냈다'),
  cell('wild', 5, 'grave', '두 손에 얼굴을 완전히 묻었다'),
  cell('wild', 6, 'alert', '두 뺨을 감싸고 비명을 지른다'),
  cell('wild', 7, 'intense', '머리카락을 쥐어뜯는다'),
  cell('wild', 8, 'sorrow', '바닥에 옆으로 누웠다'),
  cell('wild', 9, 'grave', '제 팔을 끌어안고 웅크렸다'),
  cell('wild', 10, 'elated', '머리를 감싸고 크게 웃는다'),
  cell('wild', 11, 'sorrow', '고개를 숙이고 손을 모아 흐느낀다'),
  cell('wild', 12, 'intense', '머리를 쥐고 이쪽을 노려본다'),
];

export const ALL = [...CALM, ...WILD];

/** 전신 — 크게 나타날 때. 하루에 몇 번 없다. */
export const FULL = {
  id: 'full',
  kind: 'full',
  mood: 'serene',
  note: '검은 옷을 입고 온몸으로 서 있다',
  src: BASE + 'full.mp4',
  poster: BASE + 'poster/full.jpg',
  w: 468,
  h: 712,
};

/** 영상이 하나도 오지 않았을 때 남는 마지막 그림 */
export const STILL = BASE + 'still.jpg';

export const byId = (id) => (id === 'full' ? FULL : ALL.find((c) => c.id === id) || null);

/** 기분마다 결이 가까운 이웃들 — 먼 것부터 늘어놓지 않는다 */
const NEAR = {
  serene: ['talk', 'grave', 'sorrow'],
  talk: ['serene', 'grave', 'bright'],
  bright: ['elated', 'talk', 'serene'],
  elated: ['bright', 'talk', 'intense'],
  grave: ['sorrow', 'serene', 'intense'],
  sorrow: ['grave', 'serene', 'talk'],
  alert: ['intense', 'elated', 'grave'],
  intense: ['alert', 'grave', 'sorrow'],
};

/** 이만큼은 되어야 같은 얼굴이 잇달지 않는다 */
const ENOUGH = 4;

/**
 * 이 기분에 어울리는 낯빛들.
 *
 * 딱 맞는 것만 골라 주면 후보가 하나뿐인 기분이 생긴다 — 그러면
 * 유리아가 나타날 때마다 같은 얼굴이고, 그것은 사람이 아니라
 * 아이콘이다. 그래서 딱 맞는 것을 앞에 놓되, 넷이 될 때까지
 * 결이 가까운 쪽에서 채운다.
 */
export function forMood(mood, { wild = false } = {}) {
  const pool = wild ? WILD : CALM;
  const out = pool.filter((c) => c.mood === mood);

  for (const m of NEAR[mood] || []) {
    if (out.length >= ENOUGH) break;
    for (const c of pool) {
      if (c.mood === m && !out.includes(c)) out.push(c);
    }
  }

  // 그래도 모자라면 남은 것에서 아무거나 채운다
  for (const c of pool) {
    if (out.length >= ENOUGH) break;
    if (!out.includes(c)) out.push(c);
  }

  return out.length ? out : pool;
}

/** 미리 받아 둘 차례 — 자주 나올 것부터 */
export const WARM_ORDER = [
  'calm-04', 'calm-11', 'calm-09', 'calm-03',
  'wild-03', 'wild-06', 'calm-01', 'calm-12',
];
