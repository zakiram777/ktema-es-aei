/* ═══════════════════════════════════════════════════════════════
   perf.js — 상품이 번 것과 내가 번 것

   이 파일이 내는 숫자 하나가 이 사이트에서 가장 불편한 숫자다.

   ── 두 가지 수익률 ──
   TWR (시간가중)  돈을 언제 넣고 뺐는지를 지운 수익률. 상품 자체가
                   얼마를 벌었나. 펀드 광고에 뜨는 것이 이것이다.
   MWR (금액가중)  내가 실제로 번 것. 언제 얼마를 넣었는지가 그대로
                   들어간다. 내부수익률(XIRR)이라고도 한다.

   둘이 벌어지면 그 간격이 곧 내 타이밍의 값이다. 꼭대기에서 더 넣고
   바닥에서 못 넣었으면 MWR 이 TWR 보다 낮다. 어느 앱도 이 둘을 나란히
   안 보여 준다 — 보여 주면 대개 부끄러운 숫자가 나오기 때문이다.

   ── 어떻게 셈하나 ──
   장부와 시세를 겹쳐 날마다의 평가액을 만든다. 그러면 나머지는 따라
   나온다.

     그날 수익률 = (오늘값 − 오늘 들어온 돈) / 어제값 − 1
     TWR = 그 수익률들을 다 곱한 것
     MWR = 들어오고 나간 돈과 지금 값으로 푸는 내부수익률

   들어온 돈을 빼고 나누는 것이 요점이다. 그러지 않으면 돈을 넣은
   날마다 수익이 난 것으로 셈해진다.

   ── 돈이 섞이는 문제 ──
   원화와 달러가 한 장부에 있다. 값을 하나로 모으려면 날짜별 환율이
   있어야 한다. Frankfurter 에서 받아 오되, 못 받으면 환산 없이 셈하고
   그 사실을 밝힌다 — 숫자를 안 내는 것보다 "환율을 못 받아 섞여 있다"
   고 말하는 편이 낫다.
   ═══════════════════════════════════════════════════════════════ */

import * as book from './book.js';
import * as fx from '../market/fx.js';

const DAY = 86_400_000;
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * 날마다의 평가액과 현금 흐름을 만든다.
 *
 * @param {Array} txs      거래 (book.all())
 * @param {Array} series   시세 (quotes.fetchSeries 가 준 것)
 * @param {{base?:string, rates?:Map<string,Map<string,number>>}} opts
 */
export function daily(txs, series, opts = {}) {
  if (!txs?.length) return { ok: false, why: '장부가 비어 있습니다.' };

  const base = opts.base || 'KRW';
  const rates = opts.rates || new Map();      // currency → Map(day → rate)

  // 기호마다 날짜별 종가
  const px = new Map();
  for (const s of series || []) {
    if (!s?.bars?.length) continue;
    px.set(s.symbol, new Map(s.bars.map((b) => [dayKey(b.t), b.c])));
  }

  const from = txs[0].at;
  const to = Date.now();
  const days = [];
  for (let t = startOfDay(from); t <= to; t += DAY) days.push(t);
  if (days.length < 2) return { ok: false, why: '장부가 너무 짧습니다. 하루는 지나야 합니다.' };

  // 거래를 날짜별로 모은다
  const byDay = new Map();
  for (const tx of txs) {
    const k = dayKey(tx.at);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(tx);
  }

  const held = new Map();        // symbol → qty
  let cash = 0;                  // 기준 돈으로 환산한 현금
  const rows = [];
  const flows = [];              // 밖에서 들어오고 나간 돈만 (XIRR 용)
  const lastPx = new Map();      // 시세가 빠진 날은 앞 값을 끌어다 쓴다
  let missing = 0;

  for (const t of days) {
    const k = dayKey(t);
    let flowToday = 0;

    for (const tx of byDay.get(k) || []) {
      const rate = rateOn(rates, tx.currency, base, k);
      const amt = (tx.amount || 0) * rate;
      const fee = (tx.fee || 0) * rate;

      if (tx.kind === 'deposit') { cash += amt; flowToday += amt; flows.push({ t, v: -amt }); }
      else if (tx.kind === 'withdraw') { cash -= amt; flowToday -= amt; flows.push({ t, v: amt }); }
      else if (tx.kind === 'buy') {
        held.set(tx.symbol, (held.get(tx.symbol) || 0) + tx.qty);
        cash -= amt + fee;
      } else if (tx.kind === 'sell') {
        held.set(tx.symbol, (held.get(tx.symbol) || 0) - tx.qty);
        cash += amt - fee;
      } else if (tx.kind === 'div') cash += amt;
      else if (tx.kind === 'fee') cash -= amt;
    }

    // 오늘의 평가액
    let stocks = 0;
    for (const [sym, qty] of held) {
      if (Math.abs(qty) < 1e-9) continue;
      const map = px.get(sym);
      let p = map?.get(k);
      if (p == null) { p = lastPx.get(sym); if (p == null) { missing += 1; continue; } }
      else lastPx.set(sym, p);

      const cur = currencyOfSeries(series, sym);
      stocks += qty * p * rateOn(rates, cur, base, k);
    }

    rows.push({ t, value: cash + stocks, cash, stocks, flow: flowToday });
  }

  // 주말과 휴일에는 값이 안 움직인다. 그런 날을 그대로 두면 수익률
  // 표본이 부풀고 흔들림이 낮게 나온다. 값이 그대로인 날은 지운다.
  const kept = rows.filter((r, i) => i === 0 || r.flow !== 0 || r.value !== rows[i - 1].value);

  return { ok: true, rows: kept, flows, base, missing, first: kept[0], last: kept[kept.length - 1] };
}

