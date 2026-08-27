/* ═══════════════════════════════════════════════════════════════
   quotes.js — 시세와 봉을 길어 온다

   야후 파이낸스의 chart 엔드포인트 하나만 쓴다. 시세와 봉이 같이
   오기 때문에 두 번 부를 일이 없다. 열쇠도 등록도 필요 없다.

     …/v8/finance/chart/^KS11?range=1d&interval=5m

   meta 안에 지금 값과 전날 종가가 들어 있어 등락을 셀 수 있고,
   timestamp / indicators 안에 봉이 들어 있다.

   시세는 참고용이다. 지연될 수 있고, 어떤 종목은 아예 오지 않는다.
   못 받은 것은 화면에서 흐리게 두고 넘어간다.
   ═══════════════════════════════════════════════════════════════ */

import { fetchJSON } from '../net/proxy.js';
import { pool } from '../core/pool.js';
import { emit } from '../core/bus.js';
import { nameOf, currencyOf } from './symbols.js';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';

/* 야후에는 여럿을 한 번에 묻는 문이 하나 더 있다. 종가 줄과 전날 종가만
   오지만 시세판에 필요한 것은 그것이 전부다. 열둘을 한 번에 묻는다.

   왜 굳이 그러는가. 이 사이트는 남의 프록시를 얻어 타고 다니는데,
   그 문턱은 대개 "몇 초에 몇 번" 으로 세어진다. 열둘을 열두 번 물으면
   그 셈이 금세 찬다. 소식 열여덟 곳까지 겹치는 첫 화면에서는 더 그렇다.
   한 번으로 줄이면 그 다툼이 통째로 사라진다.

   구간을 넓게 본 봉이나 거래량·52주 값이 필요할 때는 예전처럼
   chart 문(fetchOne)으로 하나만 따로 묻는다. */
const SPARK = 'https://query1.finance.yahoo.com/v8/finance/spark';

/** 같은 것을 자꾸 부르지 않게 잠깐 들고 있는다 */
const cache = new Map();   // key → { at, data }
const TTL = 45_000;

function cached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  return null;
}

/* ─────────────── 하나 ─────────────── */

/**
 * @param {string} symbol
 * @param {{range?:string, interval?:string, fresh?:boolean}} opts
 */
