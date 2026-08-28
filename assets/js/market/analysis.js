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
 *
 * 여기서 셈하는 것은 봉만 있으면 나오는 것들이다. 베타처럼 다른
 * 것과 견주어야 나오는 값은 market 을 함께 줄 때만 붙는다 — 안 주면
 * 그 자리는 그냥 비고, 나머지는 그대로 나온다.
 *
 * @param {object} q  quotes 가 준 것
 * @param {{interval?:string, rf?:number, market?:Array}} opts
 */
export function profile(q, opts = {}) {
  // 예전에는 둘째 인자가 interval 문자열이었다. 그렇게 부르는 자리가
  // 아직 남아 있을 수 있으니 둘 다 받아 준다.
  const o = typeof opts === 'string' ? { interval: opts } : (opts || {});
  const interval = o.interval || '1d';
  const rf = Number.isFinite(o.rf) ? o.rf : 3;

  const bars = q?.bars || [];
  if (bars.length < 3) return null;

  const dd = drawdown(bars);
  const rs = logReturns(bars);
  const up = rs.filter((r) => r > 0).length;
  const uw = underwater(bars);
  const ba = o.market && o.market !== bars ? betaAlpha(o.market, bars, interval) : null;
  const roll = rolling(bars, 252);

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

    // 얼마나 잘 벌었나 — 많이 번 것과는 다른 물음이다
    cagr:    cagr(bars),
    sharpe:  sharpe(bars, interval, rf),
    sortino: sortino(bars, interval, rf),
    calmar:  calmar(bars),

    // 얼마나 오래 물려 있었나. 깊이보다 이쪽이 사람을 내쫓는다.
    uwDays:  uw.worstDays,
    uwNow:   uw.stillUnder,

    // 기준지수 대비 — market 을 줄 때만
    beta:  ba ? ba.beta : null,
    alpha: ba ? ba.alpha : null,
    r2:    ba ? ba.r2 : null,

    // 아무 날에나 들어갔다면 1년 뒤
    roll1yWorst:  roll ? roll.worst : null,
    roll1yMedian: roll ? roll.median : null,
    roll1yBest:   roll ? roll.best : null,
    roll1yNeg:    roll ? roll.negative : null,

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
    const how = p.uwDays > 200 ? `${Math.round(p.uwDays / 21)}달째 ` : '';
    bits.push(`${how}꼭대기에서 ${Math.abs(p.ddNow).toFixed(0)}% 아래`);
  }
  if (Number.isFinite(p.sharpe)) {
    bits.push(p.sharpe > 1 ? '위험 대비 잘 벌었다'
      : p.sharpe < 0 ? '위험을 지고 잃었다'
      : `샤프 ${p.sharpe.toFixed(2)}`);
  }

  return bits.join(' · ');
}

/* ═══════════════════════════════════════════════════════════════
   여기서부터는 나중에 얹은 것들이다.

   위쪽이 "얼마나 올랐고 얼마나 흔들렸나" 라면, 아래쪽은 그 둘을 나눈
   값과 시간에 따라 변하는 모습이다. 값 하나로 줄인 숫자는 견주기
   쉽지만 무엇을 잃었는지 안 보이고, 시간에 따라 편 그림은 무엇을
   잃었는지는 보이지만 견주기 어렵다. 둘 다 필요하다.
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────── 하방편차 ───────────────

   표준편차는 위로 튄 것과 아래로 튄 것을 똑같이 위험으로 센다.
   그런데 사람은 위로 튀는 것을 위험이라고 느끼지 않는다. 아래로
   벗어난 것만 세는 것이 하방편차이고, 그 편이 사람의 느낌에 가깝다.

   나눌 때 아래로 벗어난 날의 수가 아니라 전체 날수로 나눈다. 그래야
   "아래로 잘 안 가는 것" 이 상을 받는다. */
export function downside(rs, mar = 0) {
  if (rs.length < 2) return NaN;
  let s = 0;
  for (const r of rs) { const d = Math.min(0, r - mar); s += d * d; }
  return Math.sqrt(s / (rs.length - 1));
}

