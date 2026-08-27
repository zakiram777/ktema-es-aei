/* ═══════════════════════════════════════════════════════════════
   portfolio.js — 종목을 고르는 대신 비중을 고른다

   전략 시험기(engine.js)는 "언제 사고 언제 파나" 를 묻는다. 여기서는
   그것을 아예 묻지 않는다. 무엇을 얼마나 담고, 얼마 만에 한 번씩
   원래 비중으로 되돌릴 것인가만 묻는다.

   ── 왜 이것이 따로 있나 ──
   개인에게는 종목 고르기보다 이쪽이 성과를 더 많이 정한다. 그런데
   화면은 늘 종목 고르기 쪽에만 있다. 규칙을 스무 번 고치는 것보다
   비중을 한 번 정하는 것이 대개 더 큰 차이를 낸다.

   ── 셈하는 규칙 ──
   · 날짜를 맞춰 짝짓는다. 장이 서는 날이 다른 것들을 섞으면 하루씩
     밀린 채로 셈하게 된다. 하나라도 값이 없는 날은 통째로 건너뛴다.
   · 리밸런싱은 그날 종가로 치른다. 수수료는 옮기는 금액에만 문다 —
     그대로 두는 몫에는 물지 않는다.
   · 밴드 방식은 정해진 날이 아니라 '어긋난 정도' 로 튼다. 5% 밴드면
     목표에서 5%포인트 넘게 벌어졌을 때만 손을 댄다.
   ═══════════════════════════════════════════════════════════════ */

/** 얼마 만에 한 번 되돌릴 것인가 */
export const PERIODS = [
  { id: 'none',    ko: '안 한다',   note: '한 번 사고 그대로 둔다' },
  { id: 'month',   ko: '달마다' },
  { id: 'quarter', ko: '분기마다' },
  { id: 'half',    ko: '반년마다' },
  { id: 'year',    ko: '해마다' },
  { id: 'band',    ko: '어긋나면', note: '목표에서 정해진 폭 넘게 벌어졌을 때만' },
];

/* ─────────────── 날짜 맞추기 ───────────────

   여럿을 한 판에 올리려면 같은 날의 값이 있어야 한다. 코스피가 쉬는
   날 뉴욕은 열리는데, 그런 날을 그냥 두면 한쪽만 움직인 것으로
   셈해져 없는 수익이 생긴다. 그래서 다 있는 날만 남긴다.

   지수와 개별주를 섞으면 남는 날이 꽤 줄어든다. 그래도 이 편이
   맞는데, 틀린 날을 채워 넣는 것보다 없는 날을 버리는 편이 낫다. */
