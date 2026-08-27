/* ═══════════════════════════════════════════════════════════════
   indicators.js — 봉에서 뽑아내는 줄들

   차트에 얹는 줄과 백테스트가 보는 값이 서로 다르면 눈으로 본 것과
   시험한 것이 어긋난다. 그래서 한 곳에서만 셈한다. 차트도 여기서
   가져다 그리고, 시험(backtest)도 여기서 가져다 판단한다.

   ── 만들 수 있는 것 ──
   틀(kind)을 고르고 값(기간 등)만 정하면 새 지표가 된다. 같은 틀로
   기간만 다르게 여럿 만들 수 있다 — 이동평균 20일과 112일은 다른
   지표다. 만든 것은 설정에 남아 다음에 켤 때 그대로 있다.

   ── 어디에 그리나 ──
   pane 이 'price' 면 봉과 같은 자리에 겹쳐 그린다 (이동평균·볼린저).
   'lower' 면 아래 칸에 따로 그린다 (상대강도·MACD — 값의 단위가
   가격과 달라 같이 그리면 둘 다 못 읽는다).
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────── 밑감 ─────────────── */

const closes = (bars) => bars.map((b) => b.c);

/** 단순이동평균 */
export function sma(vals, n) {
  const out = new Array(vals.length).fill(null);
  if (n < 1 || vals.length < n) return out;
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= n) sum -= vals[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** 지수이동평균 — 최근 값에 더 무게를 준다 */
export function ema(vals, n) {
  const out = new Array(vals.length).fill(null);
  if (n < 1 || vals.length < n) return out;
  const k = 2 / (n + 1);
  let prev = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < vals.length; i++) {
    prev = vals[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** 표준편차 — 볼린저 밴드의 폭 */
function stdev(vals, n, means) {
  const out = new Array(vals.length).fill(null);
  for (let i = n - 1; i < vals.length; i++) {
    const m = means[i];
    if (m == null) continue;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (vals[j] - m) ** 2;
    out[i] = Math.sqrt(s / n);
  }
  return out;
}

/**
 * 상대강도지수 — 오른 날의 힘과 내린 날의 힘을 견준다.
 * 와일더의 원래 셈법(지수평활)을 쓴다. 단순평균으로 하면 값이 튄다.
 */
export function rsi(vals, n = 14) {
  const out = new Array(vals.length).fill(null);
  if (vals.length <= n) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = vals[i] - vals[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);

  for (let i = n + 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1];
    gain = (gain * (n - 1) + Math.max(0, d)) / n;
    loss = (loss * (n - 1) + Math.max(0, -d)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/* ─────────────── 지표의 틀 ─────────────── */

/**
 * 틀 하나는 이렇게 생겼다.
 *   id     안에서 쓰는 이름표
 *   ko/gr  화면에 뜨는 이름
 *   pane   'price' 겹쳐 그림 · 'lower' 아래 칸에 따로
 *   fields 사람이 정할 값들
 *   calc   (bars, cfg) => { lines, histogram?, band?, levels?, range? }
 */
export const KINDS = [
  {
    id: 'sma', ko: '이동평균', gr: 'Μέσος', pane: 'price',
    fields: [{ key: 'period', label: '기간', min: 2, max: 400, def: 20 }],
    note: '정해진 날수의 종가 평균. 값이 위를 향하면 오름세로 본다.',
    calc: (bars, c) => ({
      lines: [{ key: 'ma', label: 'MA' + c.period, values: sma(closes(bars), c.period) }],
    }),
  },
  {
    id: 'ema', ko: '지수이동평균', gr: 'Ἐκθετικός', pane: 'price',
    fields: [{ key: 'period', label: '기간', min: 2, max: 400, def: 12 }],
    note: '최근 값에 더 무게를 준 평균. 방향이 바뀌는 것을 빨리 알아챈다.',
    calc: (bars, c) => ({
      lines: [{ key: 'ema', label: 'EMA' + c.period, values: ema(closes(bars), c.period) }],
    }),
  },
  {
    id: 'boll', ko: '볼린저 밴드', gr: 'Ζώνη', pane: 'price',
    fields: [
      { key: 'period', label: '기간', min: 5, max: 200, def: 20 },
      { key: 'mult', label: '표준편차 배수', min: 0.5, max: 4, step: 0.1, def: 2 },
    ],
    note: '평균에서 표준편차만큼 떨어진 두 줄. 값이 그 밖으로 나가면 드물게 움직인 것이다.',
    calc: (bars, c) => {
      const v = closes(bars);
      const mid = sma(v, c.period);
      const sd = stdev(v, c.period, mid);
      const up = mid.map((m, i) => (m == null || sd[i] == null ? null : m + sd[i] * c.mult));
      const lo = mid.map((m, i) => (m == null || sd[i] == null ? null : m - sd[i] * c.mult));
      return {
        lines: [
          { key: 'up', label: '상단', values: up, dash: [3, 3] },
          { key: 'mid', label: '중심 ' + c.period, values: mid },
          { key: 'lo', label: '하단', values: lo, dash: [3, 3] },
        ],
        band: { upper: up, lower: lo },
      };
    },
  },
  {
    id: 'rsi', ko: '상대강도', gr: 'Ἰσχύς', pane: 'lower',
    fields: [{ key: 'period', label: '기간', min: 2, max: 100, def: 14 }],
    note: '0에서 100 사이. 흔히 70 위를 과열, 30 아래를 침체로 본다.',
    calc: (bars, c) => ({
      lines: [{ key: 'rsi', label: 'RSI' + c.period, values: rsi(closes(bars), c.period) }],
      levels: [30, 50, 70],
      range: [0, 100],
    }),
  },
  {
    id: 'macd', ko: 'MACD', gr: 'Σύγκλισις', pane: 'lower',
    fields: [
      { key: 'fast', label: '빠른 선', min: 2, max: 100, def: 12 },
      { key: 'slow', label: '느린 선', min: 3, max: 200, def: 26 },
      { key: 'signal', label: '신호선', min: 2, max: 100, def: 9 },
    ],
    note: '빠른 평균에서 느린 평균을 뺀 것. 신호선을 위로 뚫으면 오름 쪽으로 본다.',
    calc: (bars, c) => {
      const v = closes(bars);
      const f = ema(v, c.fast);
      const s = ema(v, c.slow);
      const macd = f.map((x, i) => (x == null || s[i] == null ? null : x - s[i]));

      // 신호선은 MACD 줄의 지수평균이다. 앞머리가 비어 있으므로
      // 값이 있는 데서부터 셈하고 자리를 도로 맞춰 준다.
      const off = macd.findIndex((x) => x != null);
      const sig = new Array(macd.length).fill(null);
      if (off >= 0) {
        const seed = macd.slice(off);
        ema(seed, c.signal).forEach((x, i) => { sig[off + i] = x; });
      }
      const hist = macd.map((x, i) => (x == null || sig[i] == null ? null : x - sig[i]));
      return {
        lines: [
          { key: 'macd', label: 'MACD', values: macd },
          { key: 'signal', label: '신호', values: sig, dash: [4, 3] },
        ],
        histogram: { key: 'hist', label: '차이', values: hist },
        levels: [0],
      };
    },
  },
  {
    id: 'vol', ko: '거래량', gr: 'Ὄγκος', pane: 'lower',
    fields: [{ key: 'period', label: '평균 기간', min: 2, max: 200, def: 20 }],
    note: '막대는 그날의 거래량, 줄은 그 평균. 평균을 크게 넘으면 무언가 일어난 것이다.',
    calc: (bars, c) => {
      const v = bars.map((b) => b.v || 0);
      return {
        lines: [{ key: 'avg', label: '평균 ' + c.period, values: sma(v, c.period) }],
        histogram: { key: 'vol', label: '거래량', values: v, positive: true },
      };
    },
  },
];

export const kindById = (id) => KINDS.find((k) => k.id === id) || null;

/* ─────────────── 만들어 둔 지표 ─────────────── */

/** 처음 오는 사람이 보게 될 것 — 예전의 MA20·MA60 을 그대로 옮겼다 */
export const DEFAULT_INDICATORS = [
  { id: 'ma20', kind: 'sma', on: true, color: 'gold', cfg: { period: 20 } },
  { id: 'ma60', kind: 'sma', on: true, color: 'jade', cfg: { period: 60 } },
];

/** 새로 만들 때 채워 줄 값들 */
export function blank(kindId) {
  const k = kindById(kindId) || KINDS[0];
  const cfg = {};
  for (const f of k.fields) cfg[f.key] = f.def;
  return {
    id: k.id + '-' + Date.now().toString(36),
    kind: k.id,
    on: true,
    color: 'gold',
    cfg,
  };
}

/** 사람이 읽을 이름 — "이동평균 20" */
export function nameOf(ind) {
  const k = kindById(ind.kind);
  if (!k) return ind.id;
  const vals = k.fields.map((f) => ind.cfg[f.key]).join('·');
  return vals ? k.ko + ' ' + vals : k.ko;
}

/** 값이 틀 안에 있는지 손질한다 (설정 파일이 낡았을 수도 있다) */
export function sane(ind) {
  const k = kindById(ind && ind.kind);
  if (!k) return null;
  const cfg = {};
  for (const f of k.fields) {
    let v = Number(ind.cfg ? ind.cfg[f.key] : NaN);
    if (!Number.isFinite(v)) v = f.def;
    cfg[f.key] = Math.max(f.min, Math.min(f.max, v));
  }
  return {
    id: ind.id || blank(k.id).id,
    kind: k.id,
    on: ind.on !== false,
    color: ind.color || 'gold',
    cfg,
  };
}

/**
 * 지표 하나를 봉에 대고 셈한다.
 * @returns {{ind, kind, name, pane, out}|null}
 */
export function compute(ind, bars) {
  const clean = sane(ind);
  if (!clean || !bars || !bars.length) return null;
  const k = kindById(clean.kind);
  try {
    return {
      ind: clean,
      kind: k,
      name: nameOf(clean),
      pane: k.pane,
      out: k.calc(bars, clean.cfg),
    };
  } catch (err) {
    console.warn('[indicator]', clean.kind, err);
    return null;
  }
}

/** 켜져 있는 것만 모아서 셈한다 */
export function computeAll(list, bars) {
  return (list || [])
    .filter((i) => i && i.on !== false)
    .map((i) => compute(i, bars))
    .filter(Boolean);
}

/** 색 이름 → CSS 변수 (tokens.css 에 있는 것들) */
export const COLORS = [
  { id: 'gold', ko: '금', varName: '--gold-400' },
  { id: 'jade', ko: '청동', varName: '--jade-300' },
  { id: 'coral', ko: '산호', varName: '--coral-300' },
  { id: 'sky', ko: '하늘', varName: '--down' },
  { id: 'rose', ko: '자주', varName: '--rose-500' },
  { id: 'ivory', ko: '상아', varName: '--tx-200' },
];
export const colorVar = (id) => (COLORS.find((c) => c.id === id) || COLORS[0]).varName;