/* ─────────────── 위험 대비 수익 ───────────────

   셋 다 "수익 나누기 위험" 인데 위험을 무엇으로 보느냐가 다르다.

     Sharpe   흔들림 전부
     Sortino  아래로 흔들린 것만
     Calmar   가장 깊이 팠던 자리

   Calmar 가 가장 정직할 때가 많다. 표준편차는 매일 조금씩 흔들린
   것과 한 번 크게 무너진 것을 비슷하게 보는데, 사람을 시장에서
   내쫓는 것은 언제나 뒤엣것이기 때문이다.

   무위험 이자율은 밖에서 받는다. FRED 를 잇지 않아도 되게 설정값
   하나로 두었다 — 이 숫자에 소수점 아래까지 매달릴 일은 없다. */

/** 연평균 성장률 — 봉의 처음과 끝, 그리고 걸린 햇수로 */
export function cagr(bars) {
  if (!bars || bars.length < 2) return null;
  const a = bars[0].c, b = bars.at(-1).c;
  const years = (bars.at(-1).t - bars[0].t) / (365.25 * 86_400_000);
  if (!(a > 0) || !(b > 0) || years < 1 / 52) return null;
  return (Math.pow(b / a, 1 / years) - 1) * 100;
}

export function sharpe(bars, interval = '1d', rf = 3) {
  const rs = logReturns(bars);
  if (rs.length < 20) return null;
  const per = PER_YEAR[interval] || 252;
  const s = stdev(rs) * Math.sqrt(per);
  if (!(s > 0)) return null;
  return (mean(rs) * per - Math.log(1 + rf / 100)) / s;
}

export function sortino(bars, interval = '1d', rf = 3) {
  const rs = logReturns(bars);
  if (rs.length < 20) return null;
  const per = PER_YEAR[interval] || 252;
  const d = downside(rs, Math.log(1 + rf / 100) / per) * Math.sqrt(per);
  if (!(d > 0)) return null;
  return (mean(rs) * per - Math.log(1 + rf / 100)) / d;
}

export function calmar(bars) {
  const g = cagr(bars);
  const { mdd } = drawdown(bars);
  if (g == null || !(Math.abs(mdd) > 0.5)) return null;
  return g / Math.abs(mdd);
}

/* ─────────────── 베타와 알파 ───────────────

   상관은 방향만 말한다. 상관 0.8 짜리 둘 중 하나는 지수와 나란히
   가고 다른 하나는 두 배로 뛸 수 있는데, 상관만 보면 둘이 같아
   보인다. 크기를 말하는 것이 베타다.

   베타 1.4 는 "지수가 1% 오를 때 이것은 1.4% 오르는 경향" 이다.
   경향일 뿐이고, 그 경향이 얼마나 믿을 만한지는 결정계수가 말한다.
   결정계수가 0.2 인 베타 1.4 는 사실상 아무 말도 안 한 것이다.

   알파는 베타로 설명되지 않고 남은 몫이다. 연율로 돌려준다. */

/** 날짜를 맞춰 짝지은 수익률 쌍 — correlation 과 같은 셈법이다 */
function pairs(barsA, barsB) {
  const map = new Map();
  for (const b of barsA) map.set(dayKey(b.t), b.c);

  const xs = [], ys = [];
  let prevA = null, prevB = null;
  for (const b of barsB) {
    const a = map.get(dayKey(b.t));
    if (a == null) { prevA = null; prevB = null; continue; }
    if (prevA != null && prevA > 0 && prevB > 0) {
      xs.push(Math.log(a / prevA));
      ys.push(Math.log(b.c / prevB));
    }
    prevA = a; prevB = b.c;
  }
  return { xs, ys };
}

/**
 * @param {Array} barsMkt 기준이 되는 것 (지수)
 * @param {Array} barsOne 재는 것
 * @returns {{beta, alpha, r2, n}|null} alpha 는 연율 백분율
 */
