/* ═══════════════════════════════════════════════════════════════
   macro.js — 시세 밑에 깔린 것

   이 사이트에는 시세와 소식이 있는데 그 밑에 깔린 것이 없었다.

   수익률곡선이 뒤집힌 채 열두 달째라는 사실은 어떤 종목 차트에도
   안 나온다. 그런데 모든 종목 차트를 다르게 읽게 만든다.

   ── 어디서 받나 ──
   FRED. 세인트루이스 연준이 내는 미국 경제 시계열 팔십만 종이다.
   열쇠가 있어야 하지만 공짜이고 한도도 없다. CORS 가 닫혀 있어
   프록시를 거치는데, 그 사다리는 이미 있다.

   열쇠 없이 받는 뒷길도 두려 했으나 그 길은 막혀 있었다 (아래).

   ── 열쇠를 안 넣으면 ──
   화면이 비는 대신 "열쇠를 넣으면 여기가 채워집니다" 라고 말한다.
   기능 하나가 없다고 사이트가 반쪽이 되어서는 안 된다.
   ═══════════════════════════════════════════════════════════════ */

import { fetchJSON } from '../net/proxy.js';
import * as store from '../core/store.js';

const FRED = 'https://api.stlouisfed.org/fred/series/observations';

/* 무엇을 보여 줄 것인가.

   여덟 개쯤이 한계다. 더 늘리면 보는 사람이 무엇이 중요한지 모른다.
   여기 고른 것들은 전부 "지금 돈이 싼가 비싼가, 그리고 사람들이
   겁내고 있는가" 를 다른 각도에서 묻는다. */
export const SERIES = [
  {
    id: 'T10Y2Y', ko: '10년 − 2년', gr: 'Καμπύλη',
    unit: '%p', invert: true,
    note: '긴 돈이 짧은 돈보다 싸지면(음수) 사람들이 앞을 나쁘게 본다는 뜻이다. '
        + '지난 여섯 번의 침체 앞에 모두 이 값이 음수였다. 다만 뒤집힌 뒤 '
        + '실제로 오기까지는 대개 한 해 넘게 걸렸다.',
  },
  {
    id: 'T10Y3M', ko: '10년 − 3달', gr: 'Καμπύλη',
    unit: '%p', invert: true,
    note: '같은 것을 더 짧은 쪽으로 잰다. 연준이 보는 것은 이쪽이다.',
  },
  {
    id: 'DGS10', ko: '10년 국채', gr: 'Τόκος',
    unit: '%',
    note: '세상의 모든 값에 붙는 바닥값. 이것이 오르면 먼 미래의 돈이 싸진다.',
  },
  {
    id: 'DFII10', ko: '10년 실질금리', gr: 'Ἀληθής',
    unit: '%',
    note: '물가를 뺀 금리. 금값이 여기에 가장 크게 붙어 움직인다.',
  },
  {
    id: 'BAMLH0A0HYM2', ko: '하이일드 가산금리', gr: 'Κίνδυνος',
    unit: '%p', invert: true,
    note: '위태로운 회사가 돈을 빌릴 때 얹는 값. 겁이 나기 시작하면 '
        + '주가보다 먼저 벌어진다.',
  },
  {
    id: 'VIXCLS', ko: '변동성 지수', gr: 'Φόβος',
    unit: '', invert: true,
    note: '앞으로 한 달의 흔들림을 시장이 얼마로 보고 있나. 20 아래면 잠잠, '
        + '30 위면 겁먹은 것이다.',
  },
  {
    id: 'UNRATE', ko: '실업률', gr: 'Ἀργία',
    unit: '%', invert: true, monthly: true,
    note: '바닥에서 반 퍼센트포인트 올라오면 대개 이미 침체다. 늦게 오는 대신 '
        + '거의 틀리지 않는다.',
  },
  {
    id: 'CPIAUCSL', ko: '소비자물가', gr: 'Τιμαί',
    unit: '', monthly: true, yoy: true,
    note: '전년 같은 달 대비. 금리를 정하는 것이 결국 이 숫자다.',
  },
];

export const hasKey = () => !!String(store.get('keyFred') || '').trim();

/**
 * 한 시계열을 받는다.
 * @returns {Promise<{id, ko, points:[{t,v}], last, prev, note, unit}>}
 */
