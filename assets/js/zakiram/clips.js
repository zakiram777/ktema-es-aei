/* ═══════════════════════════════════════════════════════════════
   clips.js — 열세 편의 영상을 한 사람으로 묶는 표

   영상 열세 편은 모두 같은 여신을 담고 있다. 관(冠)과 해골 장식,
   왼쪽에 든 분노존의 가면, 검푸른 옷, 낡은 금빛 배경까지 같다.
   다른 것은 손의 자리와 얼굴빛뿐이다. 그래서 열셋을 하나로 묶을
   수 있다 — 어느 편을 틀어도 같은 사람이다.

   표의 단위는 '구간(span)' 이다. 한 구간은 4초에서 15초까지의
   긴 토막이고, 언제나 통째로 재생된다. 표정을 만들겠다고 1초짜리
   조각을 이어 붙이면 입이 튄다. 긴 토막을 통째로 틀고 토막과
   토막 사이만 겹쳐 넘기면, 입은 처음부터 끝까지 이어진다.

   tags 의 숫자는 그 기분에 이 구간이 얼마나 어울리는가다 (0~1).
   여러 기분에 걸쳐 있는 구간이 많은 것은 일부러 그렇게 둔 것이다.
   그래야 기분이 바뀌어도 고를 것이 남는다.

   ── 구간을 정한 근거 ──
   열세 편에서 0.83초 간격으로 열여덟 장씩 뽑아 눈으로 훑고,
   프레임 사이 움직임을 재어 자세가 크게 바뀌는 자리를 피해
   경계를 잡았다. 영상을 갈아 끼우면 여기 초만 고치면 된다.
   ═══════════════════════════════════════════════════════════════ */

export const CLIP_DIR = 'assets/media/zakiram';
export const CLIP_DUR = 15.04;

/** 기분 여덟 — 화면의 data-mood 와 같은 이름을 쓴다 */
export const MOODS = ['serene', 'talk', 'bright', 'elated', 'grave', 'sorrow', 'alert', 'intense'];

export const MOOD_KO = {
  serene:  '고요',
  talk:    '평온',
  bright:  '맑음',
  elated:  '환희',
  grave:   '무거움',
  sorrow:  '가라앉음',
  alert:   '곤두섬',
  intense: '팽팽함',
};

export const MOOD_GR = {
  serene:  'Γαλήνη',
  talk:    'Λόγος',
  bright:  'Φῶς',
  elated:  'Χαρά',
  grave:   'Βάρος',
  sorrow:  'Λύπη',
  alert:   'Ἔγερσις',
  intense: 'Ἔντασις',
};

/**
 * 구간 표.
 *   n     영상 번호 (01.mp4 …)
 *   from  시작 초
 *   to    끝 초
 *   tags  { 기분: 어울림 }
 *   note  왜 이 구간인가
 */