export async function fetchOne(symbol, opts = {}) {
  const range = opts.range || '1d';
  const interval = opts.interval || (range === '1d' ? '5m' : '1d');
  const key = `${symbol}|${range}|${interval}`;

  if (!opts.fresh) {
    const hit = cached(key);
    if (hit) return hit;
  }

  const url = `${BASE}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const { data } = await fetchJSON(url, { timeout: 12_000 });

  const res = data?.chart?.result?.[0];
  if (!res) {
    const why = data?.chart?.error?.description || '시세가 오지 않았습니다';
    throw new Error(why);
  }

  const out = shape(res, symbol);
  cache.set(key, { at: Date.now(), data: out });
  return out;
}

function shape(res, symbol) {
  const m = res.meta || {};

  const ts = res.timestamp || [];
  const q = res.indicators?.quote?.[0] || {};
  const adj = res.indicators?.adjclose?.[0]?.adjclose;

  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i] ?? adj?.[i];
    if (c == null || !Number.isFinite(c)) continue;   // 휴장일은 null 로 온다
    bars.push({
      t: ts[i] * 1000,
      o: num(q.open?.[i], c),
      h: num(q.high?.[i], c),
      l: num(q.low?.[i], c),
      c,
      v: num(q.volume?.[i], 0),
    });
  }

  const price = m.regularMarketPrice ?? bars.at(-1)?.c ?? null;
  const prev = prevClose(m, bars);
  const change = price != null && prev != null ? price - prev : null;
  const changePct = change != null && prev ? (change / prev) * 100 : null;

  return {
    symbol,
    ko: nameOf(symbol),
    name: m.shortName || m.longName || symbol,
    currency: m.currency || '',
    exchange: m.fullExchangeName || m.exchangeName || '',
    tz: m.exchangeTimezoneName || '',
    price, prev, change, changePct,
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    volume: m.regularMarketVolume ?? null,
    yearHigh: m.fiftyTwoWeekHigh ?? null,
    yearLow: m.fiftyTwoWeekLow ?? null,
    state: m.marketState || '',
    at: Date.now(),
    bars,
  };
}

const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

/**
 * 어제 종가를 찾는다.
 *
 * meta.chartPreviousClose 를 쓰면 안 된다. 그것은 '이 구간이 시작되기
 * 직전' 의 종가라서, range=5d 로 부르면 닷새 전 값이 온다. 그대로
 * 등락을 세면 하루 등락이 아니라 닷새 등락이 나온다 — 코스피가
 * 하루에 5퍼센트 올랐다고 적히는 식이다.
 *
 * 그래서 봉에서 직접 찾는다. 장중이면 마지막 봉이 오늘 것이므로
 * 그 앞 봉의 종가가 어제 종가다. 장이 끝났으면 마지막 봉이 곧 어제다.
 */
function prevClose(m, bars) {
  if (Number.isFinite(m.previousClose)) return m.previousClose;
  if (!bars.length) return Number.isFinite(m.chartPreviousClose) ? m.chartPreviousClose : null;

  const tz = m.exchangeTimezoneName || undefined;
  const nowMs = m.regularMarketTime ? m.regularMarketTime * 1000 : Date.now();

  if (bars.length >= 2 && sameDay(bars.at(-1).t, nowMs, tz)) return bars.at(-2).c;
  if (bars.length >= 2 && bars.at(-1).c === m.regularMarketPrice) return bars.at(-2).c;
  return bars.at(-1).c;
}

/** 두 시각이 그 거래소의 같은 날인가 */
function sameDay(a, b, tz) {
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    return f.format(new Date(a)) === f.format(new Date(b));
  } catch {
    return new Date(a).toDateString() === new Date(b).toDateString();
  }
}

/* ─────────────── 여럿 ─────────────── */

/**
 * 여럿을 한 번에 — spark 문.
 * 종가 줄과 그 앞 종가만 온다. 시세판에는 그것으로 넉넉하다.
 * @returns {Promise<Map<string, object>>} 기호 → 받은 것
 */
async function fetchSpark(symbols, opts = {}) {
  const range = opts.range || '5d';
  const interval = opts.interval || '1d';
  const key = `spark|${symbols.join(',')}|${range}|${interval}`;

  if (!opts.fresh) {
    const hit = cached(key);
    if (hit) return hit;
  }

  const url = `${SPARK}?symbols=${symbols.map(encodeURIComponent).join(',')}`
            + `&range=${range}&interval=${interval}`;
  const { data } = await fetchJSON(url, { timeout: 12_000 });

  // 두 가지 모양으로 온다 — 기호를 열쇠로 한 꾸러미이거나,
  // spark.result 줄이거나. 둘 다 받아 준다.
  const out = new Map();
  if (Array.isArray(data?.spark?.result)) {
    for (const r of data.spark.result) {
      const body = r?.response?.[0] || r;
      if (body?.symbol || r?.symbol) out.set(r.symbol || body.symbol, body);
    }
  } else if (data && typeof data === 'object') {
    for (const [sym, body] of Object.entries(data)) {
      if (body && typeof body === 'object') out.set(sym, body);
    }
  }
  if (!out.size) throw new Error('시세가 오지 않았습니다');

  cache.set(key, { at: Date.now(), data: out });
  return out;
}

/** spark 가 준 것을 시세판이 아는 모양으로 편다 */
function shapeSpark(body, w) {
  const ts = body?.timestamp || [];
  const cl = body?.close || [];

  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (c == null || !Number.isFinite(c)) continue;   // 휴장일은 null 로 온다
    bars.push({ t: ts[i] * 1000, o: c, h: c, l: c, c, v: 0 });
  }
  if (!bars.length) return null;

  const price = bars.at(-1).c;
  // 어제 종가는 chart 문에서와 똑같은 셈법으로 찾는다. 그래야 시세판의
  // 등락과 차트 머리의 등락이 다른 말을 하지 않는다.
  const prev = prevClose({
    exchangeTimezoneName: w.tz,
    regularMarketPrice: price,
    chartPreviousClose: body?.chartPreviousClose,
  }, bars);

  const change = price != null && prev != null ? price - prev : null;
  const changePct = change != null && prev ? (change / prev) * 100 : null;

  return {
    symbol: w.symbol,
    ko: nameOf(w.symbol),
    name: w.name || w.symbol,
    currency: currencyOf(w.symbol),
    exchange: '', tz: w.tz || '',
    price, prev, change, changePct,
    dayHigh: null, dayLow: null, volume: null,
    yearHigh: null, yearLow: null,
    state: '',
    at: Date.now(),
    bars,
    lite: true,        // 묶어서 받은 것 — 거래량·52주 값은 없다
  };
}

/**
 * 지켜보는 것들의 시세를 한꺼번에.
 * 하나가 실패해도 나머지는 온다.
 *
 * 먼저 묶어서 한 번에 묻고(spark), 그 길이 막혔거나 빠뜨린 것만
 * 예전처럼 하나씩 묻는다. 부름을 열둘에서 하나로 줄이는 자리다.
 */
export async function fetchWatch(watch, opts = {}) {
  const quotes = new Array(watch.length).fill(null);

  let sparked = null;
  try {
    sparked = await fetchSpark(watch.map((w) => w.symbol), opts);
  } catch {
    sparked = null;                       // 묶음 길이 막혔다. 하나씩 간다.
  }

  if (sparked) {
    watch.forEach((w, i) => {
      const q = shapeSpark(sparked.get(w.symbol), w);
      if (q) quotes[i] = { ...w, ...q, ok: true };
    });
  }

  // 못 받은 것만 하나씩. 대개 없거나 한둘이다.
  const missing = watch
    .map((w, i) => ({ w, i }))
    .filter(({ i }) => !quotes[i]);

  if (missing.length) {
    const settled = await pool(
      missing,
      ({ w }) => fetchOne(w.symbol, { range: '5d', interval: '1d', ...opts })
        .then((q) => ({ ...w, ...q, ok: true })),
      4,
    );
    settled.forEach((r, k) => {
      const { w, i } = missing[k];
      quotes[i] = r.status === 'fulfilled'
        ? r.value
        : { ...w, ok: false, why: String(r.reason?.message || r.reason), price: null, changePct: null };
    });
  }

  const at = Date.now();
  const any = quotes.some((q) => q.ok);
  emit('quotes:loaded', { quotes, at, ok: any });
  if (!any) {
    const err = new Error('시세를 하나도 가져오지 못했습니다');
    err.quotes = quotes;
    throw err;
  }
  return { quotes, at };
}

/* ─────────────── 봉에서 뽑는 것들 ─────────────── */

/** 이동평균 — 마지막 값 하나만 */
export function ma(bars, n) {
  if (!bars || bars.length < n) return null;
  let s = 0;
  for (let i = bars.length - n; i < bars.length; i++) s += bars[i].c;
  return s / n;
}

/** 이동평균 줄 전체 — 차트에 그린다 */
export function maLine(bars, n) {
  if (!bars || bars.length < n) return [];
  const out = new Array(bars.length).fill(null);
  let s = 0;
  for (let i = 0; i < bars.length; i++) {
    s += bars[i].c;
    if (i >= n) s -= bars[i - n].c;
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

/** 이 구간에서 가장 높았던 자리와 낮았던 자리 */
export function extremes(bars) {
  let hi = { v: -Infinity, t: null }, lo = { v: Infinity, t: null };
  for (const b of bars) {
    if (b.h > hi.v) hi = { v: b.h, t: b.t };
    if (b.l < lo.v) lo = { v: b.l, t: b.t };
  }
  return { hi, lo };
}

export function clearCache() { cache.clear(); }

/* ═══════════════════ 긴 줄을 한꺼번에 ═══════════════════

   분석 화면은 지켜보는 것 전부의 한 해치가 있어야 한다. 열두 개를
   하나씩 물으면 열두 번 나가고, 공개 프록시는 그쯤에서 문턱을 건다.

   spark 문은 종가 줄만 주는 대신 여럿을 한 번에 준다. 분석에 쓰는
   숫자 — 수익률·흔들림·판 깊이·같이 움직이는 정도 — 는 전부 종가만
   있으면 셈해진다. 그래서 여기서는 그 길로 간다.

   고가·저가가 없으므로 h=l=c 다. 한 해 폭 안의 자리를 잴 때 종가 폭을
   쓰게 되는데, 꼬리까지 재는 것보다 오히려 견주기에 낫다.
*/
export async function fetchSeries(watch, { range = '1y', interval = '1d', fresh = false } = {}) {
  const list = watch.map((w) => (typeof w === 'string' ? { symbol: w } : w));
  const got = await fetchSpark(list.map((w) => w.symbol), { range, interval, fresh });

  const out = [];
  for (const w of list) {
    const q = shapeSpark(got.get(w.symbol), w);
    if (q) out.push({ ...w, ...q, ok: true });
  }
  if (!out.length) throw new Error('시세가 오지 않았습니다');
  return out;
}

/* ═══════════════════ 찾기 ═══════════════════

   기호를 외우고 있는 사람은 없다. 삼성전자가 005930.KS 라는 것은
   알아도 SK하이닉스가 000660 인지 000670 인지는 헷갈린다. 그래서
   이름으로 찾을 수 있어야 한다.

   야후의 찾기 문을 쓴다. 길이 막히면 빈 목록을 돌려준다 — 찾기가
   안 된다고 화면이 멎으면 안 되고, 기호를 아는 사람은 그냥 적어
   넣으면 되기 때문이다.
*/
const SEARCH = 'https://query1.finance.yahoo.com/v1/finance/search';

export async function search(term, { limit = 12 } = {}) {
  const q = String(term || '').trim();
  if (q.length < 1) return [];

  const key = 'search|' + q.toLowerCase();
  const hit = cached(key);
  if (hit) return hit;

  try {
    const url = `${SEARCH}?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0&listsCount=0`;
    const { data } = await fetchJSON(url, { timeout: 9000 });

    const out = (data?.quotes || [])
      .filter((r) => r?.symbol)
      .map((r) => ({
        symbol: r.symbol,
        name: r.shortname || r.longname || r.symbol,
        ko: nameOf(r.symbol) !== r.symbol ? nameOf(r.symbol) : (r.shortname || r.symbol),
        kind: kindOf(r.quoteType),
        where: r.exchDisp || r.exchange || '',
      }));

    cache.set(key, { at: Date.now(), data: out });
    return out;
  } catch {
    return [];
  }
}

/** 야후가 부르는 종류를 이 사이트가 쓰는 이름으로 */
function kindOf(t) {
  switch (String(t || '').toUpperCase()) {
    case 'INDEX':      return 'index';
    case 'CURRENCY':   return 'fx';
    case 'CRYPTOCURRENCY': return 'crypto';
    case 'FUTURE':     return 'commodity';
    case 'ETF':
    case 'MUTUALFUND': return 'fund';
    default:           return 'stock';
  }
}
