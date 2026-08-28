/* ═══════════════════════════════════════════════════════════════
   rules.js — 조건을 걸어 종목을 거른다

   시험 화면(Δοκιμή)의 규칙은 "언제 사고 언제 파나" 를 묻는다. 지난
   시세에 대고 돌려 보는 것이라 시간이 흐른다.

   여기는 다르다. "지금 이 조건에 맞는 종목이 무엇인가" 를 묻는다.
   시간이 흐르지 않고, 오늘 하루의 상태만 본다.

   ── 왜 따로 만드나 ──
   같은 것으로 보이지만 답해야 하는 물음이 다르다. 백테스트 엔진은
   하루씩 걸어가며 돈을 세는데, 여기서는 마지막 하루의 값만 있으면
   된다. 엔진을 억지로 돌리면 종목 하나마다 오백 일을 걸어가게 되고,
   서른 종목이면 만오천 번이다. 마지막 값만 보면 서른 번이다.

   ── 조건마다 '왜' 를 함께 적는다 ──
   조건을 켜 놓고 몇 주가 지나면 왜 켰는지 잊는다. 잊은 채로 걸린
   종목을 보면 그것이 신호로 보인다. 각 조건이 무엇을 믿고 있는지,
   그 믿음이 언제 깨지는지를 화면에서 읽을 수 있어야 한다.
   ═══════════════════════════════════════════════════════════════ */

import { sma, ema, rsi } from '../market/indicators.js';
import { pressureNow } from '../market/intraday.js';

const last = (a) => (a?.length ? a[a.length - 1] : null);
const closes = (bars) => bars.map((b) => b.c);
const fin = (v) => typeof v === 'number' && isFinite(v);

/* ═══════════════════ 종목 하나의 상태 ═══════════════════

   조건마다 따로 셈하면 같은 이동평균을 열 번 구한다. 한 번에 다 재어
   두고 조건들은 그것을 읽기만 한다. */