export function betaAlpha(barsMkt, barsOne, interval = '1d') {
  const { xs, ys } = pairs(barsMkt, barsOne);
  if (xs.length < 20) return null;

  const mx = mean(xs), my = mean(ys);
  let cov = 0, varx = 0, vary = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    cov += a * b; varx += a * a; vary += b * b;
  }
  if (!(varx > 0)) return null;

  const beta = cov / varx;
  const per = PER_YEAR[interval] || 252;
  return {
    beta,
    alpha: (my - beta * mx) * per * 100,
    r2: vary > 0 ? (cov * cov) / (varx * vary) : 0,
    n: xs.length,
  };
}

/* ─────────────── 물에 잠긴 그림 ───────────────

   꼭대기를 새로 칠 때마다 0으로 돌아가고, 그 아래로만 자란다.

   최대 낙폭은 숫자 하나라 깊이만 말한다. 이 줄은 길이까지 말한다.
   38% 가 한 달이었는지 열한 달이었는지는 견디는 사람에게 전혀 다른
   이야기인데, 숫자 하나로는 그 차이가 사라진다. */
export function underwater(bars) {
  const out = new Array(bars.length).fill(0);
  let peak = -Infinity, peakAt = 0;
  let worstDays = 0, worstFrom = null, worstTo = null;

  for (let i = 0; i < bars.length; i++) {
    const c = bars[i].c;
    if (c >= peak) {
      // 꼭대기를 되찾았다 — 방금 끝난 구간이 가장 길었나
      if (peak > -Infinity && i - peakAt > worstDays) {
        worstDays = i - peakAt;
        worstFrom = bars[peakAt].t;
        worstTo = bars[i].t;
      }
      peak = c; peakAt = i;
      out[i] = 0;
    } else {
      out[i] = (c / peak - 1) * 100;
    }
  }

  // 아직 물속이면 그 구간도 후보다
  const tail = bars.length - 1 - peakAt;
  const stillUnder = out[out.length - 1] < 0;
  if (stillUnder && tail > worstDays) {
    worstDays = tail;
    worstFrom = bars[peakAt].t;
    worstTo = null;                       // 아직 안 끝났다
  }

  return { values: out, worstDays, worstFrom, worstTo, stillUnder };
}

/* ─────────────── 롤링 ───────────────

   한 시점의 1년 수익률은 그 시점 이야기다. 롤링은 아무 날에나 들어간
   사람의 이야기고, 그게 실제로 나에게 벌어지는 일에 가깝다.

   최악의 1년이 마이너스 40% 인 것과 12% 인 것은 연평균이 같아도 다른
   물건이다. 그 차이는 평균에서는 안 보이고 여기서만 보인다. */
export function rolling(bars, window) {
  if (!bars || bars.length <= window + 1) return null;
  const out = [];
  for (let i = window; i < bars.length; i++) {
    const a = bars[i - window].c, b = bars[i].c;
    if (a > 0) out.push({ t: bars[i].t, v: (b / a - 1) * 100 });
  }
  if (out.length < 3) return null;

  const vs = out.map((x) => x.v).sort((a, b) => a - b);
  const q = (p) => vs[Math.min(vs.length - 1, Math.max(0, Math.round((vs.length - 1) * p)))];

  return {
    series: out,
    worst: vs[0],
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    best: vs[vs.length - 1],
    negative: (vs.filter((v) => v < 0).length / vs.length) * 100,
    n: vs.length,
  };
}

/* ─────────────── 달력 ───────────────

   세로에 연도, 가로에 열두 달. 계절성이 있으면 세로줄로 보이고 없으면
   얼룩으로 보인다. 대개는 얼룩인데, 얼룩이라는 것을 눈으로 보는 것이
   이 판의 값이다.

   달의 첫 봉과 마지막 봉으로 셈한다. 달 경계에 정확히 봉이 없어도
   (휴장) 그 달에 있는 봉의 처음과 끝이면 충분하다. */
