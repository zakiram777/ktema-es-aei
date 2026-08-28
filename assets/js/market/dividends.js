/* ═══════════════════════════════════════════════════════════════
   dividends.js — 배당 이력

   오래 든 사람에게는 이 숫자가 본 숫자다. 값이 오르내리는 것은
   내가 못 정하지만, 배당은 회사가 해마다 정해서 실제로 보내 준다.

   ── 왜 취득가 대비인가 ──
   지금 값 대비 배당률(current yield)은 새로 살 사람의 숫자다. 이미
   든 사람의 숫자는 취득가 대비(yield on cost)다.

   삼만 원에 사서 지금 십만 원인 것이 주당 삼천 원을 준다면, 새로
   사는 사람에게는 3%지만 나에게는 10%다. 같은 배당인데 다른 숫자이고,
   나에게 맞는 쪽은 뒤엣것이다.

   ── 어디서 받나 ──
   야후의 차트 문에 events=div|split 을 얹으면 배당과 분할이 함께 온다.
   열쇠가 필요 없고, 한국 종목도 나온다 (삼성전자 다섯 해에 스무 번).

   야후의 quoteSummary 는 이제 빈 응답을 준다 — 예전에 배당률을 거기서
   받았다면 그 길은 막혔다. 이력에서 직접 셈하는 편이 어차피 낫다.

   ── 분할을 지나칠 수 없다 ──
   분할 전의 배당금은 분할 전 주식 기준이다. 4대1 분할이 있었으면 그
   전의 주당 배당금은 4로 나눠야 지금 주식과 견줄 수 있다. 안 그러면
   "예전에 배당을 네 배 줬다" 는 거짓 그림이 나온다.
   ═══════════════════════════════════════════════════════════════ */

import { fetchJSON } from '../net/proxy.js';
import { nameOf, currencyOf } from './symbols.js';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

const cache = new Map();
const TTL = 12 * 60 * 60 * 1000;      // 배당은 자주 바뀌지 않는다

/**
 * @param {string} symbol
 * @param {{years?:number, fresh?:boolean}} opts
 */
export async function history(symbol, { years = 10, fresh = false } = {}) {
  const key = symbol + '|' + years;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.data;

  const url = `${BASE}${encodeURIComponent(symbol)}`
            + `?range=${years}y&interval=1d&events=div%7Csplit`;
  const { data } = await fetchJSON(url, { timeout: 14_000 });

  const res = data?.chart?.result?.[0];
  if (!res) throw new Error('배당 이력이 오지 않았습니다');

  const ev = res.events || {};
  const splits = Object.values(ev.splits || {})
    .map((s) => ({ t: s.date * 1000, ratio: (s.numerator || 1) / (s.denominator || 1) }))
    .sort((a, b) => a.t - b.t);

  /* 분할을 되짚어 지금 주식 기준으로 맞춘다.

     어느 배당이 어떤 분할들보다 앞섰는지를 보고, 그 뒤에 일어난
     분할 비율을 모두 곱해 나눈다. */
  const adjust = (t) => splits
    .filter((s) => s.t > t)
    .reduce((a, s) => a * s.ratio, 1);

  const rows = Object.values(ev.dividends || {})
    .map((d) => {
      const t = d.date * 1000;
      const f = adjust(t);
      return { t, raw: d.amount, amount: d.amount / f, split: f !== 1 ? f : null };
    })
    .filter((d) => Number.isFinite(d.amount) && d.amount > 0)
    .sort((a, b) => a.t - b.t);

  // 값도 함께 들고 온다 — 그날의 배당률을 셈하려면 필요하다
  const ts = res.timestamp || [];
  const cl = res.indicators?.quote?.[0]?.close || [];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    if (Number.isFinite(cl[i])) bars.push({ t: ts[i] * 1000, c: cl[i] });
  }

  const out = shape(symbol, rows, splits, bars);
  cache.set(key, { at: Date.now(), data: out });
  return out;
}

