/* ═══════════════════════════════════════════════════════════════
   engine.js — 전략을 지난 시세에 대어 본다

   ── 이것이 무엇이 아닌가 ──
   먼저 이것부터 적어 둔다. 지난 시세에서 잘 들었다는 것은 앞으로도
   그러리라는 뜻이 아니다. 규칙을 이리저리 바꿔 가며 가장 좋은 숫자가
   나올 때까지 맞추면, 그것은 시장을 배운 것이 아니라 지나간 우연을
   외운 것이다. 그래서 이 엔진은 늘 '그냥 사서 들고 있었다면'을 나란히
   내놓는다. 그것을 이기지 못하는 전략은 아무것도 아니다.

   ── 셈하는 규칙 ──
   · 신호는 그날 종가로 판단하고, 다음 날 시가에 체결한다.
     같은 날 종가로 사고파는 것은 실제로는 할 수 없는 일이다.
   · 수수료와 미끄러짐(slippage)을 양쪽에 매긴다. 이것을 빼면
     자주 사고파는 전략이 실제보다 훨씬 좋아 보인다.
   · 살 때는 가진 돈을 전부 쓴다 (분할 매수는 다루지 않는다).
   · 공매도는 다루지 않는다. 없으면 쉰다.
   ═══════════════════════════════════════════════════════════════ */

import { compute } from '../market/indicators.js';

/* ─────────────── 견줄 대상 ─────────────── */

/**
 * 규칙의 한쪽에 놓을 수 있는 것들.
 *   price   그날 종가
 *   ind     지표의 줄 하나 (지표 id + 줄 key)
 *   const   그냥 숫자
 */
export const SOURCES = [
  { id: 'price', ko: '종가' },
  { id: 'ind', ko: '지표' },
  { id: 'const', ko: '숫자' },
];

/** 견주는 법 */
export const OPS = [
  { id: 'gt', ko: '보다 크다', sym: '>' },
  { id: 'lt', ko: '보다 작다', sym: '<' },
  { id: 'cross_up', ko: '위로 뚫는다', sym: '↗' },
  { id: 'cross_dn', ko: '아래로 뚫는다', sym: '↘' },
];

export const opById = (id) => OPS.find((o) => o.id === id) || OPS[0];

/* ─────────────── 값 꺼내기 ─────────────── */

/**
 * 규칙의 한쪽 값을 줄로 편다.
 * @returns {number[]|null} 봉과 같은 길이의 줄 (없는 자리는 null)
 */
function seriesOf(side, ctx) {
  if (!side) return null;
  if (side.src === 'price') return ctx.bars.map((b) => b.c);
  if (side.src === 'const') {
    const v = Number(side.value);
    return Number.isFinite(v) ? ctx.bars.map(() => v) : null;
  }
  if (side.src === 'ind') {
    const hit = ctx.lines.get(side.ind + '|' + side.line);
    return hit || null;
  }
  return null;
}

/** 규칙 하나가 그날 참인가 */
function holds(rule, i, ctx) {
  const a = seriesOf(rule.a, ctx);
  const b = seriesOf(rule.b, ctx);
  if (!a || !b) return false;

  const av = a[i], bv = b[i];
  if (av == null || bv == null) return false;

  switch (rule.op) {
    case 'gt': return av > bv;
    case 'lt': return av < bv;
    case 'cross_up': {
      const ap = a[i - 1], bp = b[i - 1];
      if (ap == null || bp == null) return false;
      return ap <= bp && av > bv;
    }
    case 'cross_dn': {
      const ap = a[i - 1], bp = b[i - 1];
      if (ap == null || bp == null) return false;
      return ap >= bp && av < bv;
    }
    default: return false;
  }
}

/** 규칙 여럿을 한꺼번에 — 모두 참(and) 이거나 하나라도 참(or) */
function all(rules, i, ctx, mode) {
  const list = (rules || []).filter((r) => r && r.a && r.b);
  if (!list.length) return false;
  return mode === 'or'
    ? list.some((r) => holds(r, i, ctx))
    : list.every((r) => holds(r, i, ctx));
}

/* ─────────────── 시험 ─────────────── */

/**
 * @param {object} strategy
 *   indicators  이 전략이 쓰는 지표들 (market/indicators.js 의 꼴)
 *   entry       사는 규칙들
 *   entryMode   'and' | 'or'
 *   exit        파는 규칙들
 *   exitMode    'and' | 'or'
 *   stopPct     이만큼 내리면 바로 판다 (0 이면 안 쓴다)
 *   takePct     이만큼 오르면 바로 판다 (0 이면 안 쓴다)
 *   feeBps      한 번 사고팔 때 드는 값 (만분율. 25 = 0.25%)
 *   cash        처음 가진 돈
 * @param {{c,o,h,l,t,v}[]} bars
 */
