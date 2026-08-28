/* ═══════════════════════════════════════════════════════════════
   intraday.js — 하루 안에서만 보이는 것

   일봉은 하루를 네 숫자로 줄인다 (시·고·저·종). 그 넷으로는 답할 수
   없는 물음이 있다.

     갭으로 열린 날은 종가까지 메웠나
     하루 변동의 몇 할이 장 시작 삼십 분에 벌어지나
     오늘 사람들이 실제로 사고판 평균값은 얼마인가

   앞의 둘은 일봉으로도 대충 되지만, 세 번째(VWAP)는 분봉이 없으면
   아예 셈할 수 없다.

   ── 왜 이것이 값진가 ──
   기관은 하루 종일 나눠 산다. 그래서 그들의 체결가는 종가가 아니라
   VWAP 에 가깝다. "지금 값이 VWAP 위인가 아래인가" 는 "오늘 산 사람들
   평균보다 비싼가 싼가" 를 묻는 것이고, 그것이 종가 하나보다 많은
   것을 말한다.
   ═══════════════════════════════════════════════════════════════ */

const DAY = 86_400_000;

/** 봉을 날짜별로 가른다 — 분봉은 여러 날이 섞여 온다 */
export function byDay(bars) {
  const days = new Map();
  for (const b of bars || []) {
    const k = new Date(b.t).toDateString();
    if (!days.has(k)) days.set(k, []);
    days.get(k).push(b);
  }
  return [...days.entries()]
    .map(([k, rows]) => ({ key: k, t: rows[0].t, rows }))
    .sort((a, b) => a.t - b.t);
}

/* ═══════════════════ VWAP ═══════════════════

   거래량으로 무게를 준 평균값. 그날 실제로 오간 돈을 오간 주식 수로
   나눈 것이다.

   대표값은 (고+저+종)/3 을 쓴다. 종가 하나만 쓰면 그 봉 안에서 오간
   값을 무시하게 되고, 그 봉이 클수록 어긋난다.

   ── 왜 하루마다 다시 시작하나 ──
   VWAP 은 '오늘' 의 평균이다. 어제 것을 이어 셈하면 어제 산 사람의
   값이 오늘 판단에 섞인다. 날이 바뀌면 0에서 다시 쌓는다.
*/
export function vwap(bars) {
  const out = new Array((bars || []).length).fill(null);
  if (!bars?.length) return out;

  let day = null, pv = 0, vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const k = new Date(b.t).toDateString();
    if (k !== day) { day = k; pv = 0; vol = 0; }

    const typical = (b.h + b.l + b.c) / 3;
    const v = b.v || 0;
    pv += typical * v;
    vol += v;
    out[i] = vol > 0 ? pv / vol : typical;
  }
  return out;
}

/* ═══════════════════ 갭 ═══════════════════

   어제 종가와 오늘 시가 사이에 난 틈이다. 장이 닫힌 동안 벌어진 일이
   거기 담긴다.

   ── 메웠나 ──
   위로 열린 갭이 그날 안에 어제 종가까지 내려오면 '메웠다' 고 한다.
   메우는 비율이 높으면 갭을 따라 사는 것은 대개 손해다.

   ── 왜 방향을 갈라 보나 ──
   위로 뛴 갭과 아래로 빠진 갭은 다르게 행동한다. 합쳐 놓으면 둘이
   서로를 지운다.
*/
export function gaps(bars, { minPct = 0.3 } = {}) {
  const days = byDay(bars);
  // 일봉이면 하루에 한 줄이라 byDay 가 그대로다
  const rows = days.length > 1 && days[0].rows.length === 1
    ? days.map((d) => d.rows[0])
    : days.map((d) => ({
      t: d.t,
      o: d.rows[0].o,
      h: Math.max(...d.rows.map((r) => r.h)),
      l: Math.min(...d.rows.map((r) => r.l)),
      c: d.rows[d.rows.length - 1].c,
      v: d.rows.reduce((a, r) => a + (r.v || 0), 0),
    }));

  if (rows.length < 10) return null;

  const found = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].c;
    const open = rows[i].o;
    if (!(prev > 0) || !(open > 0)) continue;

    const gap = (open / prev - 1) * 100;
    if (Math.abs(gap) < minPct) continue;

    const up = gap > 0;
    // 메웠나 — 위로 열렸으면 어제 종가까지 내려왔나
    const filled = up ? rows[i].l <= prev : rows[i].h >= prev;
    // 그날 시가에서 종가까지
    const intraday = (rows[i].c / open - 1) * 100;

    found.push({ t: rows[i].t, gap, up, filled, intraday, prev, open, close: rows[i].c });
  }

  if (found.length < 5) return null;

  const side = (up) => {
    const mine = found.filter((g) => g.up === up);
    if (mine.length < 3) return null;
    return {
      n: mine.length,
      filled: (mine.filter((g) => g.filled).length / mine.length) * 100,
      avgGap: mean(mine.map((g) => g.gap)),
      // 시가에 사서 종가에 팔았다면
      avgIntraday: mean(mine.map((g) => g.intraday)),
      followed: (mine.filter((g) => (g.intraday > 0) === up).length / mine.length) * 100,
    };
  };

  return {
    rows: found,
    n: found.length,
    days: rows.length,
    up: side(true),
    down: side(false),
  };
}

