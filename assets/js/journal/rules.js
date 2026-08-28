/* ═══════════════════════════════════════════════════════════════
   rules.js — 내가 내 규칙을 지켰나

   일지 성적표는 "판단이 맞았나" 를 채점한다. 이것은 다른 것을 묻는다.

     내가 적어 둔 대로 했나.

   대부분의 손실은 규칙이 틀려서가 아니라 안 지켜서 난다. 그리고 안
   지킨 것은 기억에 안 남는다 — 지켰다면 어땠을지를 모르기 때문이다.
   사이트는 값을 알고 있으므로 그것을 셈해 줄 수 있다.

   ── 왜 글에서 뽑아내지 않나 ──
   "−10%면 판다" 를 글에서 알아채게 만들 수도 있었다. 그런데 한국어
   문장에서 규칙을 뽑는 일은 늘 반쯤만 맞는다. 반쯤 맞는 것을 근거로
   "당신은 규칙을 어겼습니다" 라고 말하면, 틀렸을 때 그 말이 아주
   나쁘다.

   그래서 규칙은 손으로 또렷하게 건다. 대신 일지 글에 붙일 수 있게
   해서, 왜 그 규칙을 세웠는지는 글에 남는다.

   ── 무엇을 셈하나 ──
   규칙을 건 날부터 지금까지의 봉을 훑어, 조건이 처음 참이 된 날을
   찾는다. 그날 그대로 했다면 지금과 얼마나 달랐는지를 낸다.

   그 숫자가 늘 "지켰으면 좋았다" 로 나오지는 않는다. 규칙을 어겨서
   이득을 본 경우도 그대로 보여 준다 — 그것도 사실이고, 그 사실을
   숨기면 이 판은 잔소리가 된다.
   ═══════════════════════════════════════════════════════════════ */

import * as store from '../core/store.js';
import * as journal from './journal.js';
import { nameOf } from '../market/symbols.js';

const KEY = 'rules';

/** 무엇을 견주나 */
export const WHATS = [
  { id: 'price',   ko: '값이',           unit: '' },
  { id: 'fromBuy', ko: '산 값에서',       unit: '%', needsBase: true },
  { id: 'fromSet', ko: '규칙 건 날에서', unit: '%' },
  { id: 'ma',      ko: '이동평균선을',    unit: '일', ma: true },
  { id: 'peak',    ko: '꼭대기에서',      unit: '%' },
];

export const OPS = [
  { id: 'lte', ko: '아래로 내려가면', test: (v, x) => v <= x },
  { id: 'gte', ko: '위로 올라가면',   test: (v, x) => v >= x },
];

/** 그러면 무엇을 하기로 했나 */
export const ACTIONS = [
  { id: 'sell', ko: '판다',      tone: 'down' },
  { id: 'buy',  ko: '더 산다',   tone: 'up' },
  { id: 'look', ko: '들여다본다', tone: 'flat' },
];

export const whatById = (id) => WHATS.find((w) => w.id === id) || WHATS[0];
export const opById = (id) => OPS.find((o) => o.id === id) || OPS[0];
export const actionById = (id) => ACTIONS.find((a) => a.id === id) || ACTIONS[0];

/* ─────────────── 들고 나기 ─────────────── */

export function all() {
  const raw = store.get(KEY);
  return Array.isArray(raw) ? raw : [];
}

export function save(rule) {
  const list = all();
  const now = Date.now();

  const clean = {
    id: rule.id || 'r' + now.toString(36),
    at: rule.at || now,
    symbol: String(rule.symbol || '').trim().toUpperCase(),
    ko: rule.ko || nameOf(rule.symbol),
    what: whatById(rule.what).id,
    op: opById(rule.op).id,
    value: Number(rule.value),
    action: actionById(rule.action).id,
    note: String(rule.note || '').trim().slice(0, 200),
    journalId: rule.journalId || null,
    base: Number(rule.base) || null,        // '산 값에서' 일 때의 기준값
    done: !!rule.done,                      // 사람이 직접 껐나
    at0: rule.at0 ?? null,                  // 규칙 건 날의 값
  };

  if (!clean.symbol || !Number.isFinite(clean.value)) return null;

  const at = list.findIndex((x) => x.id === clean.id);
  if (at >= 0) list[at] = clean;
  else list.unshift(clean);

  store.set(KEY, list);
  return clean;
}

export function remove(id) {
  store.set(KEY, all().filter((x) => x.id !== id));
}

export function toggle(id) {
  const list = all();
  const r = list.find((x) => x.id === id);
  if (!r) return;
  r.done = !r.done;
  store.set(KEY, list);
}

/* ═══════════════════ 지켰나 ═══════════════════ */

/**
 * 규칙 하나를 봉에 대어 본다.
 *
 * @param {object} rule
 * @param {Array} bars   규칙 건 날보다 앞에서부터의 봉
 * @returns {{state, firstAt, firstPx, nowPx, missed, ...}}
 */
