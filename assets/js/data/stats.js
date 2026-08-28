/* ═══════════════════════════════════════════════════════════════
   stats.js — 올린 표에 거는 셈

   analysis.js 는 '시세'를 안다 (봉, 수익률, 낙폭). 이 파일은 아무것도
   모르는 숫자 더미를 다룬다. 올린 표가 시세인지 매출인지 몸무게인지
   여기서는 알 수 없기 때문이다.

   ── 무엇을 넣고 무엇을 뺐나 ──
   넣은 것: 요약, 분포, 상관, 회귀, 정규성.
   뺀 것: 검정력이 필요한 것들(분산분석, 카이제곱, 비모수 검정 여럿).
   투자 자료에 쓸 일이 드물고, 쓸 줄 모르는 채로 p 값만 보면 없는
   결론을 얻게 된다.

   ── p 값을 왜 굳이 제대로 셈했나 ──
   근사로 대충 내면 표본이 작을 때 크게 틀린다. 그런데 개인이 올리는
   표는 대개 작다 (열두 달, 스무 종목). 작을 때 틀리는 셈은 여기서
   쓸모가 없다. 그래서 t 분포를 불완전 베타로 제대로 셈한다.
   ═══════════════════════════════════════════════════════════════ */

const clean = (xs) => xs.filter((x) => typeof x === 'number' && isFinite(x));

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function quantile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/* ═══════════════════ 요약 ═══════════════════

   ── 왜 빠진 칸을 세어 보여 주나 ──
   평균이 이상하게 나올 때 첫 번째로 의심할 것이 빠진 값이다. 스무 줄
   중 열두 줄이 비어 있는데 평균만 보여 주면, 그 평균을 여덟 줄짜리로
   읽지 못한다. */
export function describe(values) {
  const xs = clean(values);
  const n = xs.length;
  const missing = values.length - n;
  if (!n) return { n: 0, missing };

  const s = [...xs].sort((a, b) => a - b);
  const m = mean(xs);

  let s2 = 0, s3 = 0, s4 = 0;
  for (const x of xs) { const d = x - m; s2 += d * d; s3 += d * d * d; s4 += d * d * d * d; }

  // 표본 표준편차 — n 이 아니라 n−1 로 나눈다. 표본으로 모집단을
  // 어림하는 자리이므로.
  const varS = n > 1 ? s2 / (n - 1) : 0;
  const sd = Math.sqrt(varS);
  const sdP = Math.sqrt(s2 / n);            // 비뚤어짐·뾰족함에는 이쪽을 쓴다

  return {
    n, missing,
    mean: m,
    sd,
    se: n > 1 ? sd / Math.sqrt(n) : NaN,
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    max: s[n - 1],
    sum: xs.reduce((a, b) => a + b, 0),
    // 변동계수 — 단위가 다른 열끼리 흩어짐을 견줄 때
    cv: m !== 0 ? sd / Math.abs(m) : NaN,
    skew: sdP > 0 ? (s3 / n) / (sdP ** 3) : 0,
    kurt: sdP > 0 ? (s4 / n) / (sdP ** 4) - 3 : 0,   // 초과 첨도 (정규분포가 0)
  };
}

/* ═══════════════════ 분포 ═══════════════════

   칸 수는 Freedman–Diaconis 로 정한다. 사분위 범위를 쓰므로 바깥값
   하나에 칸 폭이 통째로 흔들리지 않는다 — 투자 자료에는 그런 하루가
   반드시 있다. */
export function histogram(values, bins) {
  const xs = clean(values);
  if (xs.length < 2) return null;

  const s = [...xs].sort((a, b) => a - b);
  const lo = s[0], hi = s[s.length - 1];
  if (hi === lo) return { bins: [{ from: lo, to: lo, n: xs.length }], lo, hi, width: 0 };

  let k = bins;
  if (!k) {
    const iqr = quantile(s, 0.75) - quantile(s, 0.25);
    const w = iqr > 0 ? 2 * iqr / Math.cbrt(xs.length) : 0;
    k = w > 0 ? Math.ceil((hi - lo) / w) : Math.ceil(Math.sqrt(xs.length));
    k = Math.max(5, Math.min(40, k));
  }

  const width = (hi - lo) / k;
  const out = Array.from({ length: k }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, n: 0 }));
  for (const x of xs) {
    const i = Math.min(k - 1, Math.floor((x - lo) / width));
    out[i].n++;
  }
  return { bins: out, lo, hi, width, n: xs.length };
}

/* ═══════════════════ 상관 ═══════════════════ */

/** 두 열에서 둘 다 값이 있는 줄만 남긴다 */
function pairs(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (typeof x === 'number' && isFinite(x) && typeof y === 'number' && isFinite(y)) { xs.push(x); ys.push(y); }
  }
  return [xs, ys];
}

export function pearson(a, b) {
  const [xs, ys] = pairs(a, b);
  const n = xs.length;
  if (n < 3) return { r: null, n, p: null };

  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { r: null, n, p: null };

  const r = sxy / Math.sqrt(sxx * syy);
  // r 이 딱 1 이면 t 가 무한이 된다 — 같은 열을 견준 것이다
  const rc = Math.min(0.999999999, Math.max(-0.999999999, r));
  const t = rc * Math.sqrt((n - 2) / (1 - rc * rc));
  return { r, n, p: tTest(Math.abs(t), n - 2) };
}

/** 순위로 바꿔 견준다 — 한쪽으로 길게 늘어진 자료에 강하다 */
export function spearman(a, b) {
  const [xs, ys] = pairs(a, b);
  if (xs.length < 3) return { r: null, n: xs.length, p: null };
  return pearson(rank(xs), rank(ys));
}