export async function one(def, { years = 5 } = {}) {
  const key = String(store.get('keyFred') || '').trim();
  if (!key) throw new Error('FRED 열쇠가 없습니다');

  const start = new Date();
  start.setFullYear(start.getFullYear() - years);
  const from = start.toISOString().slice(0, 10);

  const url = `${FRED}?series_id=${def.id}&api_key=${encodeURIComponent(key)}`
            + `&file_type=json&observation_start=${from}`;

  const { data } = await fetchJSON(url, { timeout: 12_000 });

  const points = (data?.observations || [])
    .map((o) => ({ t: Date.parse(o.date), v: Number(o.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));

  if (!points.length) throw new Error(def.ko + ' 값이 비어 있습니다');

  return shape(def, points);
}

/** 여럿을 한꺼번에. 하나가 실패해도 나머지는 온다. */
export async function all(defs = SERIES, opts = {}) {
  const out = [];
  for (const def of defs) {
    try {
      out.push(await one(def, opts));
    } catch (err) {
      out.push({ ...def, points: [], error: err.message });
    }
  }
  return out;
}

/* ─────────────── 모양 만들기 ─────────────── */

function shape(def, raw) {
  let points = raw;

  // 물가는 지수로 온다. 그대로 보면 아무 뜻이 없어서 전년 대비로 고친다.
  if (def.yoy) {
    const byMonth = new Map(raw.map((p) => [monthKey(p.t), p.v]));
    points = raw.map((p) => {
      const d = new Date(p.t);
      d.setFullYear(d.getFullYear() - 1);
      const before = byMonth.get(monthKey(d.getTime()));
      return before ? { t: p.t, v: (p.v / before - 1) * 100 } : null;
    }).filter(Boolean);
  }

  const last = points[points.length - 1];
  const prev = points[Math.max(0, points.length - (def.monthly ? 2 : 22))];

  // 지난 다섯 해 안에서 지금이 어디쯤인가. 값 자체보다 이쪽이 견주기 쉽다.
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);

  return {
    ...def,
    points,
    last: last?.v ?? null,
    lastAt: last?.t ?? null,
    prev: prev?.v ?? null,
    change: last && prev ? last.v - prev.v : null,
    lo, hi,
    pos: hi > lo && last ? ((last.v - lo) / (hi - lo)) * 100 : null,
  };
}

const monthKey = (t) => {
  const d = new Date(t);
  return d.getFullYear() + '-' + d.getMonth();
};

/* ═══════════════ Stooq 는 쓰지 않는다 ═══════════════

   처음에는 열쇠 없이 받는 뒷길로 Stooq 를 두려 했다. 헤더만 보면
   200 이 돌아와서 열려 있는 줄 알았는데, 본문을 열어 보니 CSV 가
   아니라 자바스크립트로 푸는 문제였다 — 해시를 돌려 답을 보내야
   비로소 자료를 준다.

   그것은 사람이 아닌 것을 걸러 내려고 세운 문이다. 넘을 방법이
   없지는 않지만 넘지 않는다. 넘으라고 세운 문이 아니다.

   그래서 뒷길은 열쇠가 필요하되 공짜인 곳(FRED · Alpha Vantage)으로
   두었다. 열쇠를 안 넣은 사람에게는 화면을 비워 두는 대신 어디서
   받는지를 적어 준다 — 삼십 초면 끝나는 일이다.

   ── 헤더만 보고 판단하지 말 것 ──
   이 자리에서 한 번 속았다. 다음에 새 길을 들일 때는 반드시 본문을
   열어 보고, 받은 것이 정말로 그 자료인지 확인할 것. */

/** 열쇠를 어디서 받나 — 화면에 그대로 띄운다 */
export const KEY_HOWTO = {
  fred: {
    ko: 'FRED',
    url: 'https://fredaccount.stlouisfed.org/apikeys',
    note: '세인트루이스 연준. 전자우편만 넣으면 바로 나옵니다. 값도 한도도 없습니다.',
  },
  dart: {
    ko: 'DART',
    url: 'https://opendart.fss.or.kr/uss/umt/EgovMberInsertView.do',
    note: '금융감독원 전자공시. 가입 뒤 바로 나옵니다. 하루 이만 번까지.',
  },
  alpha: {
    ko: 'Alpha Vantage',
    url: 'https://www.alphavantage.co/support/#api-key',
    note: '야후가 막히는 날의 뒷길입니다. 하루 스물다섯 번까지라 평소에는 쓰지 않습니다.',
  },
};