export function monthly(bars) {
  if (!bars || bars.length < 2) return null;

  const cells = new Map();              // 'YYYY-M' 을 열쇠로
  for (const b of bars) {
    const d = new Date(b.t);
    const key = d.getFullYear() + '-' + d.getMonth();
    const cur = cells.get(key);
    if (!cur) cells.set(key, { first: b.c, last: b.c, y: d.getFullYear(), m: d.getMonth() });
    else cur.last = b.c;
  }

  const rows = new Map();               // 연도 → 열두 칸
  for (const cell of cells.values()) {
    if (!rows.has(cell.y)) rows.set(cell.y, new Array(12).fill(null));
    rows.get(cell.y)[cell.m] = cell.first > 0 ? (cell.last / cell.first - 1) * 100 : null;
  }

  const years = [...rows.keys()].sort((a, b) => b - a);

  // 달마다의 평균 — 세로줄이 있나 없나를 여기서 본다
  const byMonth = new Array(12).fill(null).map((_, m) => {
    const vs = years.map((y) => rows.get(y)[m]).filter((v) => v != null);
    return vs.length ? { avg: mean(vs), n: vs.length, up: vs.filter((v) => v > 0).length } : null;
  });

  // 그 해 전체 — 열두 달을 곱해서 얻는다. 더하면 맞지 않는다.
  const yearly = new Map(years.map((y) => [
    y,
    (rows.get(y).filter((v) => v != null)
      .reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100,
  ]));

  return { years, rows, byMonth, yearly };
}

/* ─────────────── 분포 ───────────────

   "흔들림 20%" 라는 숫자는 정규분포를 가정한 말인데 시장은 그렇지
   않다. 히스토그램 위에 같은 평균과 표준편차의 정규곡선을 겹쳐 놓으면
   가운데는 더 뾰족하고 양 끝은 더 두껍다는 것이 한눈에 보인다.

   그 두꺼운 꼬리가 사람을 망하게 하는 자리다. 정규분포라면 백 년에
   한 번이어야 할 날이 십 년에 몇 번씩 온다.

   왜도는 한쪽으로 쏠린 정도, 첨도는 꼬리의 두께다. 정규분포의
   초과첨도는 0이고, 주가는 대개 3에서 8 사이다. */
export function distribution(bars, bins = 41) {
  const rs = logReturns(bars).map((r) => (Math.exp(r) - 1) * 100);   // 백분율로 되돌린다
  if (rs.length < 30) return null;

  const m = mean(rs);
  const s = stdev(rs);
  if (!(s > 0)) return null;

  const lo = Math.min(Math.min(...rs), m - 4 * s);
  const hi = Math.max(Math.max(...rs), m + 4 * s);
  const width = (hi - lo) / bins;
  if (!(width > 0)) return null;

  const counts = new Array(bins).fill(0);
  for (const r of rs) {
    const k = Math.min(bins - 1, Math.max(0, Math.floor((r - lo) / width)));
    counts[k] += 1;
  }

  // 같은 평균과 표준편차의 정규곡선 — 칸의 넓이에 맞춰 개수로 환산
  const normal = counts.map((_, k) => {
    const x = lo + width * (k + 0.5);
    const p = Math.exp(-((x - m) ** 2) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));
    return p * width * rs.length;
  });

  let sk = 0, ku = 0;
  for (const r of rs) { const z = (r - m) / s; sk += z ** 3; ku += z ** 4; }
  sk /= rs.length;
  ku = ku / rs.length - 3;

  const sorted = [...rs].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p))];

  return {
    lo, hi, width, counts, normal,
    mean: m, sd: s, skew: sk, kurt: ku, n: rs.length,
    worst: sorted.slice(0, 5),
    best: sorted.slice(-5).reverse(),
    // 정규분포라면 몇 번이어야 했나, 실제로는 몇 번이었나 (3시그마 밖)
    tail3: {
      actual: rs.filter((r) => Math.abs(r - m) > 3 * s).length,
      expected: rs.length * 0.0027,
    },
    var95: pick(0.05),
    cvar95: mean(sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.05)))),
  };
}