export const SPANS = [
  /* ── 1 · 가면을 옆에 두고 말한다. 입이 크게 열린다 ── */
  { n: 1, from: 0.5,  to: 7.4,  tags: { talk: 1,   intense: .5 },
    note: '또렷하게 말하는 자리. 입이 가장 크게 움직인다' },
  { n: 1, from: 7.6,  to: 14.8, tags: { talk: .9,  intense: .6, grave: .4 },
    note: '눈을 반쯤 내리고 이어 말한다' },

  /* ── 2 · 손을 들어 가면을 받치고 차분히 ── */
  { n: 2, from: 0.4,  to: 10.4, tags: { talk: 1,   serene: .6 },
    note: '가장 차분한 말투. 오래 들어도 편하다' },
  { n: 2, from: 10.8, to: 14.9, tags: { serene: 1, sorrow: .4 },
    note: '눈이 천천히 감긴다 — 쉼에 좋다' },

  /* ── 3 · 앞은 말하고, 뒤는 활짝 웃는다 ── */
  { n: 3, from: 0.4,  to: 6.6,  tags: { talk: 1,   bright: .5 },
    note: '가면 뒤에서 말한다' },
  { n: 3, from: 7.2,  to: 14.9, tags: { bright: 1, elated: .8, talk: .6 },
    note: '웃음이 번지며 끝까지 밝다' },

  /* ── 4 · 손을 든 채 생기 있게 ── */
  { n: 4, from: 0.4,  to: 7.6,  tags: { talk: 1,   bright: .7 },
    note: '밝은 낯으로 말한다' },
  { n: 4, from: 7.8,  to: 14.9, tags: { talk: .9,  bright: .6 },
    note: '같은 결로 이어진다' },

  /* ── 5 · 가장 조용한 편 ── */
  { n: 5, from: 0.4,  to: 7.4,  tags: { serene: 1, talk: .7 },
    note: '움직임이 가장 적다. 기다릴 때의 기본' },
  { n: 5, from: 7.6,  to: 14.9, tags: { serene: 1, talk: .6, sorrow: .3 },
    note: '내려앉은 눈' },

  /* ── 6 · 입을 크게 벌려 외친다 ── */
  { n: 6, from: 0.4,  to: 7.0,  tags: { alert: 1,  intense: .9 },
    note: '가장 격한 자리. 속보에 쓴다' },
  { n: 6, from: 7.2,  to: 14.9, tags: { alert: .8, intense: 1, talk: .5 },
    note: '기세를 유지한 채 말한다' },

  /* ── 7 · 가면을 내리고 정면으로 ── */
  { n: 7, from: 0.4,  to: 7.2,  tags: { talk: .9,  intense: 1, alert: .6 },
    note: '얼굴이 온전히 드러나 가장 또렷하다' },
  { n: 7, from: 7.4,  to: 14.9, tags: { grave: 1,  intense: .7, talk: .7 },
    note: '눈매가 굳는다' },

  /* ── 8 · 손을 들고 잔잔하게 ── */
  { n: 8, from: 0.4,  to: 7.0,  tags: { talk: 1,   serene: .6 },
    note: '고른 호흡으로 말한다' },
  { n: 8, from: 7.2,  to: 14.9, tags: { serene: 1, talk: .7 },
    note: '거의 멈춘 듯 잔잔하다' },

  /* ── 9 · 가면이 물러나고 정면을 본다 ── */
  { n: 9, from: 0.4,  to: 7.2,  tags: { talk: .9,  grave: .7 },
    note: '가면을 내리며 시선을 든다' },
  { n: 9, from: 7.4,  to: 14.9, tags: { grave: 1,  talk: .8, intense: .5 },
    note: '정면을 보고 가라앉은 낯으로' },

  /* ── 10 · 뒤로 갈수록 낯이 어두워진다 ── */
  { n: 10, from: 0.4, to: 7.0,  tags: { talk: .9,  grave: .6 },
    note: '평이하게 말한다' },
  { n: 10, from: 7.4, to: 14.9, tags: { grave: 1,  sorrow: .8 },
    note: '눈을 내리깔고 무겁게' },

  /* ── 11 · 크게 웃는 편 ── */
  { n: 11, from: 0.4, to: 6.8,  tags: { talk: .8,  bright: .9 },
    note: '웃음기를 머금고 말한다' },
  { n: 11, from: 7.4, to: 14.9, tags: { elated: 1, bright: .9 },
    note: '가장 환한 웃음. 크게 오른 날에' },

  /* ── 12 · 눈을 감는 편 ── */
  { n: 12, from: 0.4, to: 6.8,  tags: { talk: .8,  grave: .7 },
    note: '담담하게 말한다' },
  { n: 12, from: 7.4, to: 14.9, tags: { sorrow: 1, serene: .7, grave: .6 },
    note: '눈을 감고 가라앉는다. 깊게 내린 날에' },

  /* ── 13 · 가장 고요한 편 ── */
  { n: 13, from: 0.4, to: 7.4,  tags: { serene: 1, talk: .8 },
    note: '기다릴 때의 첫 자리' },
  { n: 13, from: 7.6, to: 14.9, tags: { serene: 1, talk: .7 },
    note: '이어지는 고요' },
];

/** 파일 주소 */
export const clipUrl = (n) => `${CLIP_DIR}/${String(n).padStart(2, '0')}.mp4`;
export const posterUrl = (n) => `${CLIP_DIR}/poster/${String(n).padStart(2, '0')}.jpg`;

/** 처음 켤 때의 자리 — 가장 조용한 구간 */
export const FIRST = SPANS.find((s) => s.n === 13 && s.from < 1);

/**
 * 한 기분에 어울리는 구간들을, 어울리는 순서로.
 * @param {string} mood
 * @param {number} floor  이만큼은 어울려야 뽑는다
 */
export function poolFor(mood, floor = 0.5) {
  const got = SPANS
    .map((s) => ({ span: s, fit: s.tags[mood] || 0 }))
    .filter((x) => x.fit >= floor)
    .sort((a, b) => b.fit - a.fit);
  // 그 기분에 맞는 것이 없으면 말하기 구간으로 돌아간다
  return got.length ? got : SPANS.filter((s) => s.tags.talk >= .8).map((s) => ({ span: s, fit: s.tags.talk }));
}

/**
 * 다음에 틀 구간 하나를 고른다.
 *
 * 어울림을 저울로 삼되 제비뽑기를 섞는다. 늘 1등만 틀면 같은
 * 토막이 되풀이되어 인형처럼 보인다. 방금 튼 것과 방금 튼 영상은
 * 뽑히지 않게 눌러 둔다.
 *
 * @param {string} mood
 * @param {object|null} avoid  방금 튼 구간
 */
export function chooseSpan(mood, avoid = null) {
  const pool = poolFor(mood);

  const weights = pool.map(({ span, fit }) => {
    let w = fit * fit;                       // 잘 맞는 쪽을 더 두껍게
    if (avoid) {
      if (span === avoid) w *= 0.02;         // 방금 그것은 거의 안 뽑는다
      else if (span.n === avoid.n) w *= 0.3; // 같은 영상도 덜 뽑는다
    }
    return Math.max(w, 0.001);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].span;
  }
  return pool[pool.length - 1].span;
}

/** 미리 받아 두면 좋은 영상 — 자주 쓰는 순서 */
export const WARM_ORDER = [13, 5, 8, 2, 7, 3, 11, 10, 12, 1, 4, 9, 6];