/* ═══════════════════ 시간대별 ═══════════════════

   하루의 변동이 언제 벌어지나. 장 시작 삼십 분에 하루 폭의 절반이
   나는 종목이 흔한데, 그것을 알면 언제 손대지 말아야 할지가 정해진다.

   ── 무엇을 재나 ──
   시간대마다 봉의 절대 수익률을 더한다. 방향이 아니라 크기다 —
   오르든 내리든 그 시간에 값이 얼마나 움직였나를 묻는다.
*/
export function byHour(bars) {
  if (!bars?.length) return null;

  const slots = new Map();     // 'HH:MM' → { sum, n, up }
  const days = byDay(bars);
  if (days.length < 2 || days[0].rows.length < 4) return null;

  for (const d of days) {
    for (let i = 1; i < d.rows.length; i++) {
      const a = d.rows[i - 1].c, b = d.rows[i].c;
      if (!(a > 0)) continue;
      const r = (b / a - 1) * 100;

      const t = new Date(d.rows[i].t);
      // 삼십 분 단위로 묶는다. 봉이 잘면 칸이 너무 많아 결이 안 보인다.
      const half = t.getMinutes() < 30 ? '00' : '30';
      const k = String(t.getHours()).padStart(2, '0') + ':' + half;

      if (!slots.has(k)) slots.set(k, { sum: 0, n: 0, up: 0, net: 0 });
      const s = slots.get(k);
      s.sum += Math.abs(r);
      s.net += r;
      s.n += 1;
      if (r > 0) s.up += 1;
    }
  }

  const rows = [...slots.entries()]
    .map(([k, s]) => ({
      slot: k,
      move: s.sum / s.n,          // 그 시간대의 평균 움직임 크기
      net: s.net / s.n,           // 방향까지 넣으면 대개 0에 가깝다
      upPct: (s.up / s.n) * 100,
      n: s.n,
    }))
    .filter((r) => r.n >= 3)
    .sort((a, b) => a.slot.localeCompare(b.slot));

  if (rows.length < 3) return null;

  const total = rows.reduce((a, r) => a + r.move, 0);
  for (const r of rows) r.share = (r.move / total) * 100;

  const busiest = [...rows].sort((a, b) => b.move - a.move)[0];
  const quietest = [...rows].sort((a, b) => a.move - b.move)[0];

  return { rows, days: days.length, busiest, quietest };
}

/* ═══════════════════ 체결 강도 ═══════════════════

   봉 하나 안에서 값이 위쪽에 붙어 끝났나 아래쪽에 붙어 끝났나.

     (종가 − 저가) − (고가 − 종가)
     ─────────────────────────────  × 거래량
             고가 − 저가

   1에 가까우면 그 시간 내내 사려는 쪽이 밀어 올린 것이고, −1에 가까우면
   반대다. 거래량을 곱해 더해 가면 '돈이 어느 쪽으로 쌓이고 있나' 가
   보인다 — 값은 제자리인데 이 줄이 오르면 조용히 모으는 중이다.

   차익매집선(accumulation/distribution)이라고도 부른다.
*/
export function pressure(bars) {
  const out = new Array((bars || []).length).fill(null);
  if (!bars?.length) return out;

  let acc = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const span = b.h - b.l;
    const mf = span > 0 ? (((b.c - b.l) - (b.h - b.c)) / span) : 0;
    acc += mf * (b.v || 0);
    out[i] = acc;
  }
  return out;
}

/**
 * 오늘의 체결 강도 한 숫자 — 화면 머리에 적기 좋게.
 * 최근 봉들의 위치를 거래량으로 무게 준 평균이다.
 */
export function pressureNow(bars, n = 30) {
  const use = (bars || []).slice(-n);
  let num = 0, vol = 0;
  for (const b of use) {
    const span = b.h - b.l;
    if (!(span > 0)) continue;
    const mf = ((b.c - b.l) - (b.h - b.c)) / span;
    const v = b.v || 1;
    num += mf * v;
    vol += v;
  }
  return vol > 0 ? (num / vol) * 100 : null;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
