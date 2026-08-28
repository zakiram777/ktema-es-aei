/* ═══════════════════════════════════════════════════════════════
   book.js — 실제로 무엇을 얼마에 언제 샀는가

   이 사이트가 지금까지 못 하던 것은 기능 하나가 아니라 한 가지
   사실이었다. 내가 실제로 무엇을 들고 있는지 몰랐다. 모든 숫자가
   "고르게 담았다면" 이라는 가정 위에 있었다.

   장부 하나가 들어오면 이미 만들어 둔 것들이 전부 진짜가 된다.
   위험 기여도는 가정된 균등비중이 아니라 내 비중으로 셈해지고,
   투자선 위에 내 점이 찍히고, 리밸런싱은 가정이 아니라 "지금 무엇을
   얼마나 팔아야 하는가" 가 된다.

   ── 무엇을 적나 ──
   거래 하나하나다. 잔고가 아니라 거래를 적는 까닭은, 잔고만 알면
   "언제 넣었나" 를 알 수 없고 그것을 모르면 내가 실제로 번 것(MWR)을
   셈할 수 없기 때문이다.

     buy · sell     주식을 사고팜
     div            배당을 받음
     deposit        돈을 넣음        withdraw  돈을 뺌
     fee            따로 나간 값 (환전 수수료 같은 것)

   ── 왜 평균단가를 이동평균으로 하나 ──
   한국 세법도 증권사도 대개 이동평균법을 쓴다. 선입선출(FIFO)로 하면
   증권사 화면과 숫자가 달라져서, 맞는데도 틀린 것처럼 보인다.

   ── 돈이 섞이는 문제 ──
   원화와 달러가 한 장부에 섞인다. 값을 하나로 모으려면 환율이 있어야
   하는데, 그것은 여기서 하지 않고 셈하는 쪽(perf.js)에 맡긴다. 여기서는
   각 거래가 어느 돈이었는지만 정확히 적어 둔다.
   ═══════════════════════════════════════════════════════════════ */

import { currencyOf, nameOf } from '../market/symbols.js';

const KEY = 'ktema.book.v1';

/** 거래의 갈래 */
export const KINDS = [
  { id: 'buy',      ko: '샀다',     sign: -1, needs: ['symbol', 'qty', 'price'] },
  { id: 'sell',     ko: '팔았다',   sign: +1, needs: ['symbol', 'qty', 'price'] },
  { id: 'div',      ko: '배당받음', sign: +1, needs: ['symbol', 'amount'] },
  { id: 'deposit',  ko: '넣었다',   sign: +1, needs: ['amount'], cash: true },
  { id: 'withdraw', ko: '뺐다',     sign: -1, needs: ['amount'], cash: true },
  { id: 'fee',      ko: '비용',     sign: -1, needs: ['amount'] },
];

export const kindById = (id) => KINDS.find((k) => k.id === id) || KINDS[0];

/* ─────────────── 들고 나기 ─────────────── */

export function all() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.sort((a, b) => a.at - b.at) : [];
  } catch {
    return [];
  }
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;   // 사생활 보호 창 — 이번 방문에만 남는다
  }
}

/**
 * 거래 하나를 적거나 고쳐 적는다.
 * @param {object} tx
 */
export function save(tx) {
  const list = all();
  const kind = kindById(tx.kind);
  const now = Date.now();

  const clean = {
    id: tx.id || 't' + now.toString(36) + Math.random().toString(36).slice(2, 5),
    at: tx.at || now,
    kind: kind.id,
    symbol: kind.cash ? null : String(tx.symbol || '').trim().toUpperCase(),
    ko: kind.cash ? null : (tx.ko || nameOf(tx.symbol) || null),
    qty: num(tx.qty),
    price: num(tx.price),
    amount: num(tx.amount),
    fee: num(tx.fee) || 0,
    currency: tx.currency || (kind.cash ? (tx.currency || 'KRW') : currencyOf(tx.symbol)),
    note: String(tx.note || '').trim().slice(0, 300),
  };

  if (!kind.cash && !clean.symbol) return null;
  for (const need of kind.needs) {
    if (need === 'symbol') continue;
    if (!Number.isFinite(clean[need]) || clean[need] === 0) return null;
  }

  // 사고팔 때의 현금 흐름은 수량×단가에서 나온다. 따로 적게 하면
  // 둘이 어긋나고, 어긋나면 어느 쪽이 맞는지 알 수 없다.
  if (kind.id === 'buy' || kind.id === 'sell') {
    clean.amount = clean.qty * clean.price;
  }

  const at = list.findIndex((x) => x.id === clean.id);
  if (at >= 0) list[at] = clean;
  else list.push(clean);

  list.sort((a, b) => a.at - b.at);
  return persist(list) ? clean : null;
}

export function remove(id) {
  return persist(all().filter((x) => x.id !== id));
}

export const byId = (id) => all().find((x) => x.id === id) || null;

export const clear = () => persist([]);

