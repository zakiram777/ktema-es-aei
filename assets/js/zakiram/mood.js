/* ═══════════════════════════════════════════════════════════════
   mood.js — 시장을 보고 낯빛을 정한다

   지수가 얼마나 움직였는가(폭)만 보지 않는다. 몇 개가 같은 쪽으로
   갔는가(너비)와, 서로 얼마나 엇갈리는가(흔들림)를 함께 본다.
   하나만 크게 오르고 나머지가 내렸다면 그것은 밝은 날이 아니다.

   나온 낯빛은 자키람의 영상 구간과 후광 색으로만 쓰인다.
   무엇을 사라 팔라로는 절대 넘어가지 않는다.
   ═══════════════════════════════════════════════════════════════ */

import { emit } from '../core/bus.js';

let current = 'serene';
let score = 0;
/** 속보가 왔을 때 잠깐 곤두선다. 그 시각. */
let alertUntil = 0;

export const mood = () => current;
export const moodScore = () => score;

/**
 * 시세를 받아 낯빛을 다시 정한다.
 * @param {Array} quotes
 */
/**
 * 낯빛을 셈할 때 볼 것과 보지 않을 것.
 *
 * 금·유가·비트코인·환율은 주식시장의 기분과 다른 박자로 움직인다.
 * 변동성 지수(VIX)는 아예 반대로 간다. 이것들을 섞으면 조용한 날에도
 * 흩어짐이 커져 늘 '팽팽함' 으로 읽힌다. 그래서 지수와 종목만 본다.
 */
const COUNTS = new Set(['index', 'stock']);
const IGNORE = new Set(['^VIX']);

export function read(quotes) {
  const live = (quotes || []).filter(
    (q) => Number.isFinite(q.changePct) && COUNTS.has(q.kind) && !IGNORE.has(q.symbol),
  );
  if (!live.length) return current;

  // ── 폭 ── 지수에 더 무게를 준다. 개별 종목 하나가 판을 흔들면 안 된다
  let wsum = 0, w = 0;
  for (const q of live) {
    const weight = q.kind === 'index' ? 3 : 1;
    wsum += q.changePct * weight;
    w += weight;
  }
  const avg = wsum / w;

  // ── 너비 ── 몇이 오르고 몇이 내렸나
  const ups = live.filter((q) => q.changePct > 0.05).length;
  const downs = live.filter((q) => q.changePct < -0.05).length;
  const breadth = (ups - downs) / live.length;      // -1 … 1

  // ── 흔들림 ── 서로 얼마나 엇갈리나
  const mean = live.reduce((a, q) => a + q.changePct, 0) / live.length;
  const variance = live.reduce((a, q) => a + (q.changePct - mean) ** 2, 0) / live.length;
  const spread = Math.sqrt(variance);

  score = avg;

  const next = decide({ avg, breadth, spread });
  if (next !== current) {
    current = next;
    emit('mood:changed', { mood: current, score });
  }
  return current;
}

function decide({ avg, breadth, spread }) {
  // 속보가 방금 왔으면 그것이 먼저다
  if (Date.now() < alertUntil) return 'alert';

  // 크게 엇갈리면 방향보다 흔들림이 먼저 보인다
  if (spread > 1.6 && Math.abs(breadth) < 0.4) return 'intense';

  if (avg >= 1.3 && breadth >= 0.6) return 'elated';
  if (avg >= 0.4) return 'bright';

  if (avg <= -1.3 && breadth <= -0.6) return 'sorrow';
  if (avg <= -0.4) return 'grave';

  if (spread > 1.2) return 'intense';
  if (Math.abs(avg) < 0.18 && spread < 0.5) return 'serene';

  return 'talk';
}

/**
 * 속보가 왔다 — 잠시 곤두선다.
 * @param {number} ms 얼마나 오래
 */
export function startle(ms = 26_000) {
  alertUntil = Date.now() + ms;
  if (current !== 'alert') {
    current = 'alert';
    emit('mood:changed', { mood: current, score });
  }
}

/** 곤두선 것이 풀렸는지 확인하고, 풀렸으면 원래 낯으로 */
export function settle(quotes) {
  if (Date.now() < alertUntil) return current;
  if (current !== 'alert') return current;
  alertUntil = 0;
  return read(quotes);
}

/**
 * 말할 때 쓸 낯빛.
 * 고요·가라앉음은 입이 거의 움직이지 않는 구간이 많다. 읽는 동안에는
 * 같은 결이면서 입이 살아 있는 쪽으로 한 칸 옮겨 준다.
 */
export function speakingMood(m = current) {
  return ({
    serene:  'talk',
    sorrow:  'grave',
    elated:  'bright',
  })[m] || m;
}
