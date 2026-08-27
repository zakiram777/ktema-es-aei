/* ═══════════════════════════════════════════════════════════════
   analysis.js — 봉 하나 묶음에서 뽑아내는 것들

   차트는 "어떻게 생겼나" 를 보여 준다. 여기서 뽑는 것은 "얼마나" 다.
   눈으로는 두 그림 중 어느 쪽이 더 흔들렸는지 잘 모른다. 숫자로
   놓으면 안다.

   ── 무엇을 셈하고 무엇을 셈하지 않나 ──
   셈하는 것은 지나간 값에서 곧바로 나오는 것뿐이다. 수익률, 흔들린
   정도, 꼭대기에서 내려온 깊이, 한 해 폭 안의 자리, 두 값이 같이
   움직이는 정도.

   셈하지 않는 것: 앞으로 어떻게 될지. 그것을 셈해 주는 척하는 숫자는
   없다. 여기 있는 것은 전부 뒤를 보는 숫자다.

   ── 왜 로그수익률인가 ──
   흔들린 정도를 잴 때는 (오늘/어제 − 1) 대신 ln(오늘/어제) 를 쓴다.
   더하면 그대로 구간 수익률이 되기 때문이다. 백분율 수익률은 더해도
   맞지 않는다 — +50% 뒤 −50% 는 0이 아니라 −25% 다.

   ── 왜 √252 인가 ──
   하루치 표준편차를 한 해 것으로 늘릴 때 쓴다. 한 해에 장이 서는
   날이 대략 252일이고, 흔들림은 시간의 제곱근에 비례해 커진다.
   주봉이면 52, 30분봉이면 그 시간 눈금에 맞는 수를 쓴다.
   ═══════════════════════════════════════════════════════════════ */

import { pct } from '../core/fmt.js';

/** 한 해에 몇 개의 봉이 서는가 — 흔들림을 한 해 것으로 늘릴 때 쓴다 */
export const PER_YEAR = { '30m': 252 * 13, '1d': 252, '1wk': 52, '1mo': 12 };

/* ─────────────── 밑감 ─────────────── */

/** 로그수익률 — 더할 수 있는 수익률 */
export function logReturns(bars) {
  const out = [];
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].c, b = bars[i].c;
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

export function mean(xs) {
  if (!xs.length) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** 표본표준편차 (n−1) — 가진 것이 전부가 아니라 표본이므로 */
export function stdev(xs) {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (n - 1));
}

/* ─────────────── 뽑는 것들 ─────────────── */

/**
 * 구간 수익률 — 처음 값에서 끝 값까지 몇 퍼센트.
 * n 을 주면 마지막 n 개만 본다.
 */
export function ret(bars, n) {
  const arr = n ? bars.slice(-n - 1) : bars;
  if (arr.length < 2) return null;
  const a = arr[0].c, b = arr.at(-1).c;
  if (!(a > 0)) return null;
  return (b / a - 1) * 100;
}

/**
 * 한 해로 늘린 흔들림 (연율 변동성).
 * 20% 라면 "한 해 뒤 값이 대략 ±20% 안에 있을 만하다" 는 뜻이다 —
 * 그 안에 있으리라는 보장이 아니라, 지금까지 그 정도로 흔들렸다는 뜻.
 */
export function vol(bars, interval = '1d', n) {
  const arr = n ? bars.slice(-n - 1) : bars;
  const rs = logReturns(arr);
  if (rs.length < 5) return null;
  const s = stdev(rs);
  if (!Number.isFinite(s)) return null;
  return s * Math.sqrt(PER_YEAR[interval] || 252) * 100;
}

/**
 * 가장 깊이 판 자리 (MDD).
 *
 * 꼭대기를 새로 칠 때마다 그 자리를 기억해 두고, 거기서 얼마나
 * 내려왔는지를 잰다. 그중 가장 깊었던 것.
 *
 * 수익률보다 이쪽이 사람에게는 더 중요하다. 다섯 해에 두 배가 되는
 * 길이라도 도중에 반토막이 났다면, 대개는 그 자리에서 손을 떼기
 * 때문이다. 견딜 수 없는 길은 좋은 길이 아니다.
 */
export function drawdown(bars) {
  let peak = -Infinity, peakAt = null;
  let worst = 0, from = null, to = null;

  for (const b of bars) {
    if (b.c > peak) { peak = b.c; peakAt = b.t; }
    const dd = peak > 0 ? (b.c / peak - 1) * 100 : 0;
    if (dd < worst) { worst = dd; from = peakAt; to = b.t; }
  }

  // 지금 이 순간 꼭대기에서 얼마나 내려와 있나
  const last = bars.at(-1)?.c;
  const now = peak > 0 && last ? (last / peak - 1) * 100 : null;

  return { mdd: worst, from, to, now, peak };
}