export function measure(bars, { flow = null } = {}) {
  if (!bars || bars.length < 30) return null;

  const c = closes(bars);
  const px = last(c);
  if (!fin(px) || px <= 0) return null;

  const ma = {};
  for (const n of [5, 10, 20, 60, 120, 200]) {
    ma[n] = bars.length >= n ? last(sma(c, n)) : null;
  }

  /* ── 이평선이 모여 있나 ──
     5·20·60 이 서로 몇 % 안에 들어와 있는지. 좁을수록 값이 한자리에
     오래 머문 것이고, 그 뒤에는 대개 한쪽으로 크게 움직인다.

     ── 다만 ──
     '모였다' 는 것은 방향을 말해 주지 않는다. 위로 터질지 아래로 터질지
     이 숫자는 모른다. 그것을 아는 척하면 그때부터 이 숫자는 거짓말이 된다. */
  const set = [ma[5], ma[20], ma[60]].filter(fin);
  const spread = set.length === 3
    ? (Math.max(...set) - Math.min(...set)) / px * 100
    : null;

  /* ── 정배열 · 역배열 ── */
  const align = (fin(ma[5]) && fin(ma[20]) && fin(ma[60]))
    ? (ma[5] > ma[20] && ma[20] > ma[60] ? 'up'
      : ma[5] < ma[20] && ma[20] < ma[60] ? 'down' : 'mix')
    : null;

  /* ── 교차 ──
     며칠 전에 일어났는지까지 센다. "오늘 골든크로스" 와 "3주 전
     골든크로스" 는 전혀 다른 소식인데, 났다/안 났다로만 두면 같아진다. */
  const cross = crossAge(c, 5, 20);
  const crossLong = crossAge(c, 20, 60);

  const r = bars.length >= 20 ? last(rsi(c, 14)) : null;

  /* ── 이격도 ── */
  const gap20 = fin(ma[20]) ? (px / ma[20] - 1) * 100 : null;
  const gap60 = fin(ma[60]) ? (px / ma[60] - 1) * 100 : null;

  /* ── 거래량 ── */
  const vols = bars.map((b) => b.v || 0).filter((v) => v > 0);
  const vAvg = vols.length >= 20
    ? vols.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.min(20, vols.length - 1)
    : null;
  const vNow = last(vols);
  const volMul = fin(vAvg) && vAvg > 0 && fin(vNow) ? vNow / vAvg : null;

  /* ── 한 해 폭 안의 자리 ── */
  const win = bars.slice(-252);
  const hi = Math.max(...win.map((b) => b.h ?? b.c));
  const lo = Math.min(...win.map((b) => b.l ?? b.c));
  const pos = hi > lo ? ((px - lo) / (hi - lo)) * 100 : null;

  /* ── 체결 강도 ──
     봉 안에서 값이 위쪽에 붙어 끝났나 아래쪽에 붙어 끝났나. 일봉으로도
     셀 수 있지만 분봉이 있으면 그쪽이 훨씬 곱다. */
  const press = pressureNow(bars, 20);

  const prev = c.length > 1 ? c[c.length - 2] : null;
  const chg = fin(prev) && prev > 0 ? (px / prev - 1) * 100 : null;

  /* ── 볼린저 ── */
  const n = 20;
  let bb = null;
  if (bars.length >= n) {
    const w = c.slice(-n);
    const m = w.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / n);
    if (sd > 0) bb = { pos: (px - (m - 2 * sd)) / (4 * sd) * 100, width: (4 * sd) / m * 100 };
  }

  /* ── MACD ── */
  let macd = null;
  if (bars.length >= 35) {
    const e12 = ema(c, 12), e26 = ema(c, 26);
    const line = c.map((_, i) => (fin(e12[i]) && fin(e26[i]) ? e12[i] - e26[i] : null));
    const sig = ema(line.map((v) => (fin(v) ? v : 0)), 9);
    const L = last(line), S = last(sig);
    if (fin(L) && fin(S)) macd = { line: L, signal: S, hist: L - S, above: L > S };
  }

  /* ── 투자주체 ──
     국내 종목에만 있다. 최근 닷새를 합쳐 본다 — 하루치는 잡음이 크다. */
  let flows = null;
  if (flow?.rows?.length >= 3) {
    const five = flow.rows.slice(-5);
    const sum = (k) => five.reduce((a, b) => a + (b[k] || 0), 0);
    flows = {
      foreign: sum('foreign'), inst: sum('inst'), indiv: sum('indiv'),
      days: five.length,
      holdPct: last(flow.rows.map((r) => r.holdPct).filter(fin)),
    };
  }

  return { px, chg, ma, spread, align, cross, crossLong, rsi: r, gap20, gap60,
    volMul, pos, press, bb, macd, flows, bars: bars.length };
}

/* 며칠 전에 짧은 선이 긴 선을 넘었나.
   위로 넘었으면 양수, 아래로 넘었으면 음수, 없으면 null. */
function crossAge(c, shortN, longN, look = 40) {
  if (c.length < longN + 3) return null;
  const s = sma(c, shortN), l = sma(c, longN);
  const from = Math.max(longN, c.length - look);
  for (let i = c.length - 1; i > from; i--) {
    const a0 = s[i - 1], b0 = l[i - 1], a1 = s[i], b1 = l[i];
    if (![a0, b0, a1, b1].every(fin)) continue;
    if (a0 <= b0 && a1 > b1) return c.length - 1 - i + 1;      // 골든
    if (a0 >= b0 && a1 < b1) return -(c.length - 1 - i + 1);   // 데드
  }
  return null;
}

/* ═══════════════════ 조건들 ═══════════════════

   test(m, cfg) 가 true 를 내면 걸린 것이다.
   say(m, cfg) 는 왜 걸렸는지 한 줄. */