export function run(strategy, bars) {
  const s = normalize(strategy);
  if (!bars || bars.length < 30) {
    return { ok: false, why: '봉이 너무 적습니다. 기간을 넓혀 보십시오.' };
  }

  // 지표를 미리 다 셈해 두고 줄로 펴 놓는다
  const lines = new Map();
  const used = [];
  for (const ind of s.indicators) {
    const got = compute(ind, bars);
    if (!got) continue;
    used.push(got);
    for (const ln of got.out.lines) lines.set(ind.id + '|' + ln.key, ln.values);
    if (got.out.histogram) lines.set(ind.id + '|' + got.out.histogram.key, got.out.histogram.values);
  }
  const ctx = { bars, lines };

  const fee = s.feeBps / 10_000;
  let cash = s.cash;
  let shares = 0;
  let entryPx = 0;
  let entryAt = 0;

  const trades = [];
  const equity = new Array(bars.length).fill(null);
  const marks = [];          // 차트에 찍을 표 { i, kind:'buy'|'sell' }

  let pending = null;        // 다음 날 시가에 할 일

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    // ── 어제 정한 것을 오늘 시가에 치른다 ──
    if (pending) {
      const px = bar.o || bar.c;
      if (pending === 'buy' && shares === 0) {
        const spend = cash * (1 - fee);
        shares = spend / px;
        entryPx = px;
        entryAt = i;
        cash = 0;
        marks.push({ i, kind: 'buy', px });
      } else if (pending === 'sell' && shares > 0) {
        cash = shares * px * (1 - fee);
        trades.push({
          from: entryAt, to: i,
          inPx: entryPx, outPx: px,
          ret: (px / entryPx) - 1,
          days: Math.round((bar.t - bars[entryAt].t) / 86_400_000),
          why: pending === 'sell' ? (s.lastReason || '규칙') : '규칙',
        });
        shares = 0;
        marks.push({ i, kind: 'sell', px });
      }
      pending = null;
    }

    equity[i] = cash + shares * bar.c;

    // ── 오늘 종가를 보고 내일 할 일을 정한다 ──
    if (shares > 0) {
      const move = (bar.c / entryPx) - 1;
      if (s.stopPct > 0 && move <= -s.stopPct / 100) {
        pending = 'sell'; s.lastReason = '손절';
      } else if (s.takePct > 0 && move >= s.takePct / 100) {
        pending = 'sell'; s.lastReason = '익절';
      } else if (all(s.exit, i, ctx, s.exitMode)) {
        pending = 'sell'; s.lastReason = '규칙';
      }
    } else if (i < bars.length - 1 && all(s.entry, i, ctx, s.entryMode)) {
      pending = 'buy';
    }
  }

  // 마지막 날 들고 있으면 종가로 정리해 셈만 맞춘다 (팔지는 않는다)
  const last = bars[bars.length - 1];
  if (shares > 0) {
    trades.push({
      from: entryAt, to: bars.length - 1,
      inPx: entryPx, outPx: last.c,
      ret: (last.c / entryPx) - 1,
      days: Math.round((last.t - bars[entryAt].t) / 86_400_000),
      why: '보유 중',
      open: true,
    });
  }

  return { ok: true, ...report(equity, trades, bars, s), marks, indicators: used };
}

/* ─────────────── 성적 ─────────────── */