/* ═══════════════════ 두 수익률 ═══════════════════ */

/**
 * 시간가중 수익률 — 돈을 언제 넣었는지를 지운다.
 *
 * 흐름이 있는 날은 그 흐름을 빼고 나눈다. 그러지 않으면 돈을 넣은
 * 날마다 수익이 난 것으로 셈해진다.
 */
export function twr(rows) {
  if (!rows || rows.length < 2) return null;
  let acc = 1;
  const series = [{ t: rows[0].t, v: 0 }];

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].value;
    if (!(prev > 0)) { series.push({ t: rows[i].t, v: (acc - 1) * 100 }); continue; }
    const r = (rows[i].value - rows[i].flow) / prev - 1;
    if (Number.isFinite(r)) acc *= 1 + r;
    series.push({ t: rows[i].t, v: (acc - 1) * 100 });
  }

  const years = (rows[rows.length - 1].t - rows[0].t) / (365.25 * DAY);
  return {
    total: (acc - 1) * 100,
    annual: years > 1 / 52 ? (Math.pow(acc, 1 / years) - 1) * 100 : null,
    series,
    years,
  };
}

/**
 * 금액가중 수익률 — 내가 실제로 번 것 (XIRR).
 *
 * 들어오고 나간 돈에 지금 값을 마지막 흐름으로 붙이고, 순현재가치를
 * 0으로 만드는 이자율을 찾는다. 뉴턴법으로 풀되, 안 풀리면 이분법으로
 * 물러난다 — 흐름이 이상하면 뉴턴법은 발산한다.
 */
export function mwr(flows, endValue, endAt = Date.now()) {
  const cf = [...(flows || []), { t: endAt, v: endValue }]
    .filter((f) => Number.isFinite(f.v) && f.v !== 0)
    .sort((a, b) => a.t - b.t);

  if (cf.length < 2) return null;
  // 부호가 둘 다 있어야 풀린다
  if (!(cf.some((f) => f.v > 0) && cf.some((f) => f.v < 0))) return null;

  /* 너무 짧으면 연율로 펴지 않는다.

     사흘에 2% 번 것을 연율로 펴면 900% 가 된다. 셈은 맞지만 그 숫자를
     화면에 띄우면 거짓말이 된다. 한 달은 지나야 편다 — 그 전에는
     null 을 돌려주고, 화면이 "아직 짧습니다" 라고 말한다. */
  const spanDays = (cf[cf.length - 1].t - cf[0].t) / DAY;
  if (spanDays < 30) return null;

  const t0 = cf[0].t;
  const npv = (r) => cf.reduce((a, f) => a + f.v / Math.pow(1 + r, (f.t - t0) / (365.25 * DAY)), 0);

  // 뉴턴법
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const f = npv(r);
    const d = (npv(r + 1e-6) - f) / 1e-6;
    if (!Number.isFinite(d) || Math.abs(d) < 1e-12) break;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-9) { r = next; break; }
    r = next;
  }
  if (Number.isFinite(npv(r)) && Math.abs(npv(r)) < 1e-4) return r * 100;

  /* 이분법 — 뉴턴법이 미끄러졌을 때.

     위 끝을 10(=1000%)에 두었더니 짧고 크게 번 장부에서 괄호가 안
     잡혀 조용히 null 이 나왔다. 100 까지 열어 둔다. */
  let lo = -0.9999, hi = 100;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

