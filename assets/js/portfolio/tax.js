/* ═══════════════════════════════════════════════════════════════
   tax.js — 확실한 돈

   이 사이트의 다른 숫자들은 전부 "지난 값이 이랬다" 는 이야기다.
   이것만은 다르다. 세금은 계산이고, 계산은 맞거나 틀리거나 둘 중
   하나다. 수익률을 맞히는 것보다 세금을 덜 내는 것이 훨씬 확실하다.

   ── 셈하는 얼개 ──
   해외주식 양도소득: 한 해의 이익과 손실을 합치고, 기본공제를 뺀 뒤
   세율을 매긴다. 손실이 이익을 상계하므로 여기서 손실 수확이 나온다.

   국내 상장주식은 소액주주면 양도소득세가 없다. 그래서 손실 수확도
   해외 것에만 뜻이 있다.

   배당은 받을 때 이미 떼인다(원천징수). 다만 한 해 금융소득이 일정
   금액을 넘으면 종합과세로 넘어가 세율이 달라진다.

   ── 세율은 손으로 고칠 수 있게 두었다 ──
   세법은 바뀐다. 코드에 박아 두면 바뀐 다음 해에 틀린 숫자를 자신
   있게 내놓는다. 그래서 값을 설정에 두고, 화면에 "언제 기준인지"를
   같이 적는다.

   ── 이것은 세무 상담이 아니다 ──
   여기서 하는 일은 사람이 넣은 세율로 사람이 적은 장부를 더하고 빼는
   것뿐이다. 실제 신고는 반드시 확인하고 해야 한다. 화면에도 그렇게
   적어 둔다.
   ═══════════════════════════════════════════════════════════════ */

import * as book from './book.js';
import * as store from '../core/store.js';

/** 처음 값. 설정에서 고칠 수 있다. */
export const DEFAULTS = {
  overseasRate: 22,        // 해외주식 양도소득세 (지방소득세 포함) %
  overseasFree: 2_500_000, // 연 기본공제 (원)
  dividendRate: 15.4,      // 배당소득 원천징수 %
  financeCap: 20_000_000,  // 이 금액을 넘으면 종합과세로 넘어간다 (원)
  domesticTaxed: false,    // 국내 상장주식 양도세 대상인가 (대주주면 참)
  asOf: '2026년 기준으로 넣은 값',
};

export function rates() {
  const saved = store.get('tax') || {};
  return { ...DEFAULTS, ...saved };
}

/** 국내 상장주식인가 — 소액주주면 양도세가 없다 */
const isDomestic = (symbol) => /\.(KS|KQ)$/i.test(String(symbol || ''));

/* ═══════════════════ 올해 실현된 것 ═══════════════════ */

/**
 * 한 해의 실현손익과 그 세금.
 *
 * @param {number} year
 * @param {{rate?:object, priceOf?:(sym)=>number}} opts
 */
export function realized(year = new Date().getFullYear(), opts = {}) {
  const r = { ...rates(), ...(opts.rate || {}) };
  const { realizedRows, } = book.positions();

  const mine = realizedRows.filter((x) => new Date(x.at).getFullYear() === year);

  const overseas = mine.filter((x) => !isDomestic(x.symbol));
  const domestic = mine.filter((x) => isDomestic(x.symbol));

  // 돈이 섞여 있으면 그대로 더할 수 없다. 환산은 셈하는 쪽에서 넘겨 준다.
  const conv = opts.toBase || ((v) => v);

  const sum = (rows) => rows.reduce((a, x) => a + conv(x.gain, x.currency, x.at), 0);

  const overseasGain = sum(overseas);
  const domesticGain = sum(domestic);

  const taxableBase = Math.max(0, overseasGain - r.overseasFree);
  const overseasTax = taxableBase * (r.overseasRate / 100);

  const domesticTax = r.domesticTaxed
    ? Math.max(0, domesticGain - r.overseasFree) * (r.overseasRate / 100)
    : 0;

  // 배당은 받을 때 이미 떼였다. 얼마였는지만 되짚어 준다.
  const divs = book.all()
    .filter((t) => t.kind === 'div' && new Date(t.at).getFullYear() === year);
  const dividend = divs.reduce((a, t) => a + conv(t.amount, t.currency, t.at), 0);
  const dividendTax = dividend * (r.dividendRate / 100);

  return {
    year, rate: r,
    overseas: { rows: overseas, gain: overseasGain, taxable: taxableBase, tax: overseasTax },
    domestic: { rows: domestic, gain: domesticGain, tax: domesticTax },
    dividend: { amount: dividend, tax: dividendTax, count: divs.length },
    // 공제가 얼마나 남았나 — 손실 수확을 할지 말지가 여기서 갈린다
    freeLeft: Math.max(0, r.overseasFree - Math.max(0, overseasGain)),
    totalTax: overseasTax + domesticTax,
  };
}