export function align(series) {
  if (!series.length) return { dates: [], cols: [] };

  const maps = series.map((s) => {
    const m = new Map();
    for (const b of s.bars || []) m.set(dayKey(b.t), b.c);
    return m;
  });

  const dates = [];
  for (const b of series[0].bars || []) {
    const k = dayKey(b.t);
    if (maps.every((m) => m.has(k) && m.get(k) > 0)) dates.push({ t: b.t, k });
  }

  return {
    dates: dates.map((d) => d.t),
    cols: maps.map((m) => dates.map((d) => m.get(d.k))),
  };
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/* ─────────────── 리밸런싱 ─────────────── */

/**
 * @param {Array<{ko,symbol,bars}>} series
 * @param {{weights:number[], period:string, bandPct:number, feeBps:number, cash:number}} cfg
 */
export function rebalance(series, cfg = {}) {
  const { dates, cols } = align(series);
  if (dates.length < 30) {
    const each = series.map((s) => `${s.ko || s.symbol} ${s.bars?.length || 0}`).join(', ');
    return {
      ok: false,
      why: `모두 값이 있는 날이 ${dates.length}일뿐입니다 (받은 봉: ${each}). `
         + '기간을 넓히거나, 장이 서는 날이 크게 다른 것을 빼 보십시오.',
    };
  }

  const n = series.length;
  const target = normWeights(cfg.weights, n);
  const fee = (cfg.feeBps ?? 25) / 10_000;
  const band = (cfg.bandPct ?? 5) / 100;
  const period = cfg.period || 'quarter';
  const start = cfg.cash || 10_000_000;

  // 처음 사들일 때도 수수료를 문다. 안 물면 첫날부터 이겨 있다.
  let units = target.map((w, i) => (start * w * (1 - fee)) / cols[i][0]);

  const equity = new Array(dates.length).fill(0);
  const drift = new Array(dates.length).fill(0);   // 목표에서 가장 벌어진 정도
  const events = [];
  let turnover = 0;
  // 첫날에 이미 목표대로 사 두었다. 다음 기한은 거기서부터 센다.
  // 여기를 null 로 두면 isDue 가 늘 거짓이라 한 번도 안 걸린다.
  let last = dates[0];

  for (let d = 0; d < dates.length; d++) {
    const vals = units.map((u, i) => u * cols[i][d]);
    const total = vals.reduce((a, b) => a + b, 0);
    equity[d] = total;
    if (!(total > 0)) continue;

    const now = vals.map((v) => v / total);
    drift[d] = Math.max(...now.map((w, i) => Math.abs(w - target[i]))) * 100;

    if (period === 'none') continue;

    const due = period === 'band'
      ? now.some((w, i) => Math.abs(w - target[i]) > band)
      : isDue(dates[d], last, period);

    if (!due) continue;

    // 옮기는 금액에만 수수료를 문다. 그대로 두는 몫은 건드리지 않았다.
    let moved = 0;
    for (let i = 0; i < n; i++) moved += Math.abs(target[i] * total - vals[i]);
    moved /= 2;                        // 판 만큼 사므로 한 번만 센다
    const cost = moved * fee * 2;      // 팔 때와 살 때

    const after = total - cost;
    units = target.map((w, i) => (after * w) / cols[i][d]);
    turnover += moved;
    events.push({ i: d, t: dates[d], moved, cost, drift: drift[d] });
    last = dates[d];
  }

  const end = equity[equity.length - 1];

  // 견줄 것 — 같은 비중으로 사서 아무것도 안 한 경우
  const held = holdOnly(cols, target, start, fee);

  return {
    ok: true,
    dates,
    equity,
    hold: held,
    drift,
    events,
    turnover,
    ...score(equity, dates, start),
    holdScore: score(held, dates, start),
    // 낱개로 하나씩 들고 있었다면 각각 어땠나 — 섞은 값과 견주려면 필요하다
    each: series.map((s, i) => ({
      ko: s.ko || s.symbol,
      symbol: s.symbol,
      ret: (cols[i][cols[i].length - 1] / cols[i][0] - 1) * 100,
      weight: target[i] * 100,
    })),
  };
}

function holdOnly(cols, target, start, fee) {
  const units = target.map((w, i) => (start * w * (1 - fee)) / cols[i][0]);
  const len = cols[0].length;
  const out = new Array(len).fill(0);
  for (let d = 0; d < len; d++) {
    let s = 0;
    for (let i = 0; i < cols.length; i++) s += units[i] * cols[i][d];
    out[d] = s;
  }
  return out;
}

function isDue(t, last, period) {
  if (last == null) return false;
  const a = new Date(last), b = new Date(t);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  const need = { month: 1, quarter: 3, half: 6, year: 12 }[period] || 3;
  return months >= need;
}

/* ─────────────── 적립식과 일시납 ───────────────

   사람들이 가장 자주 묻고 가장 자주 틀리는 물음이다.

   같은 총액을 같은 기간에 넣되, 한쪽은 첫날에 다 넣고 다른 한쪽은
   매달 나누어 넣는다. 끝의 값만 견주면 대개 일시납이 이긴다 —
   시장은 대체로 오르고, 일찍 넣은 돈은 더 오래 붙어 있으므로.

   그런데 그 '대개' 가 이 물음의 답은 아니다. 가장 나빴던 구간에서는
   반대이고, 사람이 실제로 겁내는 것은 그 구간이다. 그래서 여기서는
   끝값만이 아니라 도중에 가장 깊이 팠던 자리도 같이 낸다. */

/**
 * @param {Array<{c,t}>|Array} bars 한 종목의 봉
 * @param {{monthly:number, feeBps:number}} cfg
 */
export function dcaVsLump(bars, cfg = {}) {
  if (!bars || bars.length < 60) {
    return { ok: false, why: '봉이 너무 적습니다. 기간을 넓혀 보십시오.' };
  }

  const fee = (cfg.feeBps ?? 25) / 10_000;
  const per = cfg.monthly || 1_000_000;

  // 매달 첫 거래일을 찾는다
  const buyDays = [];
  let lastMonth = null;
  for (let i = 0; i < bars.length; i++) {
    const d = new Date(bars[i].t);
    const key = d.getFullYear() + '-' + d.getMonth();
    if (key !== lastMonth) { buyDays.push(i); lastMonth = key; }
  }

  const total = per * buyDays.length;

  // 적립식 — 매달 첫 거래일에 같은 돈을 넣는다
  let dcaUnits = 0, dcaIn = 0;
  const dca = new Array(bars.length).fill(0);
  const dcaCost = new Array(bars.length).fill(0);
  let next = 0;
  for (let i = 0; i < bars.length; i++) {
    if (next < buyDays.length && buyDays[next] === i) {
      dcaUnits += (per * (1 - fee)) / bars[i].c;
      dcaIn += per;
      next += 1;
    }
    dca[i] = dcaUnits * bars[i].c;
    dcaCost[i] = dcaIn;
  }

  // 일시납 — 첫날에 총액을 다 넣는다
  const lumpUnits = (total * (1 - fee)) / bars[0].c;
  const lump = bars.map((b) => lumpUnits * b.c);

  const mddOf = (eq) => {
    let peak = -Infinity, worst = 0;
    for (const v of eq) { if (v > peak) peak = v; if (peak > 0) worst = Math.min(worst, (v / peak - 1) * 100); }
    return worst;
  };

  return {
    ok: true,
    dates: bars.map((b) => b.t),
    dca, lump, dcaCost,
    total,
    months: buyDays.length,
    dcaEnd: dca[dca.length - 1],
    lumpEnd: lump[lump.length - 1],
    // 적립식은 넣은 돈이 시간에 따라 다르므로 단순 수익률로는 못 견준다.
    // 넣은 돈 대비 끝값으로 낸다 — 사람이 실제로 느끼는 것이 그것이다.
    dcaRet: (dca[dca.length - 1] / total - 1) * 100,
    lumpRet: (lump[lump.length - 1] / total - 1) * 100,
    dcaMdd: mddOf(dca),
    lumpMdd: mddOf(lump),
    // 평단가 — 적립식이 이기는 유일한 자리가 대개 여기다
    dcaAvg: total / dcaUnits,
    lumpAvg: bars[0].c,
  };
}

/* ─────────────── 성적 ─────────────── */

function score(equity, dates, start) {
  const end = equity[equity.length - 1];
  const years = Math.max(1 / 365, (dates[dates.length - 1] - dates[0]) / (365.25 * 86_400_000));

  let peak = -Infinity, mdd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.min(mdd, (v / peak - 1) * 100);
  }

  // 흔들림 — 하루 수익률의 표준편차를 한 해로 늘린다
  const rs = [];
  for (let i = 1; i < equity.length; i++) {
    if (equity[i - 1] > 0 && equity[i] > 0) rs.push(Math.log(equity[i] / equity[i - 1]));
  }
  const m = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
  const sd = rs.length > 1
    ? Math.sqrt(rs.reduce((a, r) => a + (r - m) ** 2, 0) / (rs.length - 1))
    : 0;

  return {
    start, end,
    ret: (end / start - 1) * 100,
    cagr: (Math.pow(end / start, 1 / years) - 1) * 100,
    mdd,
    vol: sd * Math.sqrt(252) * 100,
    years,
  };
}

function normWeights(weights, n) {
  const raw = (weights && weights.length === n)
    ? weights.map((x) => Math.max(0, Number(x) || 0))
    : new Array(n).fill(1);
  const sum = raw.reduce((a, b) => a + b, 0);
  return sum > 0 ? raw.map((x) => x / sum) : new Array(n).fill(1 / n);
}