function shape(symbol, rows, splits, bars) {
  const now = bars.length ? bars[bars.length - 1].c : null;

  // 해마다 얼마를 줬나. 몇 번 받았는지도 함께 센다 — 반쪽인 해를
  // 가려내려면 그 수가 있어야 한다.
  const byYear = new Map();
  const countByYear = new Map();
  for (const d of rows) {
    const y = new Date(d.t).getFullYear();
    byYear.set(y, (byYear.get(y) || 0) + d.amount);
    countByYear.set(y, (countByYear.get(y) || 0) + 1);
  }
  const years = [...byYear.entries()].sort((a, b) => a[0] - b[0]);

  /* 성장률을 낼 때 쓸 해를 고른다.

     받아 온 구간이 해의 한가운데서 시작하면 첫 해는 반쪽이다. 애플
     열 해치를 받으면 2016년에 한 번만 받은 것으로 나오는데, 그것을
     시작점으로 삼으면 0.036 에서 1.03 으로 자란 것이 되어 연 45%
     라는 거짓말이 나온다. 실제로 그렇게 나왔었다.

     한 해에 몇 번 주는지를 가장 흔한 수로 정하고, 그보다 적게 받은
     해는 양 끝에서 잘라 낸다. */
  const thisYear = new Date().getFullYear();
  const counts = [...countByYear.values()];
  const usual = counts.length ? mode(counts) : 1;

  const full = years.filter(([y]) => y < thisYear && countByYear.get(y) >= usual);
  const done = years.filter(([y]) => y < thisYear);

  // 최근 열두 달치 — 지금의 배당률은 이것으로 잰다
  const cut = Date.now() - 365 * 86_400_000;
  const ttm = rows.filter((d) => d.t >= cut).reduce((a, d) => a + d.amount, 0);

  // 끊긴 적이 있나. 있으면 그 해가 언제였는지 말해 준다.
  const gaps = [];
  for (let i = 1; i < done.length; i++) {
    if (done[i][1] < done[i - 1][1] * 0.5) gaps.push({ year: done[i][0], from: done[i - 1][1], to: done[i][1] });
  }

  // 성장률 — 온전한 해의 처음과 끝으로 연평균
  let growth = null;
  let growthFrom = null, growthTo = null;
  if (full.length >= 3) {
    const [y0, v0] = full[0];
    const [y1, v1] = full[full.length - 1];
    const span = y1 - y0;
    if (v0 > 0 && v1 > 0 && span > 0) {
      growth = (Math.pow(v1 / v0, 1 / span) - 1) * 100;
      growthFrom = y0;
      growthTo = y1;
    }
  }

  return {
    symbol,
    ko: nameOf(symbol),
    currency: currencyOf(symbol),
    rows,
    splits,
    bars,
    byYear: years,
    ttm,
    price: now,
    yield: now > 0 ? (ttm / now) * 100 : null,
    growth,
    growthFrom,
    growthTo,
    perYearUsual: usual,
    // 반쪽인 해 — 화면에서 옅게 그린다
    partial: years.filter(([y]) => countByYear.get(y) < usual).map(([y]) => y),
    gaps,
    count: rows.length,
    since: rows.length ? rows[0].t : null,
    // 한 해에 몇 번 주나 — 분기인지 반기인지 연 1회인지
    perYear: usual,
  };
}

/* ═══════════════════ 내 것으로 ═══════════════════

   장부가 있으면 배당은 남의 이야기가 아니게 된다. */

/**
 * 취득가 대비 배당률과 연간 예상 수입.
 *
 * @param {object} hist  history() 가 준 것
 * @param {{qty:number, avg:number}} pos  내 보유
 */
export function mine(hist, pos) {
  if (!hist || !pos?.qty) return null;

  const annual = hist.ttm * pos.qty;
  const onCost = pos.avg > 0 ? (hist.ttm / pos.avg) * 100 : null;

  return {
    annual,
    onCost,
    onPrice: hist.yield,
    // 지금까지 이 종목이 나에게 준 것 (장부의 div 는 따로 셈한다.
    // 여기 것은 "지금 수량으로 한 해를 받으면" 이라는 앞으로의 이야기다)
    monthly: annual / 12,
    currency: hist.currency,
  };
}

/**
 * 배당을 다시 사들였다면.
 *
 * 긴 시간에서는 이 차이가 수익의 절반쯤을 낸다. 그런데 대부분의
 * 차트는 배당을 아예 안 그린다 — 값만 그리므로.
 *
 * 배당락일의 값으로 곧바로 다시 산 것으로 본다. 실제로는 며칠 뒤에
 * 들어오고 세금도 떼이지만, 여기서 재려는 것은 '얼마나 큰 차이인가'
 * 이지 정확한 금액이 아니다.
 */
export function reinvested(hist, { qty = 1 } = {}) {
  if (!hist?.bars?.length || !hist.rows.length) return null;

  const price = new Map(hist.bars.map((b) => [dayKey(b.t), b.c]));
  const at = (t) => {
    for (let i = 0; i <= 7; i++) {
      const v = price.get(dayKey(t + i * 86_400_000));
      if (v != null) return v;
    }
    return null;
  };

  let units = qty;
  const events = [];
  for (const d of hist.rows) {
    const p = at(d.t);
    if (!p) continue;
    const cash = units * d.amount;
    const bought = cash / p;
    units += bought;
    events.push({ t: d.t, cash, price: p, bought, units });
  }

  const first = hist.bars[0].c;
  const last = hist.bars[hist.bars.length - 1].c;

  return {
    plain: qty * last,
    withDiv: units * last,
    units,
    added: units - qty,
    events,
    // 값만 오른 몫과 배당이 보탠 몫
    priceRet: (last / first - 1) * 100,
    totalRet: ((units * last) / (qty * first) - 1) * 100,
    divShare: ((units * last) / (qty * first) - last / first) * 100,
  };
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/** 가장 흔한 값 — 한 해에 몇 번 주는 것이 보통인가 */
function mode(xs) {
  const n = new Map();
  for (const x of xs) n.set(x, (n.get(x) || 0) + 1);
  let best = xs[0], seen = 0;
  for (const [v, c] of n) if (c > seen || (c === seen && v > best)) { best = v; seen = c; }
  return best;
}