/* ─────────────── 위험 기여도 ───────────────

   열지도의 다음 걸음이다. 열지도는 "둘이 붙어 있다" 까지 말하고,
   이것은 "그래서 전체 흔들림의 몇 퍼센트를 이것이 낸다" 를 말한다.

   비중은 10%인데 흔들림의 30%를 내는 것이 흔하다. 나눠 담았다고 믿는
   사람이 실제로는 안 나눠 담았다는 것을, 열지도보다 한 걸음 더
   분명하게 말해 준다.

   포트폴리오 분산은 w 전치 곱하기 공분산 곱하기 w 이고, i 번째의
   기여는 w[i] 곱하기 (공분산 곱하기 w)[i] 를 분산으로 나눈 것이다.
   다 더하면 1이 되므로 백분율로 돌리기 좋다. */
export function riskContribution(items, weights) {
  const n = items.length;
  if (n < 2) return null;

  const w = normWeights(weights, n);
  const per = 252;

  // 공분산 행렬 — 날짜를 맞춘 쌍으로 셈한다
  const cov = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const { xs, ys } = pairs(items[i].bars, items[j].bars);
      if (xs.length < 10) return null;
      const mx = mean(xs), my = mean(ys);
      let s = 0;
      for (let k = 0; k < xs.length; k++) s += (xs[k] - mx) * (ys[k] - my);
      const c = (s / (xs.length - 1)) * per;
      cov[i][j] = c; cov[j][i] = c;
    }
  }

  const sw = cov.map((row) => row.reduce((a, v, j) => a + v * w[j], 0));
  const varP = w.reduce((a, wi, i) => a + wi * sw[i], 0);
  if (!(varP > 0)) return null;

  return {
    vol: Math.sqrt(varP) * 100,
    rows: items.map((it, i) => ({
      ko: it.ko || it.symbol,
      symbol: it.symbol,
      weight: w[i] * 100,
      risk: ((w[i] * sw[i]) / varP) * 100,
      own: Math.sqrt(cov[i][i]) * 100,
    })),
    cov,
  };
}

function normWeights(weights, n) {
  const raw = (weights && weights.length === n)
    ? weights.map((x) => Math.max(0, x || 0))
    : new Array(n).fill(1);
  const sum = raw.reduce((a, b) => a + b, 0);
  return sum > 0 ? raw.map((x) => x / sum) : new Array(n).fill(1 / n);
}

/* ─────────────── 효율적 투자선 ───────────────

   비중을 무작위로 여러 번 뽑아 (흔들림, 수익) 평면에 점으로 찍는다.
   구름의 왼쪽 위 모서리가 투자선이다.

   최적화 라이브러리를 붙이지 않은 까닭이 있다. 이 화면에 필요한 것은
   정확한 최적해가 아니라 "내가 그 모서리에서 얼마나 떨어져 있나" 이고,
   그건 구름만 있으면 보인다. 그리고 정확한 최적해는 대개 지나간 값에
   과하게 맞춰진 것이라 다음 해에는 틀린다.

   비중은 지수분포 난수를 정규화해 뽑는다. 균등난수를 정규화하면
   가운데로 몰려서 구석(한 종목에 몰아넣기)이 거의 안 나온다. */
