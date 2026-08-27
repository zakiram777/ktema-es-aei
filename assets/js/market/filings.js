/* ═══════════════════════════════════════════════════════════════
   filings.js — 회사가 스스로 내는 말

   기사는 남이 회사에 대해 쓴 글이다. 공시는 회사가 스스로 낸 글이다.
   유상증자·최대주주 변경·감사의견 거절 같은 것은 기사보다 공시가
   먼저이고, 기사를 기다리면 이미 값이 움직인 뒤다.

   ── 두 곳 ──
   DART   한국. 열쇠가 있어야 하지만 공짜다 (하루 이만 번).
   SEC    미국. 열쇠가 아예 필요 없다. 대신 누가 부르는지 밝히라고
          한다 — User-Agent 를 요구하는데, 브라우저는 그 머리를
          바꿀 수 없으므로 프록시가 대신 붙여 주는 셈이 된다.

   ── 재무는 SEC 쪽만 ──
   SEC 는 회사가 제출한 재무제표를 XBRL 로 그대로 준다. 남이 가공한
   것이 아니라 원본이라 숫자를 의심할 필요가 없다. DART 도 재무를
   주지만 사업보고서 단위라 손이 훨씬 많이 간다. 여기서는 공시 목록만
   가져오고 재무는 미국 것만 본다 — 반쪽인 것을 알고 두는 반쪽이다.
   ═══════════════════════════════════════════════════════════════ */

import { fetchJSON } from '../net/proxy.js';
import * as store from '../core/store.js';

/* ═══════════════════ 한국 — DART ═══════════════════ */

const DART = 'https://opendart.fss.or.kr/api';

export const hasDartKey = () => !!String(store.get('keyDart') || '').trim();

/* 급한 것을 가려내는 낱말.

   소식 쪽(news/sources.js)의 속보 판정과 같은 결이되, 공시에는
   공시만의 말이 있다. '유상증자' 는 기사 제목에는 잘 안 나오지만
   공시에는 그대로 적힌다. */
const URGENT = [
  ['감사의견', 9], ['거절', 9], ['상장폐지', 10], ['관리종목', 9],
  ['최대주주변경', 8], ['유상증자', 7], ['무상증자', 5], ['감자', 8],
  ['전환사채', 6], ['신주인수권', 6], ['횡령', 10], ['배임', 10],
  ['소송', 5], ['영업정지', 8], ['부도', 10], ['회생절차', 10],
  ['정정', 4], ['자기주식', 5], ['합병', 7], ['분할', 6],
];

/** 얼마나 급한가 — 0이면 그냥 알림, 7 이상이면 속보 */
export function urgency(title) {
  const t = String(title || '');
  let score = 0;
  for (const [word, w] of URGENT) if (t.includes(word)) score = Math.max(score, w);
  return score;
}

/** 기호에서 여섯 자리 종목코드를 뽑는다. 005930.KS → 005930 */
export const codeOf = (symbol) => {
  const m = /^(\d{6})\.(KS|KQ)$/i.exec(String(symbol || ''));
  return m ? m[1] : null;
};

/**
 * 최근 공시 목록.
 *
 * 종목코드를 주면 그 회사만, 안 주면 전체에서 최근 것을 받는다.
 * 하루치만 본다 — 그 이상은 목록이지 소식이 아니다.
 *
 * @param {{codes?:string[], days?:number, max?:number}} opts
 */
export async function recent({ codes = [], days = 2, max = 40 } = {}) {
  const key = String(store.get('keyDart') || '').trim();
  if (!key) throw new Error('DART 열쇠가 없습니다');

  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

  // 종목마다 따로 물어야 한다. 열 개까지만 — 그 이상은 하루 한도를
  // 갉아먹기만 하고, 사람이 읽지도 않는다.
  const targets = codes.length ? codes.slice(0, 10) : [null];
  const out = [];

  for (const code of targets) {
    const url = `${DART}/list.json?crtfc_key=${encodeURIComponent(key)}`
              + `&bgn_de=${ymd(start)}&end_de=${ymd(end)}`
              + (code ? `&corp_code=&stock_code=${code}` : '')
              + `&page_count=${Math.min(100, max)}`;
    try {
      const { data } = await fetchJSON(url, { timeout: 12_000 });
      // status 000 이 성공. 013 은 "찾은 것이 없다" 로 탈이 아니다.
      if (data?.status === '013') continue;
      if (data?.status && data.status !== '000') {
        throw new Error(data.message || ('DART 가 ' + data.status + ' 라고 답했습니다'));
      }
      for (const r of data?.list || []) out.push(shapeDart(r));
    } catch (err) {
      if (targets.length === 1) throw err;      // 하나뿐이면 그대로 알린다
    }
  }

  // 새것부터, 같은 것은 하나만
  const seen = new Set();
  return out
    .filter((x) => (seen.has(x.id) ? false : seen.add(x.id)))
    .sort((a, b) => b.time - a.time)
    .slice(0, max);
}