function rank(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;                 // 같은 값은 평균 순위를 나눠 갖는다
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

/** 고른 열들끼리 전부 견준다 */
export function corrMatrix(cols, { kind = 'pearson' } = {}) {
  const f = kind === 'spearman' ? spearman : pearson;
  const n = cols.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(null));
  const counts = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const res = i === j ? { r: 1, n: clean(cols[i].values).length } : f(cols[i].values, cols[j].values);
      m[i][j] = m[j][i] = res.r;
      counts[i][j] = counts[j][i] = res.n;
    }
  }
  return { m, counts, names: cols.map((c) => c.name), kind };
}

/* ═══════════════════ 회귀 ═══════════════════

   y = a + b·x 하나만 한다.

   ── 왜 여러 갈래(다중회귀)는 안 넣나 ──
   설명변수를 여럿 넣으면 거의 언제나 R² 가 오른다. 그것을 '더 잘
   설명한다' 로 읽기 쉬운데, 대개는 그냥 자유도를 쓴 것이다. 그 함정을
   화면에서 막을 자신이 없으면 넣지 않는 편이 낫다. */
export function regress(xRaw, yRaw) {
  const [xs, ys] = pairs(xRaw, yRaw);
  const n = xs.length;
  if (n < 3) return null;

  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0) return null;

  const b = sxy / sxx;
  const a = my - b * mx;

  let sse = 0;
  for (let i = 0; i < n; i++) { const e = ys[i] - (a + b * xs[i]); sse += e * e; }

  const r2 = syy > 0 ? 1 - sse / syy : 0;
  const df = n - 2;
  const seB = df > 0 && sxx > 0 ? Math.sqrt((sse / df) / sxx) : NaN;
  const t = seB > 0 ? b / seB : NaN;

  return {
    n, slope: b, intercept: a, r2,
    r: syy > 0 && sxx > 0 ? sxy / Math.sqrt(sxx * syy) : null,
    se: seB,
    t,
    p: isFinite(t) ? tTest(Math.abs(t), df) : null,
    // 잔차의 표준편차 — "이 선에서 대개 이만큼 벗어난다"
    resid: df > 0 ? Math.sqrt(sse / df) : NaN,
    at: (x) => a + b * x,
    xs, ys,
  };
}

/* ═══════════════════ 정규성 ═══════════════════

   Jarque–Bera. 비뚤어짐과 뾰족함이 정규분포에서 얼마나 멀어졌나를
   하나로 묶는다.

   ── 왜 이것을 보여 주나 ──
   샤프 지수도, 신뢰구간도, 대부분의 p 값도 '정규분포에 가깝다'를 깔고
   있다. 투자 수익률은 거의 언제나 그렇지 않다 — 꼬리가 두껍다. 그
   사실을 화면에 두면, 다른 숫자들을 얼마나 믿을지가 정해진다. */
export function normality(values) {
  const d = describe(values);
  if (!d.n || d.n < 8) return null;

  const jb = (d.n / 6) * (d.skew ** 2 + (d.kurt ** 2) / 4);
  // 자유도 2 의 카이제곱은 닫힌 꼴이 있다: P(X > x) = exp(−x/2)
  const p = Math.exp(-jb / 2);
  return { jb, p, skew: d.skew, kurt: d.kurt, n: d.n, normal: p > 0.05 };
}

/* ═══════════════════ t 분포 ═══════════════════

   양쪽 꼬리 p 값. 불완전 베타 함수를 이어분수로 셈한다.
   Numerical Recipes 의 betacf 와 같은 방식이다. */

export function tTest(t, df) {
  if (!(df > 0) || !isFinite(t)) return null;
  return betai(df / 2, 0.5, df / (df + t * t));
}

function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? front * betacf(a, b, x) / a
    : 1 - front * betacf(b, a, 1 - x) / b;
}

function betacf(a, b, x) {
  const TINY = 1e-30, EPS = 3e-12;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/* 로그 감마 — Lanczos 어림. 소수점 아래 열 자리쯤 맞는다. */
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7,
];

function lgamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/* ═══════════════════ 시계열로 볼 때 ═══════════════════

   날짜 열과 값 열이 있으면 그것은 시세와 같은 모양이다. 그러면 이미
   있는 분석 기계(analysis.js)를 그대로 걸 수 있다.

   ── 왜 봉 모양으로 바꾸나 ──
   차트도 분석도 {t,o,h,l,c,v} 를 먹는다. 여기서 그 모양으로 바꿔 두면
   올린 표가 시세와 똑같이 다뤄진다 — 낙폭도, 샤프도, 굴러가는 수익률도
   따로 만들 필요가 없다. */
export function asBars(dates, values) {
  const rows = [];
  for (let i = 0; i < Math.min(dates.length, values.length); i++) {
    const d = dates[i], v = values[i];
    if (!(d instanceof Date) || !isFinite(+d)) continue;
    if (typeof v !== 'number' || !isFinite(v)) continue;
    rows.push({ t: +d, c: v });
  }
  rows.sort((a, b) => a.t - b.t);

  // 같은 날이 여럿이면 마지막 것만 — 명세서에는 하루에 여러 줄이 흔하다
  const out = [];
  for (const r of rows) {
    if (out.length && out[out.length - 1].t === r.t) out[out.length - 1] = r;
    else out.push(r);
  }
  return out.map((r) => ({ t: r.t, o: r.c, h: r.c, l: r.c, c: r.c, v: 0 }));
}

/** 값 줄에서 날짜 없이 수익률만 뽑는다 (한 줄이 한 칸) */
export function returns(values) {
  const xs = clean(values);
  const out = [];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i - 1] === 0) { out.push(null); continue; }
    out.push(xs[i] / xs[i - 1] - 1);
  }
  return out.filter((x) => x != null && isFinite(x));
}