export function frontier(items, { draws = 4000, rf = 3 } = {}) {
  const n = items.length;
  if (n < 2) return null;

  const rets = [];
  for (const it of items) {
    const rs = logReturns(it.bars);
    if (rs.length < 20) return null;
    rets.push(mean(rs) * 252);
  }

  const base = riskContribution(items, new Array(n).fill(1));
  if (!base) return null;
  const cov = base.cov;

  const pts = [];
  let bestSharpe = null, minVol = null;

  for (let d = 0; d < draws; d++) {
    const w = new Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = -Math.log(1 - Math.random());
      w[i] = x; sum += x;
    }
    for (let i = 0; i < n; i++) w[i] /= sum;

    let r = 0;
    for (let i = 0; i < n; i++) r += w[i] * rets[i];

    let v = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) v += w[i] * w[j] * cov[i][j];
    }
    const sd = Math.sqrt(Math.max(0, v));
    const sh = sd > 0 ? (r - Math.log(1 + rf / 100)) / sd : -Infinity;

    const pt = { x: sd * 100, y: (Math.exp(r) - 1) * 100, sharpe: sh, w };
    pts.push(pt);
    if (!bestSharpe || sh > bestSharpe.sharpe) bestSharpe = pt;
    if (!minVol || pt.x < minVol.x) minVol = pt;
  }

  // 견주려면 같은 잣대로 잰 점이 하나 필요하다. 똑같이 나눠 담은
  // 경우를 그 자리에 놓는다 — 아무 생각 없이 고르게 담는 것이
  // 생각보다 자주 이긴다는 것도 함께 보인다.
  const eq = new Array(n).fill(1 / n);
  let er = 0, ev = 0;
  for (let i = 0; i < n; i++) er += eq[i] * rets[i];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ev += eq[i] * eq[j] * cov[i][j];

  return {
    pts, bestSharpe, minVol,
    equal: { x: Math.sqrt(Math.max(0, ev)) * 100, y: (Math.exp(er) - 1) * 100, w: eq },
    names: items.map((i) => i.ko || i.symbol),
  };
}

/* ─────────────── 시장 폭 ───────────────

   지수는 큰 것 몇에 끌려간다. 이 숫자는 안 끌려간다. 지수는 오르는데
   이것이 내려가고 있으면 몇 개가 전체를 끌고 있는 것이고, 그런 오름은
   대개 오래가지 않는다.

   지켜보는 것만으로 세는 것이라 진짜 시장 폭은 아니다. 그래도 열둘의
   방향이 갈리는지 모이는지는 알려 준다. */
export function breadth(quotes, n = 20) {
  let above = 0, total = 0, up = 0;
  for (const q of quotes || []) {
    if (!q.ok || !q.bars || q.bars.length < n) continue;
    total += 1;
    const m = q.bars.slice(-n).reduce((a, b) => a + b.c, 0) / n;
    if (q.bars[q.bars.length - 1].c > m) above += 1;
    if (q.changePct > 0) up += 1;
  }
  if (!total) return null;
  return { above, total, pct: (above / total) * 100, up, upPct: (up / total) * 100, n };
}

/* ═══════════════════════════════════════════════════════════════
   무너지는 상관과 스트레스 재생

   앞의 것들은 "평소에 어땠나" 를 잰다. 이 둘은 "나쁠 때 어땠나" 를
   잰다. 평소와 나쁠 때가 다르다는 것이 요점이고, 대개 아주 다르다.
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────── 무너지는 상관 ───────────────

   열지도는 평균 상관을 보여 준다. 그런데 상관은 폭락할 때 1로
   수렴한다 — 분산이 필요한 바로 그 순간에.

   기준이 되는 것(대개 지수)이 크게 내린 날만 골라 상관을 다시 잰다.
   "평소 0.31, 내리는 날 0.87" 같은 숫자가 나오면 나눠 담았다는 믿음이
   거기서 끝난다.

   ── 왜 기준의 하락일로 고르나 ──
   두 종목이 함께 내린 날만 고르면 당연히 상관이 1에 가깝게 나온다.
   고르는 잣대가 재려는 것과 같아지면 안 된다. 그래서 제3의 것(시장)이
   내린 날로 고르고, 그 안에서 둘의 관계를 잰다.

   ── 표본이 적다 ──
   시장이 2% 넘게 내리는 날은 두 해에 열댓 번뿐이다. 스물 미만이면
   숫자를 내지 않고 모자라다고 말한다. */

/**
 * @param {Array} barsA
 * @param {Array} barsB
 * @param {Array} barsMkt  고르는 잣대가 될 것
 * @param {{drop?:number, minN?:number}} opts  drop 은 백분율 (기본 −2%)
 */
