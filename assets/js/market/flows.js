/* ═══════════════════════════════════════════════════════════════
   flows.js — 누가 사고 누가 팔았나

   한국 시장에는 다른 나라에 없는 숫자가 하나 있다. 날마다 개인·기관·
   외국인이 각각 얼마를 순매수했는지가 공개된다.

   이 숫자가 값진 까닭은 "값이 얼마나 움직였나" 가 아니라 "누가 움직였나"
   를 말하기 때문이다. 같은 3% 상승이라도 외국인이 사서 오른 것과
   개인이 사서 오른 것은 다음 날이 다르다 — 적어도 사람들은 그렇게 믿고,
   믿는 사람이 많으면 그 믿음 자체가 값을 움직인다.

   ── 어디서 받나 ──
   네이버 모바일 쪽 문이다. 열쇠가 필요 없고 종목과 지수 둘 다 준다.
   CORS 는 닫혀 있어 프록시를 거치는데, 그 사다리는 이미 있다.

   KRX 쪽이 원본이지만 POST 와 Referer 를 따져 정적 사이트에서 못 쓴다.
   공공데이터포털은 열쇠가 필요하고 승인을 기다려야 한다.

   ── 이 숫자를 믿을 때 조심할 것 ──
   '기관' 은 한 덩이가 아니다. 연기금과 사모펀드와 증권사 자기매매가
   다 거기 들어 있고, 서로 반대로 움직이는 날이 흔하다. '외국인' 도
   진짜 외국 돈만은 아니다 — 외국에 등록해 둔 국내 자금이 섞인다.

   그래서 여기서는 '외국인이 사면 오른다' 같은 말을 하지 않는다.
   지난 값에서 실제로 그랬는지를 세어 숫자로만 낸다.
   ═══════════════════════════════════════════════════════════════ */

import { fetchText } from '../net/proxy.js';
import { nameOf } from './symbols.js';

const STOCK = 'https://m.stock.naver.com/api/stock/';
const INDEX = 'https://m.stock.naver.com/api/index/';

const cache = new Map();
const TTL = 30 * 60_000;      // 하루에 한 번 바뀌는 숫자다

/** 이 기호가 국내 것인가 — 국내에만 있는 자료다 */
export const isKorean = (symbol) => /^(\d{6}\.(KS|KQ)|\^(KS11|KQ11))$/i.test(String(symbol || ''));

/** 야후 기호를 네이버 것으로 */
function toNaver(symbol) {
  const s = String(symbol || '').toUpperCase();
  const m = /^(\d{6})\.(KS|KQ)$/.exec(s);
  if (m) return { kind: 'stock', code: m[1] };
  if (s === '^KS11') return { kind: 'index', code: 'KOSPI' };
  if (s === '^KQ11') return { kind: 'index', code: 'KOSDAQ' };
  return null;
}

/**
 * 투자주체별 순매수 이력.
 *
 * @param {string} symbol 야후 기호
 * @param {{days?:number, fresh?:boolean}} opts
 */
export async function history(symbol, { days = 60, fresh = false } = {}) {
  const at = toNaver(symbol);
  if (!at) return { ok: false, why: '국내 종목과 지수에만 있는 자료입니다.' };

  const key = symbol + '|' + days;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.data;

  const size = Math.min(100, Math.max(10, days));
  const url = at.kind === 'stock'
    ? `${STOCK}${at.code}/trend?pageSize=${size}&page=1`
    : `${INDEX}${at.code}/trend?pageSize=${size}&page=1`;

  const { text } = await fetchText(url, { timeout: 14_000, validate: (t) => t.trimStart().startsWith('[') || t.trimStart().startsWith('{') });

  let raw;
  try { raw = JSON.parse(text); } catch { return { ok: false, why: '자료를 알아볼 수 없습니다.' }; }

  const rows = (Array.isArray(raw) ? raw : [raw])
    .map(at.kind === 'stock' ? shapeStock : shapeIndex)
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);

  if (!rows.length) return { ok: false, why: '자료가 비어 있습니다.' };

  const out = shape(symbol, at.kind, rows);
  cache.set(key, { at: Date.now(), data: out });
  return out;
}

/* ─────────────── 받은 것을 펴기 ───────────────

   숫자가 "+1,381,786" 같은 글로 온다. 부호와 쉼표를 떼어 낸다.
   종목은 주식 수, 지수는 금액(억 원)이라 단위가 다르다 — 섞으면 안 되므로
   무엇인지 함께 적어 둔다. */

