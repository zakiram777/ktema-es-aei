/* ═══════════════════════════════════════════════════════════════
   fx.js — 원화로 보면

   해외 자산을 보는 한국 사람에게 거의 언제나 빠져 있는 분해다.

     S&P500 이 10% 올랐는데 환율이 8% 내렸으면 원화로는 1.2% 다.

   달러로 재면 이겼고 원화로 재면 거의 제자리인데, 화면은 늘 달러로만
   말한다. 그러면 성과를 오해한 채로 다음 결정을 내리게 된다.

   ── 이 길만은 곧바로 열려 있다 ──
   Frankfurter 는 유럽중앙은행이 내는 환율을 그대로 준다. 열쇠가
   필요 없고 CORS 도 열려 있어서, 이 사이트의 프록시 사다리를 거치지
   않는 유일한 바깥 길이다. 빠르고, 남의 호의에 덜 기댄다.

   ── 셈하는 법 ──
   그 종목이 어느 돈으로 매겨지는지를 기호에서 읽고(symbols.js 의
   currencyOf), 그 돈을 원으로 바꾸는 환율을 날짜마다 곱한다.

   환율에는 주말과 공휴일이 없다. 그런 날은 바로 앞 영업일 값을
   그대로 쓴다 — 은행이 쉬는 날에 환율이 움직이지는 않으므로.
   ═══════════════════════════════════════════════════════════════ */

import { currencyOf } from './symbols.js';

const HOST = 'https://api.frankfurter.dev/v1';

/** 받아 둔 환율 — 하루 안에는 다시 묻지 않는다 */
const cache = new Map();     // 'USD|KRW|from|to' → { at, map }
const TTL = 6 * 60 * 60 * 1000;

/**
 * 두 돈 사이의 날짜별 환율.
 * @returns {Promise<Map<string, number>>} 'YYYY-MM-DD' → 값
 */
export async function series(base, quote, from, to) {
  if (base === quote) return new Map();

  const key = `${base}|${quote}|${from}|${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.map;

  const url = `${HOST}/${from}..${to}?base=${base}&symbols=${quote}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('환율을 받지 못했습니다 (' + res.status + ')');

  const data = await res.json();
  const map = new Map();
  for (const [day, row] of Object.entries(data.rates || {})) {
    const v = row?.[quote];
    if (Number.isFinite(v)) map.set(day, v);
  }
  if (!map.size) throw new Error('환율이 비어 있습니다');

  cache.set(key, { at: Date.now(), map });
  return map;
}

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * 봉을 다른 돈으로 환산한다.
 *
 * 값만 바꾸는 것이 아니라 무엇이 그 변화를 냈는지도 함께 낸다 —
 * 그것이 이 기능의 요점이다.
 *
 * @param {Array} bars
 * @param {string} symbol  무엇의 봉인가 (돈을 기호에서 읽는다)
 * @param {string} to      무슨 돈으로 (기본 KRW)
 */
export async function convert(bars, symbol, to = 'KRW') {
  const base = currencyOf(symbol);
  if (!bars?.length) return { ok: false, why: '봉이 없습니다' };
  if (base === to) {
    return { ok: false, same: true, why: `이미 ${to} 로 매겨지는 것입니다` };
  }

  const from = dayKey(bars[0].t);
  const till = dayKey(bars[bars.length - 1].t);
  const rates = await series(base, to, from, till);

  // 환율에는 주말이 없다. 앞 영업일 값을 끌어다 쓴다.
  let last = null;
  const out = [];
  const used = [];
  for (const b of bars) {
    const r = rates.get(dayKey(b.t)) ?? last;
    if (r == null) continue;                 // 첫 며칠은 환율이 아직 없을 수 있다
    last = r;
    used.push(r);
    out.push({ t: b.t, o: b.o * r, h: b.h * r, l: b.l * r, c: b.c * r, v: b.v });
  }

  if (out.length < 2) return { ok: false, why: '겹치는 날이 모자랍니다' };

  // 셋으로 가른다. 곱셈이므로 더해서 나뉘지 않는다 —
  // (1+전체) = (1+지수)(1+환율) 이고, 남는 것이 두 몫의 곱이다.
  const assetRet = bars[bars.length - 1].c / bars[0].c - 1;
  const fxRet = used[used.length - 1] / used[0] - 1;
  const totalRet = out[out.length - 1].c / out[0].c - 1;

  return {
    ok: true,
    bars: out,
    base, to,
    rateFirst: used[0],
    rateLast: used[used.length - 1],
    assetRet: assetRet * 100,
    fxRet: fxRet * 100,
    totalRet: totalRet * 100,
    // 환율이 낸 몫 — 전체에서 지수 몫을 뺀 것이 아니라 곱의 나머지다
    fxShare: (totalRet - assetRet) * 100,
  };
}

/** 지금 환율 하나 — 머리띠나 곁말에 쓴다 */
export async function latest(base, quote = 'KRW') {
  if (base === quote) return 1;
  const res = await fetch(`${HOST}/latest?base=${base}&symbols=${quote}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('환율을 받지 못했습니다');
  const data = await res.json();
  const v = data?.rates?.[quote];
  if (!Number.isFinite(v)) throw new Error('환율이 비어 있습니다');
  return v;
}