export function stressCorrelation(barsA, barsB, barsMkt, opts = {}) {
  const drop = opts.drop ?? -2;
  const minN = opts.minN ?? 20;

  // 셋을 한 날짜에 세운다
  const mapA = new Map(barsA.map((b) => [dayKey(b.t), b.c]));
  const mapB = new Map(barsB.map((b) => [dayKey(b.t), b.c]));

  const rows = [];
  let pa = null, pb = null, pm = null;
  for (const m of barsMkt) {
    const k = dayKey(m.t);
    const a = mapA.get(k), b = mapB.get(k);
    if (a == null || b == null) { pa = pb = pm = null; continue; }
    if (pa != null && pa > 0 && pb > 0 && pm > 0) {
      rows.push({
        mkt: (m.c / pm - 1) * 100,
        a: Math.log(a / pa),
        b: Math.log(b / pb),
      });
    }
    pa = a; pb = b; pm = m.c;
  }

  if (rows.length < 40) return null;

  const corrOf = (subset) => {
    if (subset.length < 3) return null;
    const ma = mean(subset.map((r) => r.a));
    const mb = mean(subset.map((r) => r.b));
    let num = 0, da = 0, db = 0;
    for (const r of subset) {
      const x = r.a - ma, y = r.b - mb;
      num += x * y; da += x * x; db += y * y;
    }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
  };

  const bad = rows.filter((r) => r.mkt <= drop);
  const calm = rows.filter((r) => r.mkt > drop);

  const all = corrOf(rows);
  const inBad = bad.length >= minN ? corrOf(bad) : null;
  const inCalm = corrOf(calm);

  return {
    all,
    bad: inBad,
    calm: inCalm,
    n: rows.length,
    nBad: bad.length,
    thin: bad.length < minN,
    drop,
    // 얼마나 무너지나 — 이 숫자 하나가 이 판의 알맹이다
    collapse: (inBad != null && inCalm != null) ? inBad - inCalm : null,
  };
}

/**
 * 지켜보는 것 전부에 대해 한꺼번에.
 * 기준(시장)에 대한 각자의 관계가 나쁠 때 어떻게 바뀌는지를 낸다.
 */
export function stressMatrix(items, market, opts = {}) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const got = stressCorrelation(items[i].bars, items[j].bars, market, opts);
      if (!got || got.collapse == null) continue;
      out.push({
        a: items[i].ko || items[i].symbol,
        b: items[j].ko || items[j].symbol,
        aSym: items[i].symbol, bSym: items[j].symbol,
        ...got,
      });
    }
  }
  return out.sort((x, y) => y.collapse - x.collapse);
}

/* ─────────────── 스트레스 재생 ───────────────

   예측이 아니라 재생이다. "그때가 다시 오면" 이 아니라 "그때를 지금
   조합으로 겪었다면".

   실제로 있었던 구간의 날마다 움직임을 지금 비중에 그대로 대어 본다.
   최대 낙폭 한 줄보다 훨씬 구체적으로 겁을 준다 — 얼마를 잃는지가
   금액으로 나오기 때문이다.

   ── 그때 없던 것은 어떻게 하나 ──
   2008년에 상장도 안 했던 것이 흔하다. 그런 것은 지수에 대한 베타로
   갈음한다. 갈음한 것은 반드시 표를 달아 둔다 — 지어낸 값을 진짜처럼
   보이게 하는 것이 이 판에서 가장 나쁜 일이다.

   베타조차 못 재면 그 종목은 아예 뺀다. 모르는 것은 0으로 두지 않고
   빼는 편이 낫다. 0으로 두면 "그 종목은 안 움직였다" 는 거짓말이 된다. */