/* ═══════════════════ 손실 수확 ═══════════════════

   지금 손실 중인 해외 종목을 팔면 그만큼 올해 양도차익이 줄고, 줄어든
   만큼 세금이 준다. 팔고 바로 다시 사면 들고 있는 것은 그대로인데
   세금만 줄어든다.

   ── 이것이 공짜가 아닌 까닭 ──
   1. 다시 살 때 취득가가 낮아진다. 나중에 팔 때 그만큼 더 낸다.
      지금 안 내고 나중에 내는 것 — '미루기' 이지 '없애기' 가 아니다.
      다만 미루는 것만으로도 값이 있다. 그 돈이 그동안 일한다.
   2. 팔고 사는 사이에 값이 뛸 수 있다. 그 위험은 실재한다.
   3. 수수료가 두 번 든다.

   그래서 "이만큼 아낀다" 가 아니라 "이만큼 미룬다" 로 적는다.

   ── 얼마나 팔면 되나 ──
   올해 이익이 공제액 아래로 내려가면 그 뒤로는 더 팔아도 세금이 안
   준다. 그 지점까지만 권한다 — 필요 이상으로 팔게 하는 도구는 나쁘다.
*/

/**
 * @param {Array} positions  book.positions().rows
 * @param {(sym)=>number} priceOf  지금 값
 */
export function harvest(positions, priceOf, opts = {}) {
  const r = { ...rates(), ...(opts.rate || {}) };
  const conv = opts.toBase || ((v) => v);
  const year = opts.year || new Date().getFullYear();

  const now = realized(year, opts);
  const gain = now.overseas.gain;

  // 이익이 공제 아래면 팔아 봐야 줄일 세금이 없다
  const room = Math.max(0, gain - r.overseasFree);

  const losers = positions
    .filter((p) => p.open && !isDomestic(p.symbol) && p.avg != null)
    .map((p) => {
      const px = priceOf(p.symbol);
      if (!Number.isFinite(px)) return null;
      const unreal = conv((px - p.avg) * p.qty, p.currency, Date.now());
      return {
        symbol: p.symbol, ko: p.ko, currency: p.currency,
        qty: p.qty, avg: p.avg, price: px,
        unrealized: unreal,
        pct: p.avg > 0 ? (px / p.avg - 1) * 100 : null,
      };
    })
    .filter((x) => x && x.unrealized < 0)
    .sort((a, b) => a.unrealized - b.unrealized);   // 깊은 것부터

  // 어디까지 팔면 되나
  let left = room;
  const plan = [];
  for (const l of losers) {
    if (left <= 0) break;
    const use = Math.min(left, -l.unrealized);
    plan.push({ ...l, use, whole: use >= -l.unrealized - 1 });
    left -= use;
  }

  const saved = (room - Math.max(0, left)) * (r.overseasRate / 100);

  return {
    year, rate: r,
    gain, room,
    losers,
    plan,
    saved,
    lossPool: losers.reduce((a, x) => a + x.unrealized, 0),
    enough: left <= 0,
    // 국내 것은 세는 데서 뺐다는 사실을 화면에서 밝히려고 함께 낸다
    domesticSkipped: positions.filter((p) => p.open && isDomestic(p.symbol)).length,
  };
}

/* ═══════════════════ 금융소득 종합과세 ═══════════════════

   배당과 이자를 합쳐 한 해에 일정 금액을 넘으면 종합과세로 넘어간다.
   넘어가면 다른 소득과 합산되어 세율이 크게 달라질 수 있다.

   여기서는 "지금 얼마이고 문턱까지 얼마 남았나" 만 말한다. 넘었을 때
   실제 세액이 얼마인지는 다른 소득을 알아야 하고, 그것은 이 사이트가
   알 바가 아니다. */
export function financeIncome(year = new Date().getFullYear(), opts = {}) {
  const r = { ...rates(), ...(opts.rate || {}) };
  const conv = opts.toBase || ((v) => v);

  const divs = book.all()
    .filter((t) => t.kind === 'div' && new Date(t.at).getFullYear() === year);
  const total = divs.reduce((a, t) => a + conv(t.amount, t.currency, t.at), 0);

  return {
    year,
    total,
    cap: r.financeCap,
    left: r.financeCap - total,
    over: total > r.financeCap,
    pct: r.financeCap > 0 ? (total / r.financeCap) * 100 : 0,
  };
}