/**
 * 한 해 폭 안에서 지금 어디쯤인가 — 0이면 바닥, 100이면 꼭대기.
 * 값 자체보다 이쪽이 견주기 쉽다. 코스피 3천과 애플 230은 못 견주지만
 * "폭의 92% 자리" 와 "31% 자리" 는 견줄 수 있다.
 */
export function position(bars, hi, lo) {
  const last = bars.at(-1)?.c;
  const H = Number.isFinite(hi) ? hi : Math.max(...bars.map((b) => b.h));
  const L = Number.isFinite(lo) ? lo : Math.min(...bars.map((b) => b.l));
  if (!Number.isFinite(last) || !(H > L)) return null;
  return ((last - L) / (H - L)) * 100;
}

/**
 * 두 값이 같이 움직이는 정도 (−1 … +1).
 *
 * +1 이면 늘 같은 쪽으로, −1 이면 늘 반대쪽으로, 0이면 상관없이.
 * 열 가지를 지켜본다면서 열 가지가 다 +0.9 로 붙어 있다면, 사실은
 * 한 가지를 열 번 들고 있는 것이다.
 *
 * 날짜를 맞춰 짝지어 셈한다. 서울과 뉴욕은 장이 서는 날이 다르므로
 * 그냥 늘어놓고 견주면 하루씩 밀린 채로 셈하게 된다.
 */
export function correlation(barsA, barsB) {
  const map = new Map();
  for (const b of barsA) map.set(dayKey(b.t), b.c);

  const xs = [], ys = [];
  let prevA = null, prevB = null;
  for (const b of barsB) {
    const a = map.get(dayKey(b.t));
    if (a == null) continue;
    if (prevA != null && prevA > 0 && prevB > 0) {
      xs.push(Math.log(a / prevA));
      ys.push(Math.log(b.c / prevB));
    }
    prevA = a; prevB = b.c;
  }

  if (xs.length < 10) return null;

  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (!(dx > 0 && dy > 0)) return null;
  return num / Math.sqrt(dx * dy);
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * 한 종목에 대해 알아야 할 것을 한 번에.
 * @param {object} q  quotes.fetchOne 이 준 것
 * @param {string} interval
 */
export function profile(q, interval = '1d') {
  const bars = q?.bars || [];
  if (bars.length < 3) return null;

  const dd = drawdown(bars);
  const rs = logReturns(bars);
  const up = rs.filter((r) => r > 0).length;

  return {
    symbol: q.symbol,
    ko: q.ko || q.name || q.symbol,
    name: q.name,
    price: Number.isFinite(q.price) ? q.price : bars.at(-1).c,
    bars,

    // 얼마나 올랐나 — 눈금이 하루일 때의 개수다
    r1w:  ret(bars, 5),
    r1m:  ret(bars, 21),
    r3m:  ret(bars, 63),
    r6m:  ret(bars, 126),
    r1y:  ret(bars, 252),
    rAll: ret(bars),

    // 얼마나 흔들리나 — 최근 것과 한 해 것을 나란히 둔다.
    // 최근이 한 해보다 훨씬 크면 지금 무슨 일이 벌어지는 중이다.
    vol1m: vol(bars, interval, 21),
    vol1y: vol(bars, interval, 252),

    mdd: dd.mdd,
    ddNow: dd.now,
    pos: position(bars, q.yearHigh, q.yearLow),
    upRatio: rs.length ? (up / rs.length) * 100 : null,

    yearHigh: q.yearHigh,
    yearLow: q.yearLow,
  };
}

/**
 * 숫자를 사람의 말로 한 줄.
 *
 * 판단이 아니라 서술이다. "사야 한다" 는 말은 여기서 나오지 않는다 —
 * 지나간 값만 보고 앞을 말하는 것은 거짓말이기 때문이다.
 */
export function describe(p) {
  if (!p) return '';
  const bits = [];

  if (Number.isFinite(p.r3m)) {
    bits.push(`석 달 ${pct(p.r3m, 1)}`);
  }
  if (Number.isFinite(p.pos)) {
    const where = p.pos > 85 ? '한 해 폭의 꼭대기 쪽'
      : p.pos < 15 ? '한 해 폭의 바닥 쪽'
      : `한 해 폭의 ${Math.round(p.pos)}% 자리`;
    bits.push(where);
  }
  if (Number.isFinite(p.vol1m) && Number.isFinite(p.vol1y)) {
    const r = p.vol1m / p.vol1y;
    bits.push(r > 1.4 ? '요즘 부쩍 흔들린다'
      : r < 0.65 ? '요즘은 잠잠하다'
      : `흔들림 ${p.vol1y.toFixed(0)}%`);
  }
  if (Number.isFinite(p.ddNow) && p.ddNow < -12) {
    bits.push(`꼭대기에서 ${Math.abs(p.ddNow).toFixed(0)}% 아래`);
  }

  return bits.join(' · ');
}