/** 되짚어 볼 구간들 */
export const EPISODES = [
  {
    id: 'gfc', ko: '금융위기', gr: 'Πτῶσις',
    from: '2008-09-01', to: '2009-03-09',
    note: '리먼이 넘어진 뒤 반년. 주식과 회사채가 함께 무너졌고, '
        + '"나눠 담았다" 던 것들이 한꺼번에 내렸다.',
  },
  {
    id: 'covid', ko: '코로나 급락', gr: 'Λοιμός',
    from: '2020-02-19', to: '2020-03-23',
    note: '한 달 남짓에 끝난 대신 속도가 가장 빨랐다. 팔 틈이 없었다는 '
        + '뜻이기도 하다.',
  },
  {
    id: 'tighten', ko: '2022 긴축', gr: 'Σφίγξις',
    from: '2022-01-03', to: '2022-10-12',
    note: '주식과 채권이 함께 내린 드문 해. 60/40 이 안 통한다는 말이 '
        + '나온 것이 이때다.',
  },
  {
    id: 'q4-2018', ko: '2018 4분기', gr: 'Χειμών',
    from: '2018-10-01', to: '2018-12-24',
    note: '금리를 올리던 끝자락. 석 달 만에 났다.',
  },
  {
    id: 'euro', ko: '유럽 재정위기', gr: 'Ἔρις',
    from: '2011-07-22', to: '2011-10-03',
    note: '미국 신용등급이 깎이고 유럽이 흔들렸다.',
  },
];

export const episodeById = (id) => EPISODES.find((e) => e.id === id) || EPISODES[0];

/**
 * 한 구간을 지금 조합에 대어 본다.
 *
 * @param {Array<{symbol, ko, bars, weight}>} holdings  weight 는 비중(합 1 아니어도 됨)
 * @param {Array} marketBars  갈음할 때 쓸 지수
 * @param {object} episode
 * @param {{value?:number}} opts  value 를 주면 금액으로도 낸다
 */
export function replay(holdings, marketBars, episode, opts = {}) {
  const from = Date.parse(episode.from);
  const to = Date.parse(episode.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

  const mkt = slice(marketBars, from, to);
  if (mkt.length < 5) {
    return { ok: false, why: `기준 지수에 ${episode.ko} 구간의 값이 없습니다. 더 긴 이력이 필요합니다.` };
  }

  const mktRet = (mkt[mkt.length - 1].c / mkt[0].c - 1) * 100;

  const rows = [];
  for (const h of holdings) {
    const own = slice(h.bars, from, to);

    if (own.length >= 5) {
      rows.push({
        symbol: h.symbol, ko: h.ko, weight: h.weight,
        ret: (own[own.length - 1].c / own[0].c - 1) * 100,
        worst: worstDay(own),
        how: 'real',
      });
      continue;
    }

    // 그때 없던 것 — 지수에 대한 베타로 갈음한다
    const ba = betaAlpha(marketBars, h.bars);
    if (!ba || !Number.isFinite(ba.beta)) continue;      // 못 재면 뺀다
    rows.push({
      symbol: h.symbol, ko: h.ko, weight: h.weight,
      ret: mktRet * ba.beta,
      worst: worstDay(mkt) * ba.beta,
      how: 'beta',
      beta: ba.beta,
      r2: ba.r2,
    });
  }

  if (!rows.length) return { ok: false, why: '되짚을 수 있는 것이 하나도 없습니다.' };

  const wsum = rows.reduce((a, r) => a + (r.weight || 0), 0) || rows.length;
  for (const r of rows) r.w = (r.weight || 1) / wsum;

  const total = rows.reduce((a, r) => a + r.w * r.ret, 0);
  const estimated = rows.filter((r) => r.how === 'beta');

  return {
    ok: true,
    episode,
    rows: rows.sort((a, b) => a.ret - b.ret),
    total,
    mktRet,
    days: Math.round((to - from) / 86_400_000),
    // 갈음한 것이 얼마나 되나. 절반을 넘으면 이 숫자는 재생이 아니라 짐작이다.
    estimatedCount: estimated.length,
    estimatedWeight: estimated.reduce((a, r) => a + r.w, 0) * 100,
    amount: Number.isFinite(opts.value) ? opts.value * (total / 100) : null,
    value: opts.value,
  };
}

/** 구간 안의 봉만 */
function slice(bars, from, to) {
  return (bars || []).filter((b) => b.t >= from && b.t <= to);
}

/** 그 구간에서 가장 나빴던 하루 */
function worstDay(bars) {
  let worst = 0;
  for (let i = 1; i < bars.length; i++) {
    const r = (bars[i].c / bars[i - 1].c - 1) * 100;
    if (r < worst) worst = r;
  }
  return worst;
}