function shapeStock(r) {
  const t = parseYmd(r.bizdate);
  if (!t) return null;
  return {
    t,
    indiv: n(r.individualPureBuyQuant),
    inst: n(r.organPureBuyQuant),
    foreign: n(r.foreignerPureBuyQuant),
    holdPct: n(String(r.foreignerHoldRatio || '').replace('%', '')),
    close: n(r.closePrice),
    change: n(r.compareToPreviousClosePrice) * (r.compareToPreviousPrice?.code === '5' || r.compareToPreviousPrice?.code === '4' ? -1 : 1),
    volume: n(r.accumulatedTradingVolume),
  };
}

function shapeIndex(r) {
  const t = parseYmd(r.bizdate);
  if (!t) return null;
  return {
    t,
    indiv: n(r.personalValue),
    inst: n(r.institutionalValue),
    foreign: n(r.foreignValue),
    holdPct: null,
    close: null,
    volume: null,
  };
}

const n = (v) => {
  const x = Number(String(v ?? '').replace(/[,+\s]/g, ''));
  return Number.isFinite(x) ? x : null;
};

function parseYmd(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 15, 30).getTime() : null;
}

/* ═══════════════════ 셈하기 ═══════════════════ */

export const ACTORS = [
  { id: 'foreign', ko: '외국인', gr: 'Ξένοι', color: '--key-500' },
  { id: 'inst',    ko: '기관',   gr: 'Θεσμοί', color: '--warn' },
  { id: 'indiv',   ko: '개인',   gr: 'Ἴδιοι',  color: '--ok' },
];

function shape(symbol, kind, rows) {
  // 누적 — 날마다의 순매수를 더해 가면 '누가 모으고 있나' 가 보인다
  let ci = 0, cn = 0, cf = 0;
  const cum = rows.map((r) => {
    ci += r.indiv || 0; cn += r.inst || 0; cf += r.foreign || 0;
    return { t: r.t, indiv: ci, inst: cn, foreign: cf };
  });

  const sum = (k, n2) => rows.slice(-n2).reduce((a, r) => a + (r[k] || 0), 0);

  return {
    ok: true,
    symbol,
    ko: nameOf(symbol),
    kind,
    unit: kind === 'stock' ? '주' : '억',
    rows,
    cum,
    days: rows.length,
    // 요즘 누가 사고 있나
    recent: {
      d5:  { foreign: sum('foreign', 5),  inst: sum('inst', 5),  indiv: sum('indiv', 5) },
      d20: { foreign: sum('foreign', 20), inst: sum('inst', 20), indiv: sum('indiv', 20) },
      all: { foreign: cf, inst: cn, indiv: ci },
    },
    holdPct: rows.filter((r) => r.holdPct != null).at(-1)?.holdPct ?? null,
    holdChange: (() => {
      const withPct = rows.filter((r) => r.holdPct != null);
      if (withPct.length < 2) return null;
      return withPct.at(-1).holdPct - withPct[0].holdPct;
    })(),
    // 며칠째 연달아 사고 있나 — 이어짐이 하루치 크기보다 말이 될 때가 많다
    streaks: Object.fromEntries(ACTORS.map((a) => [a.id, streakOf(rows, a.id)])),
  };
}

/** 마지막 날부터 거슬러 같은 부호가 몇 날 이어졌나 */
function streakOf(rows, key) {
  if (!rows.length) return { days: 0, dir: 0 };
  const last = rows.at(-1)[key];
  if (!last) return { days: 0, dir: 0 };
  const dir = Math.sign(last);
  let days = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (Math.sign(rows[i][key] || 0) !== dir) break;
    days += 1;
  }
  return { days, dir };
}