function report(equity, trades, bars, s) {
  const start = s.cash;
  const end = equity[equity.length - 1];
  const years = Math.max(
    1 / 365,
    (bars[bars.length - 1].t - bars[0].t) / (365.25 * 86_400_000),
  );

  const totalRet = end / start - 1;
  const cagr = Math.pow(end / start, 1 / years) - 1;

  // 가장 깊은 골 — 꼭대기에서 얼마나 내려갔었나
  let peak = -Infinity, mdd = 0, mddAt = 0;
  for (let i = 0; i < equity.length; i++) {
    const v = equity[i];
    if (v == null) continue;
    if (v > peak) peak = v;
    const dd = v / peak - 1;
    if (dd < mdd) { mdd = dd; mddAt = i; }
  }

  // 날마다의 등락으로 흔들림을 잰다
  const rets = [];
  for (let i = 1; i < equity.length; i++) {
    if (equity[i] == null || equity[i - 1] == null || equity[i - 1] === 0) continue;
    rets.push(equity[i] / equity[i - 1] - 1);
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const varc = rets.length
    ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length
    : 0;
  const vol = Math.sqrt(varc) * Math.sqrt(252);
  const sharpe = vol ? (mean * 252) / vol : 0;

  const closed = trades.filter((t) => !t.open);
  const wins = closed.filter((t) => t.ret > 0);
  const losses = closed.filter((t) => t.ret <= 0);
  const avgWin = wins.length ? wins.reduce((a, t) => a + t.ret, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, t) => a + t.ret, 0) / losses.length : 0;

  // 그냥 사서 들고 있었다면 — 이것을 못 이기면 아무것도 아니다
  const holdEnd = start * (bars[bars.length - 1].c / (bars[0].o || bars[0].c));
  const holdRet = holdEnd / start - 1;
  const holdCurve = bars.map((b) => start * (b.c / (bars[0].o || bars[0].c)));

  let hPeak = -Infinity, hMdd = 0;
  for (const v of holdCurve) {
    if (v > hPeak) hPeak = v;
    const dd = v / hPeak - 1;
    if (dd < hMdd) hMdd = dd;
  }

  // 시장에 실제로 나가 있던 날의 비율
  let inDays = 0;
  for (const t of trades) inDays += (t.to - t.from);
  const exposure = bars.length ? inDays / bars.length : 0;

  return {
    equity, holdCurve, trades,
    stats: {
      start, end, totalRet, cagr, mdd, mddAt, vol, sharpe, years,
      trades: trades.length, closed: closed.length,
      winRate: closed.length ? wins.length / closed.length : 0,
      avgWin, avgLoss,
      payoff: avgLoss ? Math.abs(avgWin / avgLoss) : 0,
      exposure,
      holdRet, holdEnd, holdMdd: hMdd,
      edge: totalRet - holdRet,
    },
  };
}

/* ─────────────── 손질 ─────────────── */

export function normalize(s) {
  return {
    indicators: Array.isArray(s?.indicators) ? s.indicators : [],
    entry: Array.isArray(s?.entry) ? s.entry : [],
    exit: Array.isArray(s?.exit) ? s.exit : [],
    entryMode: s?.entryMode === 'or' ? 'or' : 'and',
    exitMode: s?.exitMode === 'or' ? 'or' : 'and',
    stopPct: num(s?.stopPct, 0, 0, 90),
    takePct: num(s?.takePct, 0, 0, 500),
    feeBps: num(s?.feeBps, 25, 0, 300),
    cash: num(s?.cash, 10_000_000, 1000, 1e12),
    lastReason: '규칙',
  };
}

const num = (v, def, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, n));
};

/* ─────────────── 처음 보여 줄 전략 ───────────────
   가장 오래된 규칙 하나 — 짧은 평균이 긴 평균을 위로 뚫으면 사고,
   아래로 뚫으면 판다. 좋은 전략이라서가 아니라, 무엇을 만들 수 있는지
   한눈에 보여 주기에 좋아서 골랐다. */

export const SAMPLE = {
  name: '골든크로스',
  indicators: [
    { id: 'fast', kind: 'sma', on: true, color: 'gold', cfg: { period: 20 } },
    { id: 'slow', kind: 'sma', on: true, color: 'jade', cfg: { period: 60 } },
  ],
  entry: [{ a: { src: 'ind', ind: 'fast', line: 'ma' }, op: 'cross_up', b: { src: 'ind', ind: 'slow', line: 'ma' } }],
  exit: [{ a: { src: 'ind', ind: 'fast', line: 'ma' }, op: 'cross_dn', b: { src: 'ind', ind: 'slow', line: 'ma' } }],
  entryMode: 'and',
  exitMode: 'and',
  stopPct: 0,
  takePct: 0,
  feeBps: 25,
  cash: 10_000_000,
};

/** 규칙 하나를 사람의 말로 */
export function ruleText(rule, indicators) {
  const side = (x) => {
    if (!x) return '?';
    if (x.src === 'price') return '종가';
    if (x.src === 'const') return String(x.value ?? 0);
    const ind = (indicators || []).find((i) => i.id === x.ind);
    const base = ind ? nameOfInd(ind) : x.ind;
    return x.line && x.line !== 'ma' && x.line !== 'ema' && x.line !== 'rsi'
      ? base + '의 ' + x.line
      : base;
  };
  return side(rule.a) + ' 가 ' + side(rule.b) + ' ' + opById(rule.op).ko;
}

function nameOfInd(ind) {
  const vals = Object.values(ind.cfg || {}).join('·');
  const label = { sma: '이동평균', ema: '지수이동평균', boll: '볼린저', rsi: '상대강도', macd: 'MACD', vol: '거래량' }[ind.kind] || ind.kind;
  return vals ? label + ' ' + vals : label;
}