export function check(rule, bars) {
  if (!bars?.length) return { state: 'nodata', why: '시세가 없습니다.' };

  const after = bars.filter((b) => b.t >= startOfDay(rule.at));
  if (after.length < 2) return { state: 'young', why: '건 지 얼마 안 됐습니다.' };

  const w = whatById(rule.what);
  const op = opById(rule.op);
  const nowPx = bars[bars.length - 1].c;

  // 규칙을 건 날의 값 — 기준이 되는 것들이 여기서 나온다
  const at0 = rule.at0 ?? after[0].c;

  // 견줄 값을 날마다 만든다
  const seriesOf = () => {
    if (w.id === 'price') return after.map((b) => ({ t: b.t, v: b.c, px: b.c }));
    if (w.id === 'fromSet') return after.map((b) => ({ t: b.t, v: (b.c / at0 - 1) * 100, px: b.c }));
    if (w.id === 'fromBuy') {
      const base = rule.base || at0;
      return after.map((b) => ({ t: b.t, v: (b.c / base - 1) * 100, px: b.c }));
    }
    if (w.id === 'peak') {
      let peak = -Infinity;
      return after.map((b) => {
        if (b.c > peak) peak = b.c;
        return { t: b.t, v: (b.c / peak - 1) * 100, px: b.c };
      });
    }
    if (w.id === 'ma') {
      // 이동평균은 규칙 앞의 봉이 있어야 셈해진다. 전체에서 재고 잘라 쓴다.
      const n = Math.max(2, Math.round(rule.value));
      const line = sma(bars.map((b) => b.c), n);
      const from = bars.length - after.length;
      return after.map((b, i) => {
        const m = line[from + i];
        return { t: b.t, v: m == null ? null : b.c - m, px: b.c, ma: m };
      });
    }
    return [];
  };

  const series = seriesOf();
  // 이동평균은 값이 아니라 선을 넘었나로 본다 — 문턱은 0이다
  const threshold = w.id === 'ma' ? 0 : rule.value;

  let hit = null;
  for (const p of series) {
    if (p.v == null) continue;
    if (op.test(p.v, threshold)) { hit = p; break; }
  }

  if (!hit) {
    const last = series.filter((p) => p.v != null).pop();
    return {
      state: 'holding',
      nowPx,
      now: last?.v ?? null,
      threshold,
      unit: w.unit,
      // 문턱까지 얼마나 남았나
      gap: last && Number.isFinite(last.v) ? last.v - threshold : null,
    };
  }

  /* 걸렸다. 그대로 했다면 지금과 얼마나 달랐나.

     판다고 했으면: 그때 팔았을 때와 지금까지 든 것의 차이.
     더 산다고 했으면: 그때 샀을 때 지금까지의 수익.
     들여다본다고 했으면 견줄 것이 없으므로 값의 변화만 적는다. */
  const since = (nowPx / hit.px - 1) * 100;
  const action = actionById(rule.action);

  const missed = action.id === 'sell' ? -since       // 팔았어야 했는데 안 팔았다
    : action.id === 'buy' ? since                    // 샀어야 했는데 안 샀다
    : null;

  return {
    state: 'hit',
    firstAt: hit.t,
    firstPx: hit.px,
    firstVal: hit.v,
    nowPx,
    since,
    missed,
    days: Math.round((Date.now() - hit.t) / 86_400_000),
    threshold,
    unit: w.unit,
  };
}

/**
 * 규칙 전부를 한꺼번에.
 * @param {(sym)=>Array} barsOf  기호를 주면 봉을 돌려주는 것
 */
export function checkAll(barsOf) {
  const rules = all();
  const rows = rules.map((r) => ({
    rule: r,
    entry: r.journalId ? journal.byId(r.journalId) : null,
    got: r.done ? { state: 'off' } : check(r, barsOf(r.symbol)),
  }));

  const hits = rows.filter((x) => x.got.state === 'hit');
  const kept = hits.filter((x) => x.got.missed != null && x.got.missed <= 0);
  const broke = hits.filter((x) => x.got.missed != null && x.got.missed > 0);

  return {
    rows,
    total: rules.length,
    live: rows.filter((x) => x.got.state === 'holding').length,
    hits: hits.length,
    // 어겨서 잃은 것의 합 (판단이 아니라 셈이다)
    cost: broke.reduce((a, x) => a + x.got.missed, 0),
    gained: kept.reduce((a, x) => a + Math.abs(x.got.missed), 0),
    verdict: verdictOf(hits, broke, kept),
  };
}

function verdictOf(hits, broke, kept) {
  if (!hits.length) {
    return { tone: 'flat', text: '아직 걸린 규칙이 없습니다. 걸리면 여기에 적힙니다.' };
  }

  const bits = [`걸린 규칙 ${hits.length}개.`];

  if (broke.length) {
    const worst = broke.reduce((a, b) => (b.got.missed > a.got.missed ? b : a));
    bits.push(
      `그중 ${broke.length}개는 그대로 했다면 지금보다 나았습니다. `
      + `가장 큰 것은 ${worst.rule.ko} — ${worst.got.missed.toFixed(1)}% 입니다.`,
    );
  }
  if (kept.length) {
    bits.push(`${kept.length}개는 안 지킨 편이 나았습니다.`);
  }

  bits.push('규칙은 맞히려고 세우는 것이 아니라 그때그때 정하지 않으려고 '
          + '세우는 것입니다. 한두 번 손해 봤다고 규칙을 고치면, 그것은 '
          + '규칙이 아니라 기분입니다.');

  return {
    tone: broke.length > kept.length ? 'bad' : kept.length ? 'flat' : 'good',
    text: bits.join(' '),
  };
}

/* ─────────────── 밑감 ─────────────── */

const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function sma(vals, n) {
  const out = new Array(vals.length).fill(null);
  if (n < 1 || vals.length < n) return out;
  let s = 0;
  for (let i = 0; i < vals.length; i++) {
    s += vals[i];
    if (i >= n) s -= vals[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

/** 규칙 하나를 사람의 말로 */
export function text(rule) {
  const w = whatById(rule.what);
  const op = opById(rule.op);
  const a = actionById(rule.action);

  const what = w.id === 'ma'
    ? `${rule.value}일 이동평균선을`
    : `${w.ko} ${fmtVal(rule.value, w.unit)}`;

  return `${rule.ko || rule.symbol} — ${what} ${op.ko} ${a.ko}`;
}

const fmtVal = (v, unit) => (unit === '%' ? `${v > 0 ? '+' : ''}${v}%` : v.toLocaleString('ko-KR'));