/* ═══════════════════ 다음 날은 어땠나 ═══════════════════

   이 판의 알맹이다. "외국인이 사면 오른다" 는 말은 흔한데, 실제로
   그랬는지를 세어 본 사람은 드물다.

   각 주체가 순매수한 날과 순매도한 날을 갈라, 그 다음 며칠의 수익률을
   견준다. 차이가 크면 그 주체의 손이 값을 앞선다는 뜻이고, 없으면
   그냥 값을 따라간 것이다.

   ── 조심할 것 ──
   · 표본이 적다. 예순 날이면 사고판 날이 각각 서른쯤이다. 스물 미만
     이면 숫자를 내지 않는다.
   · 같이 움직인다고 앞선 것은 아니다. 외국인이 산 날 오른 것은 그들이
     사서 오른 것일 수도 있고, 오르니까 산 것일 수도 있다. 그래서
     '그날' 이 아니라 '다음 날부터' 를 잰다.
*/
export function forward(flow, bars, { horizons = [1, 5, 20], minN = 20 } = {}) {
  if (!flow?.ok || !bars?.length) return null;

  const px = new Map(bars.map((b) => [dayKey(b.t), b.c]));
  const days = bars.map((b) => dayKey(b.t));
  const idx = new Map(days.map((d, i) => [d, i]));

  const out = {};
  for (const a of ACTORS) {
    const buy = { }, sell = { };
    for (const h of horizons) { buy[h] = []; sell[h] = []; }

    for (const r of flow.rows) {
      const k = dayKey(r.t);
      const i = idx.get(k);
      if (i == null) continue;
      const v = r[a.id];
      if (!v) continue;

      for (const h of horizons) {
        const j = i + h;
        if (j >= bars.length) continue;
        // 그날 종가에서 h일 뒤 종가까지. 그날의 움직임은 이미 지난 일이다.
        const ret = (bars[j].c / bars[i].c - 1) * 100;
        (v > 0 ? buy[h] : sell[h]).push(ret);
      }
    }

    out[a.id] = { ko: a.ko };
    for (const h of horizons) {
      const b = buy[h], s = sell[h];
      out[a.id][h] = (b.length >= minN && s.length >= minN)
        ? {
          buy: mean(b), sell: mean(s), gap: mean(b) - mean(s),
          nBuy: b.length, nSell: s.length,
          buyWin: (b.filter((x) => x > 0).length / b.length) * 100,
        }
        : { thin: true, nBuy: b.length, nSell: s.length };
    }
  }

  return out;
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * 셋 가운데 누가 값과 가장 붙어 움직였나.
 *
 * 순매수와 그날 수익률의 상관이다. 높다고 그 주체가 이끈 것은 아니다 —
 * 오르니까 샀을 수도 있다. 그래도 "누가 값과 같은 쪽에 서 있나" 는
 * 알려 준다.
 */
export function alignment(flow, bars) {
  if (!flow?.ok || !bars?.length) return null;
  const idx = new Map(bars.map((b, i) => [dayKey(b.t), i]));

  const out = {};
  for (const a of ACTORS) {
    const xs = [], ys = [];
    for (const r of flow.rows) {
      const i = idx.get(dayKey(r.t));
      if (i == null || i === 0) continue;
      const v = r[a.id];
      if (v == null) continue;
      xs.push(v);
      ys.push((bars[i].c / bars[i - 1].c - 1) * 100);
    }
    out[a.id] = xs.length >= 20 ? corr(xs, ys) : null;
  }
  return out;
}

function corr(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let num2 = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num2 += a * b; dx += a * a; dy += b * b;
  }
  return dx > 0 && dy > 0 ? num2 / Math.sqrt(dx * dy) : null;
}

/* ═══════════════════ 주체별 평균 단가 ═══════════════════

   "외국인 평단 위냐 아래냐" 는 국내에서 많이 쓰이는 말인데, 무료로
   제대로 내주는 곳이 거의 없다. 사실 셈은 간단하다 — 날마다의 순매수
   수량과 그날 종가를 곱해 쌓고, 쌓인 수량으로 나누면 된다.

   ── 정확한 값이 아니다 ──
   이것은 '이 구간에서 새로 사 모은 몫' 의 평균이지, 그들이 예전부터
   들고 있던 것까지 포함한 진짜 평단이 아니다. 외국인은 삼성전자를
   수십 년 들고 있고 그 취득가는 아무도 모른다.

   그러니 "외국인 평단 7만" 이라고 말하면 거짓말이다. "최근 예순 날
   동안 그들이 사 모은 몫의 평균이 7만" 이라고 말해야 맞다. 화면에도
   그렇게 적는다.

   ── 순매도로 돌아선 주체는 셈하지 않는다 ──
   쌓인 수량이 음수가 되면 나눗셈의 뜻이 사라진다. 판 사람에게 평단은
   없다.
*/
export function avgCost(flow) {
  if (!flow?.ok || flow.kind !== 'stock') return null;

  const out = {};
  for (const a of ACTORS) {
    let qty = 0, cost = 0;
    let maxQty = 0;
    const line = [];

    for (const r of flow.rows) {
      const q = r[a.id];
      const p = r.close;
      if (q == null || !(p > 0)) { line.push(null); continue; }

      /* 살 때는 쌓고, 팔 때는 그때의 평단으로 덜어 낸다. 파는 값으로
         덜면 평단이 판 값 쪽으로 끌려가 뜻이 흐려진다 — 장부에서
         쓰는 이동평균법과 같은 규칙이다. */
      if (q > 0) { qty += q; cost += q * p; }
      else if (qty > 0) {
        const avg = cost / qty;
        const sold = Math.min(-q, qty);
        qty -= sold;
        cost -= sold * avg;
      }
      if (qty > maxQty) maxQty = qty;
      line.push(qty > 0 ? cost / qty : null);
    }

    const now = flow.rows[flow.rows.length - 1]?.close;
    const avg = qty > 0 ? cost / qty : null;

    out[a.id] = {
      ko: a.ko,
      avg,
      qty,
      line,
      // 지금 값이 그 평단보다 위인가
      vs: avg != null && now > 0 ? (now / avg - 1) * 100 : null,
      // 얼마나 쌓았다 얼마가 남았나 — 다 팔았으면 평단은 뜻이 없다
      maxQty,
      thin: qty <= 0,
    };
  }

  return { rows: out, price: flow.rows[flow.rows.length - 1]?.close ?? null, days: flow.days };
}

