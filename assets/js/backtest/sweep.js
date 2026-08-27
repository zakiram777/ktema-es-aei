/* ═══════════════════════════════════════════════════════════════
   sweep.js — 좋아 보이는 숫자가 우연인지 가려낸다

   이 사이트는 전략 시험 화면에 이렇게 적어 두었다.

     "숫자가 좋아질 때까지 규칙을 고치면, 그것은 시장을 배운 것이
      아니라 지나간 우연을 외운 것입니다."

   경고문은 아무도 안 읽는다. 그림은 본다. 여기서 하는 일은 그
   경고를 그림으로 바꾸는 것이다.

   ── 지도 ──
   파라미터 둘을 격자로 돌려 성적을 색으로 칠한다.

     봉우리가 넓고 완만하면    20일이든 22일이든 비슷하게 된다는 뜻
     봉우리가 뾰족하면          21일에만 되고 20일과 22일은 안 된다는 뜻

   뒤엣것은 시장의 성질이 아니다. 지나간 값의 우연이다. 다음 해에
   그 봉우리는 다른 자리로 옮겨 가 있다.

   ── 워크포워드 ──
   구간을 앞뒤로 자른다. 앞에서 가장 좋았던 값을 골라, 뒤에서 그 값
   그대로 시험한다. 뒤에서도 되면 배운 것이고, 앞에서만 되면 외운
   것이다.

   이것을 통과하는 전략은 드물다. 드문 것이 정상이다.
   ═══════════════════════════════════════════════════════════════ */

import { run } from './engine.js';

/* 성적을 무엇으로 재어 색칠할 것인가.

   engine.js 의 report() 는 수익과 낙폭을 소수로 낸다 (0.23 = 23%).
   화면에 뜰 때 백 배 되는데, 여기서 그 사실을 잊으면 "낙폭이 0.5%
   넘는 것만" 같은 문턱이 통째로 어긋난다 — 실제로 그래서 한 칸도
   안 남은 적이 있다. 그래서 여기서 백분율로 고쳐 두고, 단위도 함께
   들고 다닌다. */
export const SCORES = [
  { id: 'calmar', ko: '수익 ÷ 낙폭', unit: '',
    note: '연평균 수익을 최대 낙폭으로 나눈 것. 견딜 수 있는지까지 본다.',
    pick: (r) => {
      const s = r.stats;
      if (!s || !(Math.abs(s.mdd) > 0.005)) return null;   // 낙폭 0.5% 미만은 못 믿는다
      return (s.cagr * 100) / Math.abs(s.mdd * 100);
    } },
  { id: 'cagr',   ko: '연평균 수익', unit: '%',
    pick: (r) => (r.stats ? r.stats.cagr * 100 : null) },
  { id: 'edge',   ko: '들고 있기와의 차', unit: '%p',
    note: '그냥 사서 들고 있었을 때보다 얼마나 나았나. 이것이 음수면 전략이 해로웠다.',
    pick: (r) => (r.stats ? r.stats.edge * 100 : null) },
  { id: 'sharpe', ko: '샤프', unit: '',
    pick: (r) => r.stats?.sharpe },
  { id: 'mdd',    ko: '최대 낙폭', unit: '%',
    note: '작을수록 좋은 값이라 색이 뒤집혀 보입니다.',
    pick: (r) => (r.stats ? r.stats.mdd * 100 : null) },
];

export const scoreById = (id) => SCORES.find((s) => s.id === id) || SCORES[0];

/**
 * 전략에서 숫자를 바꿔 볼 수 있는 자리를 모두 찾아낸다.
 *
 * 지표의 기간(이동평균 20일 같은 것)과 지킴이(손절·익절)가 후보다.
 * 사람이 직접 고르게 하는 대신 있는 것을 다 보여 주고 둘만 고르게
 * 한다 — 무엇을 바꿀 수 있는지부터 모르는 경우가 많다.
 */
export function knobs(strategy) {
  const out = [];

  for (const ind of strategy.indicators || []) {
    for (const [key, val] of Object.entries(ind.cfg || {})) {
      if (typeof val !== 'number') continue;
      out.push({
        id: `ind:${ind.id}:${key}`,
        ko: `${ind.id} · ${key}`,
        value: val,
        min: Math.max(2, Math.round(val * 0.4)),
        max: Math.round(val * 2.2),
        set: (s, v) => {
          const t = s.indicators.find((x) => x.id === ind.id);
          if (t) t.cfg[key] = v;
        },
      });
    }
  }

  for (const [key, ko] of [['stopPct', '손절 %'], ['takePct', '익절 %']]) {
    const val = strategy[key] || 0;
    out.push({
      id: 'g:' + key,
      ko,
      value: val,
      min: 0,
      max: Math.max(20, Math.round((val || 10) * 2)),
      set: (s, v) => { s[key] = v; },
    });
  }

  return out;
}