/* ═══════════════════ 한 번에 ═══════════════════ */

/**
 * 장부와 시세로 성과 전부를 낸다.
 *
 * @param {Array} series  들고 있던 것들의 봉
 * @param {{base?:string, benchmark?:object}} opts
 */
export async function report(series, opts = {}) {
  const txs = book.all();
  if (!txs.length) return { ok: false, why: '장부가 비어 있습니다. 거래를 하나 적어 보십시오.' };

  const base = opts.base || 'KRW';

  // 섞인 돈을 하나로 모으려면 환율이 있어야 한다
  const currencies = [...new Set([
    ...txs.map((t) => t.currency),
    ...(series || []).map((s) => s.currency),
  ].filter((c) => c && c !== base))];

  const rates = new Map();
  let fxOk = true;
  if (currencies.length) {
    const from = dayKey(txs[0].at);
    const till = dayKey(Date.now());
    for (const c of currencies) {
      try {
        rates.set(c, await fx.series(c, base, from, till));
      } catch {
        fxOk = false;                 // 환산 없이 간다. 그 사실은 밝힌다.
      }
    }
  }

  const d = daily(txs, series, { base, rates });
  if (!d.ok) return d;

  const t = twr(d.rows);
  const m = mwr(d.flows, d.last.value, d.last.t);
  const pos = book.positions(txs);
  const spanDays = (d.last.t - d.rows[0].t) / DAY;

  // 넣은 돈과 뺀 돈
  const inflow = d.flows.filter((f) => f.v < 0).reduce((a, f) => a - f.v, 0);
  const outflow = d.flows.filter((f) => f.v > 0).reduce((a, f) => a + f.v, 0);

  // 낙폭 — 평가액 곡선에서
  let peak = -Infinity, mdd = 0;
  for (const r of d.rows) {
    if (r.value > peak) peak = r.value;
    if (peak > 0) mdd = Math.min(mdd, (r.value / peak - 1) * 100);
  }

  return {
    ok: true,
    base, fxOk,
    rows: d.rows,
    flows: d.flows,
    value: d.last.value,
    cash: d.last.cash,
    stocks: d.last.stocks,
    inflow, outflow,
    net: inflow - outflow,
    twr: t,
    mwr: m,
    // 한 달이 안 되면 연율은 뜻이 없다. 그 사실을 화면에 넘겨 준다.
    tooShort: spanDays < 30,
    gap: t && m != null && Number.isFinite(t.annual) ? m - t.annual : null,
    mdd,
    positions: pos,
    missing: d.missing,
    days: Math.round((d.last.t - d.rows[0].t) / DAY),
  };
}

/* ─────────────── 밑감 ─────────────── */

const startOfDay = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** 그날의 환율. 주말이면 앞 영업일로 물러난다. */
function rateOn(rates, currency, base, day) {
  if (!currency || currency === base) return 1;
  const map = rates.get(currency);
  if (!map || !map.size) return 1;              // 못 받았으면 1로 둔다 (밝혀 준다)

  let d = new Date(day + 'T00:00:00Z').getTime();
  for (let i = 0; i <= 10; i++) {
    const v = map.get(dayKey(d - i * DAY));
    if (v != null) return v;
  }
  // 그래도 없으면 가장 이른 값 — 장부 첫날이 환율보다 앞설 수 있다
  return map.values().next().value ?? 1;
}

const currencyOfSeries = (series, sym) =>
  (series || []).find((s) => s.symbol === sym)?.currency || 'KRW';