export const RULES = [
  {
    id: 'golden', ko: '골든크로스', gr: 'Χρυσοῦς',
    why: '5일선이 20일선을 위로 뚫었습니다.',
    belief: '짧은 흐름이 긴 흐름을 넘으면 그 뒤로도 한동안 같은 쪽으로 간다.',
    breaks: '옆으로 기는 장에서는 넘고 되넘기를 되풀이해, 걸릴 때마다 사면 수수료만 나갑니다.',
    cfg: { within: 5 },
    fields: [{ k: 'within', ko: '며칠 안', min: 1, max: 40, step: 1 }],
    test: (m, c) => m.cross != null && m.cross > 0 && m.cross <= c.within,
    say: (m) => m.cross === 1 ? '오늘 뚫었습니다' : `${m.cross}일 전에 뚫었습니다`,
  },
  {
    id: 'dead', ko: '데드크로스', gr: 'Νεκρός',
    why: '5일선이 20일선을 아래로 뚫었습니다.',
    belief: '짧은 흐름이 긴 흐름 아래로 내려가면 한동안 눌린다.',
    breaks: '바닥에서도 걸립니다. 가장 크게 오르기 직전에 걸리는 일이 드물지 않습니다.',
    cfg: { within: 5 },
    fields: [{ k: 'within', ko: '며칠 안', min: 1, max: 40, step: 1 }],
    test: (m, c) => m.cross != null && m.cross < 0 && -m.cross <= c.within,
    say: (m) => (m.cross === -1 ? '오늘 무너졌습니다' : `${-m.cross}일 전에 무너졌습니다`),
  },
  {
    id: 'squeeze', ko: '이평선이 모였다', gr: 'Σύγκλισις',
    why: '5·20·60일선이 서로 가까이 붙어 있습니다.',
    belief: '값이 한자리에 오래 머물면 그 뒤에 크게 움직인다.',
    breaks: '어느 쪽으로 터질지는 말해 주지 않습니다. 모였다는 것만으로 사는 것은 동전 던지기입니다.',
    cfg: { max: 2 },
    fields: [{ k: 'max', ko: '벌어짐 %', min: 0.3, max: 10, step: 0.1 }],
    test: (m, c) => fin(m.spread) && m.spread <= c.max,
    say: (m) => `세 선이 ${m.spread.toFixed(2)}% 안에 모여 있습니다`,
  },
  {
    id: 'align', ko: '정배열', gr: 'Τάξις',
    why: '5 > 20 > 60 순서로 서 있습니다.',
    belief: '오르는 것이 계속 오른다.',
    breaks: '이미 많이 오른 뒤에 걸립니다 — 정배열은 결과이지 예고가 아닙니다.',
    cfg: {},
    fields: [],
    test: (m) => m.align === 'up',
    say: () => '5 > 20 > 60 으로 서 있습니다',
  },
  {
    id: 'alignDown', ko: '역배열', gr: 'Ἀταξία',
    why: '5 < 20 < 60 순서로 서 있습니다.',
    belief: '내리는 것이 계속 내린다.',
    breaks: '바닥을 지나고도 한동안 유지됩니다.',
    cfg: {},
    fields: [],
    test: (m) => m.align === 'down',
    say: () => '5 < 20 < 60 으로 서 있습니다',
  },
  {
    id: 'rsiLow', ko: '상대강도 낮음', gr: 'Ἀσθένεια',
    why: '최근 오른 폭보다 내린 폭이 훨씬 큽니다.',
    belief: '너무 많이 내린 것은 되돌아온다.',
    breaks: '정말로 나빠지는 중일 때도 낮습니다. 30 아래에서 더 내려가는 일이 흔합니다.',
    cfg: { max: 30 },
    fields: [{ k: 'max', ko: '이 값 아래', min: 5, max: 50, step: 1 }],
    test: (m, c) => fin(m.rsi) && m.rsi <= c.max,
    say: (m) => `상대강도 ${m.rsi.toFixed(0)}`,
  },
  {
    id: 'rsiHigh', ko: '상대강도 높음', gr: 'Ὑπερβολή',
    why: '최근 내린 폭보다 오른 폭이 훨씬 큽니다.',
    belief: '너무 많이 오른 것은 쉰다.',
    breaks: '가장 크게 오르는 구간에서는 몇 달 내내 70 위에 머뭅니다.',
    cfg: { min: 70 },
    fields: [{ k: 'min', ko: '이 값 위', min: 50, max: 95, step: 1 }],
    test: (m, c) => fin(m.rsi) && m.rsi >= c.min,
    say: (m) => `상대강도 ${m.rsi.toFixed(0)}`,
  },
  {
    id: 'volBurst', ko: '거래량이 터졌다', gr: 'Ὄγκος',
    why: '오늘 거래량이 최근 스무 날 평균보다 훨씬 많습니다.',
    belief: '사람이 몰린 자리에서 값이 갈린다.',
    breaks: '무엇 때문에 몰렸는지는 말해 주지 않습니다. 좋은 소식일 수도 나쁜 소식일 수도 있습니다.',
    cfg: { mul: 2 },
    fields: [{ k: 'mul', ko: '평균의 몇 배', min: 1.2, max: 10, step: 0.1 }],
    test: (m, c) => fin(m.volMul) && m.volMul >= c.mul,
    say: (m) => `평소의 ${m.volMul.toFixed(1)}배`,
  },
  {
    id: 'press', ko: '체결 강도', gr: 'Πίεσις',
    why: '봉 안에서 값이 위쪽에 붙어 끝나고 있습니다.',
    belief: '살려는 쪽이 밀어 올리고 있으면 그 힘이 며칠 간다.',
    breaks: '거래가 적은 종목에서는 한두 건에 크게 흔들립니다.',
    cfg: { min: 20 },
    fields: [{ k: 'min', ko: '이 값 위', min: -100, max: 100, step: 5 }],
    test: (m, c) => fin(m.press) && m.press >= c.min,
    say: (m) => `체결 강도 ${m.press.toFixed(0)}`,
  },
  {
    id: 'nearHigh', ko: '한 해 꼭대기 가까이', gr: 'Κορυφή',
    why: '최근 한 해 폭의 위쪽에 있습니다.',
    belief: '새 꼭대기를 치는 것은 힘이 있다는 뜻이다.',
    breaks: '꼭대기에서 사는 것이므로 틀렸을 때 물러설 자리가 멉니다.',
    cfg: { min: 90 },
    fields: [{ k: 'min', ko: '폭의 몇 % 위', min: 50, max: 100, step: 1 }],
    test: (m, c) => fin(m.pos) && m.pos >= c.min,
    say: (m) => `한 해 폭의 ${m.pos.toFixed(0)}% 자리`,
  },
  {
    id: 'nearLow', ko: '한 해 바닥 가까이', gr: 'Πυθμήν',
    why: '최근 한 해 폭의 아래쪽에 있습니다.',
    belief: '싸게 사면 덜 잃는다.',
    breaks: '바닥처럼 보이는 자리가 중간이었던 적이 훨씬 많습니다.',
    cfg: { max: 10 },
    fields: [{ k: 'max', ko: '폭의 몇 % 아래', min: 0, max: 50, step: 1 }],
    test: (m, c) => fin(m.pos) && m.pos <= c.max,
    say: (m) => `한 해 폭의 ${m.pos.toFixed(0)}% 자리`,
  },
  {
    id: 'macdUp', ko: 'MACD 가 신호 위', gr: 'Σῆμα',
    why: 'MACD 선이 신호선 위에 있습니다.',
    belief: '흐름이 위쪽으로 돌아섰다.',
    breaks: '옆으로 기는 장에서 자주 오갑니다.',
    cfg: {},
    fields: [],
    test: (m) => !!m.macd?.above,
    say: (m) => `막대 ${m.macd.hist >= 0 ? '+' : ''}${m.macd.hist.toFixed(2)}`,
  },
  {
    id: 'bbLow', ko: '띠 아래쪽', gr: 'Ζώνη',
    why: '볼린저 밴드의 아래쪽에 붙어 있습니다.',
    belief: '띠를 벗어난 값은 가운데로 돌아온다.',
    breaks: '띠 아래를 타고 계속 내려가는 구간이 있습니다.',
    cfg: { max: 10 },
    fields: [{ k: 'max', ko: '띠의 몇 % 아래', min: 0, max: 50, step: 1 }],
    test: (m, c) => fin(m.bb?.pos) && m.bb.pos <= c.max,
    say: (m) => `띠의 ${m.bb.pos.toFixed(0)}% 자리`,
  },
  {
    id: 'gapFar', ko: '이평선에서 멀다', gr: 'Ἀπόστασις',
    why: '20일선에서 크게 벌어져 있습니다.',
    belief: '멀리 간 값은 선으로 돌아온다.',
    breaks: '방향을 가리지 않습니다 — 위로 멀어진 것과 아래로 멀어진 것은 다른 일입니다.',
    cfg: { min: 10 },
    fields: [{ k: 'min', ko: '벌어짐 % 이상', min: 2, max: 50, step: 1 }],
    test: (m, c) => fin(m.gap20) && Math.abs(m.gap20) >= c.min,
    say: (m) => `20일선에서 ${m.gap20 > 0 ? '+' : ''}${m.gap20.toFixed(1)}%`,
  },

  /* ── 투자주체 — 국내 종목에만 있다 ── */
  {
    id: 'foreignBuy', ko: '외국인이 사고 있다', gr: 'Ξένοι', kr: true,
    why: '최근 닷새 외국인 순매수가 플러스입니다.',
    belief: '외국인이 꾸준히 사면 값이 따라간다.',
    breaks: '지수 편입이나 환헤지 때문에 사는 일도 많습니다 — 그것은 그 종목을 좋게 본 것이 아닙니다.',
    cfg: {},
    fields: [],
    test: (m) => (m.flows?.foreign || 0) > 0,
    say: (m) => `닷새 순매수 ${fmtQty(m.flows.foreign)}`,
  },
  {
    id: 'instBuy', ko: '기관이 사고 있다', gr: 'Θεσμοί', kr: true,
    why: '최근 닷새 기관 순매수가 플러스입니다.',
    belief: '기관은 나눠 사므로 한 번 사기 시작하면 여러 날 이어진다.',
    breaks: '연기금의 기계적 매수와 운용사의 판단이 한 칸에 섞여 있습니다.',
    cfg: {},
    fields: [],
    test: (m) => (m.flows?.inst || 0) > 0,
    say: (m) => `닷새 순매수 ${fmtQty(m.flows.inst)}`,
  },
  {
    id: 'indivSell', ko: '개인이 팔고 있다', gr: 'Ἴδιοι', kr: true,
    why: '최근 닷새 개인 순매수가 마이너스입니다.',
    belief: '개인이 파는 쪽에 서 있으면 그 반대편이 옳았던 적이 많다.',
    breaks: '개인의 매도는 값이 오를 때 이익을 실현하는 것이기도 합니다 — 늘 틀린 쪽인 것은 아닙니다.',
    cfg: {},
    fields: [],
    test: (m) => (m.flows?.indiv || 0) < 0,
    say: (m) => `닷새 순매도 ${fmtQty(-m.flows.indiv)}`,
  },
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

function fmtQty(v) {
  const a = Math.abs(v);
  if (a >= 1e8) return (v / 1e8).toFixed(1) + '억주';
  if (a >= 1e4) return (v / 1e4).toFixed(1) + '만주';
  return Math.round(v).toLocaleString('ko-KR') + '주';
}

/* ═══════════════════ 걸러 내기 ═══════════════════

   ── 왜 '모두 참' 과 '하나라도 참' 을 나누나 ──
   조건 여섯을 모두 걸면 대개 아무것도 안 걸린다. 그러면 사람은 조건을
   하나씩 끄다가 결국 하나만 남긴다. '하나라도 참' 을 두면 넓게 훑고서
   좁혀 갈 수 있다.

   ── 몇 개가 걸렸는지도 함께 낸다 ──
   '하나라도 참' 으로 볼 때 셋이 걸린 종목과 하나만 걸린 종목은 다르다.
   그 수로 줄을 세운다. */
export function screen(list, picked, { mode = 'all' } = {}) {
  const on = picked.filter((p) => p.on !== false);
  const out = [];

  for (const item of list) {
    const m = item.m;
    if (!m) continue;

    const hits = [];
    const missed = [];
    for (const p of on) {
      const rule = ruleById(p.id);
      if (!rule) continue;
      // 국내 전용 조건인데 자료가 없으면 '못 봤다' 로 둔다 — 틀렸다가 아니다
      if (rule.kr && !m.flows) { missed.push({ rule, unknown: true }); continue; }
      let ok = false;
      try { ok = !!rule.test(m, { ...rule.cfg, ...p.cfg }); } catch { ok = false; }
      if (ok) hits.push({ rule, say: safeSay(rule, m) });
      else missed.push({ rule });
    }

    const pass = mode === 'all'
      ? on.length > 0 && hits.length === on.length
      : hits.length > 0;

    if (pass) out.push({ ...item, hits, missed, score: hits.length });
  }

  out.sort((a, b) => b.score - a.score || (b.m.chg ?? -99) - (a.m.chg ?? -99));
  return out;
}

function safeSay(rule, m) {
  try { return rule.say(m); } catch { return ''; }
}