/** 처음과 끝 사이를 정해진 개수로 고르게 나눈 정수들 */
export function steps(min, max, count) {
  const out = [];
  const n = Math.max(2, Math.min(24, count));
  for (let i = 0; i < n; i++) {
    const v = Math.round(min + ((max - min) * i) / (n - 1));
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * 격자로 돌린다.
 *
 * @param {object} strategy
 * @param {Array} bars
 * @param {{x:object, y:object, xs:number[], ys:number[], score:string}} plan
 * @param {(done:number, total:number)=>void} onStep
 */
export function grid(strategy, bars, plan, onStep) {
  const { x, y, xs, ys } = plan;
  const pick = scoreById(plan.score).pick;

  const cells = [];
  let lo = Infinity, hi = -Infinity;
  let best = null;
  let done = 0;
  const total = xs.length * ys.length;

  for (let yi = 0; yi < ys.length; yi++) {
    const row = [];
    for (let xi = 0; xi < xs.length; xi++) {
      const s = JSON.parse(JSON.stringify(strategy));
      x.set(s, xs[xi]);
      y.set(s, ys[yi]);

      const r = run(s, bars);
      const v = r.ok ? pick(r) : null;
      row.push(v);

      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
        if (!best || v > best.v) best = { v, x: xs[xi], y: ys[yi], report: r };
      }
      done += 1;
      onStep?.(done, total);
    }
    cells.push(row);
  }

  return {
    ok: Number.isFinite(lo),
    xs, ys, cells, lo, hi, best,
    xLabel: x.ko, yLabel: y.ko,
    score: plan.score,
    // 봉우리가 얼마나 뾰족한가 — 이 판에서 사람이 정말로 알아야 할 숫자다
    sharpness: sharpness(cells, best, xs, ys),
  };
}

/* ─────────────── 봉우리의 뾰족함 ───────────────

   가장 좋았던 칸의 둘레 여덟 칸이 그 칸에 얼마나 못 미치는가.

   0에 가까우면 둘레도 비슷하게 좋다 — 넓은 봉우리다. 파라미터를
   조금 어긋나게 잡아도 비슷하게 된다는 뜻이고, 그런 것이 쓸 만하다.

   1에 가까우면 그 칸만 솟아 있다. 다음 해에는 그 자리에 없다. */
function sharpness(cells, best, xs, ys) {
  if (!best) return null;

  const yi = ys.indexOf(best.y);
  const xi = xs.indexOf(best.x);
  if (yi < 0 || xi < 0) return null;

  const around = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const v = cells[yi + dy]?.[xi + dx];
      if (Number.isFinite(v)) around.push(v);
    }
  }
  if (around.length < 3) return null;

  const avg = around.reduce((a, b) => a + b, 0) / around.length;
  const span = Math.abs(best.v);
  if (!(span > 0)) return null;
  return Math.max(0, Math.min(1, (best.v - avg) / span));
}

/* ─────────────── 워크포워드 ───────────────

   앞 절반에서 가장 좋았던 값을 고르고, 뒤 절반에서 그 값 그대로
   시험한다. 고르는 일과 시험하는 일이 같은 자료를 쓰면 안 된다 —
   시험 문제를 보고 공부한 것과 같다.

   나누는 자리는 기본이 70%다. 앞이 너무 짧으면 고를 근거가 없고,
   뒤가 너무 짧으면 시험이 안 된다.
*/
export function walkForward(strategy, bars, plan, splitAt = 0.7) {
  const cut = Math.floor(bars.length * splitAt);
  if (cut < 60 || bars.length - cut < 60) {
    return { ok: false, why: '봉이 모자랍니다. 앞뒤로 각각 예순 개는 있어야 합니다.' };
  }

  const head = bars.slice(0, cut);
  const tail = bars.slice(cut);

  const inSample = grid(strategy, head, plan);
  if (!inSample.ok || !inSample.best) {
    return { ok: false, why: '앞 구간에서 성한 결과가 나오지 않았습니다.' };
  }

  // 앞에서 고른 값 그대로 뒤에서
  const chosen = JSON.parse(JSON.stringify(strategy));
  plan.x.set(chosen, inSample.best.x);
  plan.y.set(chosen, inSample.best.y);
  const out = run(chosen, tail);

  // 견줄 것 — 뒤 구간에서 가장 좋았을 값 (알 수 없었던 값이다)
  const hind = grid(strategy, tail, plan);

  const pick = scoreById(plan.score).pick;
  const gotOut = out.ok ? pick(out) : null;
  const bestOut = hind.best ? hind.best.v : null;

  return {
    ok: true,
    cutAt: bars[cut].t,
    headLen: head.length,
    tailLen: tail.length,
    // 뒤 구간에서 한 번도 안 샀으면 점수가 안 나온다. 그것은 실패가
    // 아니라 결과이므로, 빈칸으로 두지 말고 그렇다고 말해야 한다.
    outTrades: out.ok ? (out.trades?.length ?? 0) : 0,
    outWhy: out.ok ? null : out.why,
    chosen: { x: inSample.best.x, y: inSample.best.y },
    inSampleScore: inSample.best.v,
    outSampleScore: gotOut,
    bestPossible: bestOut,
    outReport: out,
    inSample,
    // 앞에서 고른 값이 뒤에서 최선의 몇 할이었나. 1에 가까우면 잘 골랐고,
    // 0 이하면 앞에서 배운 것이 뒤에서는 오히려 해로웠다는 뜻이다.
    carry: (Number.isFinite(gotOut) && Number.isFinite(bestOut) && Math.abs(bestOut) > 1e-9)
      ? gotOut / bestOut
      : null,
  };
}