/* ═══════════════════ 셋이 함께 산 날 ═══════════════════

   개인·기관·외국인이 같은 날 모두 순매수인 것은 드물다. 누가 산 만큼
   누가 팔았어야 하므로, 셋이 다 샀다면 그날 판 것은 나머지(기타법인·
   국가)뿐이라는 뜻이다.

   드문 만큼 그 뒤가 궁금해진다. 실제로 그랬는지를 세어 준다.
*/
export function together(flow, bars, { horizons = [1, 5, 20] } = {}) {
  if (!flow?.ok) return null;

  const idx = new Map((bars || []).map((b, i) => [dayKey(b.t), i]));

  const pick = (sign) => flow.rows.filter((r) =>
    ACTORS.every((a) => r[a.id] != null && Math.sign(r[a.id]) === sign));

  const scoreOf = (days) => {
    const out = { n: days.length };
    for (const h of horizons) {
      const rs = [];
      for (const r of days) {
        const i = idx.get(dayKey(r.t));
        if (i == null || i + h >= bars.length) continue;
        rs.push((bars[i + h].c / bars[i].c - 1) * 100);
      }
      out[h] = rs.length >= 3
        ? { avg: rs.reduce((a, b) => a + b, 0) / rs.length, n: rs.length,
            win: (rs.filter((x) => x > 0).length / rs.length) * 100 }
        : { thin: true, n: rs.length };
    }
    return out;
  };

  const allBuy = pick(1);
  const allSell = pick(-1);

  return {
    buy: scoreOf(allBuy),
    sell: scoreOf(allSell),
    buyDays: allBuy.map((r) => r.t),
    sellDays: allSell.map((r) => r.t),
    total: flow.rows.length,
  };
}

/* ═══════════════════ 보유율이 먼저 움직이나 ═══════════════════

   외국인 보유율은 순매수보다 느리게 바뀌는 대신 되돌림이 적다. 하루치
   순매수는 오늘 사고 내일 팔면 지워지지만, 보유율이 오르면 실제로
   지분이 늘어난 것이다.

   그래서 "보유율이 며칠째 오르고 있나" 가 "어제 얼마 샀나" 보다 앞을
   말할 때가 있다. 실제로 그런지를 센다 — 보유율이 오른 구간과 내린
   구간 뒤의 수익률을 갈라 견준다.
*/
export function holdLead(flow, bars, { window: w = 5, horizons = [5, 20] } = {}) {
  if (!flow?.ok) return null;
  const rows = flow.rows.filter((r) => r.holdPct != null);
  if (rows.length < w + 25) return null;

  const idx = new Map((bars || []).map((b, i) => [dayKey(b.t), i]));

  const rising = [], falling = [];
  for (let i = w; i < rows.length; i++) {
    const d = rows[i].holdPct - rows[i - w].holdPct;
    (d > 0 ? rising : falling).push(rows[i]);
  }

  const scoreOf = (days) => {
    const out = { n: days.length };
    for (const h of horizons) {
      const rs = [];
      for (const r of days) {
        const i = idx.get(dayKey(r.t));
        if (i == null || i + h >= bars.length) continue;
        rs.push((bars[i + h].c / bars[i].c - 1) * 100);
      }
      out[h] = rs.length >= 10
        ? { avg: rs.reduce((a, b) => a + b, 0) / rs.length, n: rs.length }
        : { thin: true, n: rs.length };
    }
    return out;
  };

  const up = scoreOf(rising);
  const dn = scoreOf(falling);

  const gaps = {};
  for (const h of horizons) {
    gaps[h] = (!up[h].thin && !dn[h].thin) ? up[h].avg - dn[h].avg : null;
  }

  return { window: w, rising: up, falling: dn, gaps };
}