/* ═══════════════════ 지금 무엇을 들고 있나 ═══════════════════

   거래를 시간 순으로 되짚으며 수량과 평균단가를 굴린다.

   ── 팔 때 평균단가는 안 움직인다 ──
   흔한 실수다. 백 주를 만 원에 사고 오십 주를 이만 원에 팔면, 남은
   오십 주의 평균단가는 여전히 만 원이다. 판 것에서 남긴 이익은
   '실현손익' 으로 따로 빠지고 단가에는 손대지 않는다.

   ── 수수료는 취득가에 얹는다 ──
   살 때 낸 수수료는 그 주식을 갖기 위해 쓴 돈이므로 취득가의 일부다.
   팔 때 낸 것은 받은 돈에서 뺀다. 세금을 셈할 때 이 구분이 값을 한다.
*/
export function positions(list = all()) {
  const pos = new Map();     // symbol → { qty, cost, ... }
  let realized = 0;          // 실현손익 (돈이 섞여 있으면 이 숫자는 뜻이 흐리다)
  const realizedRows = [];
  let dividends = 0;

  for (const tx of list) {
    if (tx.kind === 'deposit' || tx.kind === 'withdraw') continue;

    if (tx.kind === 'fee') { realized -= tx.amount; continue; }

    const key = tx.symbol;
    if (!key) continue;

    if (!pos.has(key)) {
      pos.set(key, {
        symbol: key,
        ko: tx.ko || nameOf(key),
        currency: tx.currency,
        qty: 0, cost: 0,         // cost = 남은 수량의 취득가 합
        realized: 0, dividends: 0,
        firstAt: tx.at, lastAt: tx.at,
        buys: 0, sells: 0,
      });
    }
    const p = pos.get(key);
    p.lastAt = tx.at;

    if (tx.kind === 'buy') {
      p.qty += tx.qty;
      p.cost += tx.qty * tx.price + (tx.fee || 0);
      p.buys += 1;
    } else if (tx.kind === 'sell') {
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      const sold = Math.min(tx.qty, p.qty);
      const gain = sold * tx.price - sold * avg - (tx.fee || 0);

      p.realized += gain;
      realized += gain;
      realizedRows.push({
        at: tx.at, symbol: key, ko: p.ko, currency: p.currency,
        qty: sold, price: tx.price, avg,
        gain, fee: tx.fee || 0,
      });

      p.qty -= sold;
      p.cost -= sold * avg;          // 판 만큼만 덜어 낸다. 단가는 그대로.
      if (p.qty < 1e-9) { p.qty = 0; p.cost = 0; }
      p.sells += 1;
    } else if (tx.kind === 'div') {
      p.dividends += tx.amount;
      dividends += tx.amount;
    }
  }

  return {
    rows: [...pos.values()].map((p) => ({
      ...p,
      avg: p.qty > 0 ? p.cost / p.qty : null,
      open: p.qty > 0,
    })),
    realized,
    realizedRows,
    dividends,
  };
}

/** 지금 들고 있는 것만 — 시세를 부를 때 쓴다 */
export function heldSymbols(list = all()) {
  return positions(list).rows.filter((p) => p.open).map((p) => p.symbol);
}

/** 장부에 한 번이라도 나온 기호 전부 — 값을 되짚으려면 판 것도 필요하다 */
export function allSymbols(list = all()) {
  return [...new Set(list.map((t) => t.symbol).filter(Boolean))];
}

/** 장부가 걸쳐 있는 기간 */
export function span(list = all()) {
  if (!list.length) return null;
  return { from: list[0].at, to: Date.now(), days: Math.round((Date.now() - list[0].at) / 86_400_000) };
}

/* ═══════════════════ 옮기기 ═══════════════════

   장부는 이 브라우저에만 남는다. 다른 기기로 옮기거나 백업하려면
   파일로 내보내야 한다. 설정(settings.json)에는 담지 않는다 —
   그 파일은 웹호스팅에 올려도 된다고 적어 두었는데, 남의 매매 내역이
   거기 있으면 안 된다. */

export function exportAll() {
  return {
    kind: 'ktema-book',
    version: 1,
    savedAt: new Date().toISOString(),
    transactions: all(),
  };
}

export function importAll(data, { replace = false } = {}) {
  if (!data || data.kind !== 'ktema-book') {
    throw new Error('Κτῆμα 장부 파일이 아닙니다');
  }
  const incoming = Array.isArray(data.transactions) ? data.transactions : [];
  const base = replace ? [] : all();
  const seen = new Set(base.map((x) => x.id));

  let added = 0;
  for (const tx of incoming) {
    if (!tx?.id || seen.has(tx.id)) continue;
    base.push(tx);
    seen.add(tx.id);
    added += 1;
  }
  base.sort((a, b) => a.at - b.at);
  persist(base);
  return { added, total: base.length };
}

/* ─────────────── 밑감 ─────────────── */

function num(v) {
  if (v === '' || v == null) return NaN;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/* 보기 장부 — 처음 오는 사람이 무엇을 적는 자리인지 알게.
   실제로 넣지는 않고, 화면에서 "보기" 를 누를 때만 쓴다. */
export const SAMPLE = [
  { kind: 'deposit', amount: 10_000_000, currency: 'KRW', note: '처음 넣은 돈', daysAgo: 400 },
  { kind: 'buy', symbol: '005930.KS', qty: 60, price: 72_000, fee: 1_100, daysAgo: 395 },
  { kind: 'buy', symbol: '^KS11', qty: 0, price: 0, skip: true },
  { kind: 'buy', symbol: 'AAPL', qty: 12, price: 195.4, fee: 900, currency: 'USD', daysAgo: 300 },
  { kind: 'div', symbol: '005930.KS', amount: 21_000, daysAgo: 200 },
  { kind: 'sell', symbol: '005930.KS', qty: 20, price: 81_500, fee: 1_400, daysAgo: 120 },
  { kind: 'buy', symbol: 'GC=F', qty: 3, price: 2_380, currency: 'USD', daysAgo: 90 },
];