function shapeDart(r) {
  const time = parseYmd(r.rcept_dt);
  const score = urgency(r.report_nm);
  return {
    id: 'dart:' + r.rcept_no,
    kind: 'filing',
    title: `${r.corp_name} — ${r.report_nm}`,
    fullTitle: `${r.corp_name} — ${r.report_nm}`,
    summary: `${r.flr_nm} 가 ${r.rcept_dt} 에 제출했습니다.`
           + (r.rm ? ` (${r.rm})` : ''),
    srcName: 'DART 공시',
    srcId: 'dart',
    link: 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo=' + r.rcept_no,
    time,
    stock: r.stock_code || null,
    score,
    flag: score >= 7 ? '공시' : null,
    isNew: Date.now() - time < 36 * 3_600_000,
  };
}

/** 20260828 → 밀리초. 시각이 없으므로 그날 장 마감쯤으로 둔다. */
function parseYmd(s) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(s || ''));
  if (!m) return Date.now();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 16, 0).getTime();
}

/* ═══════════════════ 미국 — SEC ═══════════════════

   공짜로 얻을 수 있는 가장 깨끗한 재무 데이터다. 회사가 제출한
   원본이라 남이 고쳐 놓았을 걱정이 없다.

   기호와 CIK 를 잇는 표를 먼저 받아야 한다. 만 개쯤 되는데 한 번
   받아 두면 그 뒤로는 안 부른다. */

const SEC_TICKERS = 'https://www.sec.gov/files/company_tickers.json';
const SEC_FACTS = 'https://data.sec.gov/api/xbrl/companyconcept';

let tickerMap = null;

async function cik(symbol) {
  const sym = String(symbol || '').toUpperCase();
  if (!/^[A-Z.]{1,6}$/.test(sym)) return null;      // 한국 기호는 여기 없다

  if (!tickerMap) {
    const { data } = await fetchJSON(SEC_TICKERS, { timeout: 15_000 });
    tickerMap = new Map();
    for (const row of Object.values(data || {})) {
      if (row?.ticker) tickerMap.set(String(row.ticker).toUpperCase(), row.cik_str);
    }
  }

  const n = tickerMap.get(sym);
  return n == null ? null : String(n).padStart(10, '0');
}

/* 무엇을 볼 것인가.

   회사마다 쓰는 항목 이름이 조금씩 다르다 (매출을 Revenues 라고도
   하고 RevenueFromContractWithCustomer... 라고도 한다). 그래서
   후보를 여럿 두고 먼저 잡히는 것을 쓴다. */
const CONCEPTS = [
  {
    id: 'rev', ko: '매출',
    tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'],
  },
  { id: 'ni', ko: '순이익', tags: ['NetIncomeLoss'] },
  { id: 'eps', ko: '주당순이익', tags: ['EarningsPerShareDiluted', 'EarningsPerShareBasic'], per: true },
  { id: 'assets', ko: '자산', tags: ['Assets'] },
  { id: 'equity', ko: '자본', tags: ['StockholdersEquity'] },
  {
    id: 'shares', ko: '주식수',
    tags: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'CommonStockSharesOutstanding'],
  },
];

/**
 * 한 종목의 재무 항목들.
 *
 * 열쇠가 필요 없다. 다만 미국 상장사만 있다 — 한국 종목을 주면
 * 조용히 빈 것을 돌려준다.
 */
export async function financials(symbol) {
  const id = await cik(symbol);
  if (!id) return { ok: false, why: '미국 상장사만 받을 수 있습니다 (SEC 자료입니다).' };

  const out = [];
  for (const c of CONCEPTS) {
    let got = null;
    for (const tag of c.tags) {
      try {
        const url = `${SEC_FACTS}/CIK${id}/us-gaap/${tag}.json`;
        const { data } = await fetchJSON(url, { timeout: 14_000 });
        const rows = pickAnnual(data);
        if (rows.length >= 2) { got = { ...c, tag, rows }; break; }
      } catch { /* 다음 후보로 */ }
    }
    if (got) out.push(got);
  }

  if (!out.length) return { ok: false, why: '재무 항목을 하나도 받지 못했습니다.' };
  return { ok: true, cik: id, symbol, items: out };
}

/**
 * 해마다 한 줄로 추린다.
 *
 * XBRL 은 같은 해를 여러 번 준다 — 처음 낼 때 한 번, 다음 해에 견주려고
 * 또 한 번, 고쳐 낼 때 또 한 번. 그래서 회계연도마다 가장 나중에 제출된
 * 것만 남긴다. 고쳐 낸 것이 있으면 그것이 맞는 값이다.
 */
function pickAnnual(data) {
  const units = data?.units || {};
  const rows = [];

  for (const [unit, arr] of Object.entries(units)) {
    for (const r of arr) {
      if (r.form !== '10-K' && r.form !== '20-F') continue;
      if (r.fp && r.fp !== 'FY') continue;
      if (!Number.isFinite(r.val) || !r.fy) continue;
      rows.push({ fy: r.fy, val: r.val, unit, filed: r.filed, end: r.end });
    }
  }

  const byYear = new Map();
  for (const r of rows) {
    const cur = byYear.get(r.fy);
    if (!cur || String(r.filed) > String(cur.filed)) byYear.set(r.fy, r);
  }

  return [...byYear.values()]
    .sort((a, b) => a.fy - b.fy)
    .slice(-12);
}
