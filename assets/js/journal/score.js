/* ═══════════════════════════════════════════════════════════════
   score.js — 고쳐지지 않은 기록으로 나를 채점한다

   일지 화면에는 이렇게 적혀 있다.

     "사람의 기억은 결과에 맞추어 고쳐집니다. 오른 뒤에는 '그럴 줄
      알았다' 가 되고, 내린 뒤에는 '불안했다' 가 됩니다. 그날 적어 둔
      글만이 그 고침을 막습니다."

   맞는 말인데, 거기서 멈추면 일지는 그냥 일기다. 적어 두게 했으면
   다음 걸음은 그 기록으로 채점하는 것이다.

   ── 셈할 수 있는 까닭 ──
   일지에는 그날의 시세 스냅샷이 함께 저장된다 (journal.js 의
   snapshotOf). 그러면 "그날 이후 30일·90일에 그 종목이 어떻게
   되었나" 를 셈할 수 있다. 마음(mood)별로 갈라서.

     오름을 본다고 적은 날은 실제로 바닥이었나
     내림을 본다고 적은 날은 실제로 꼭대기였나
     어느 쪽 판단이 더 맞았나

   이건 어떤 상용 사이트도 못 한다. 내 일지가 없기 때문이다.

   ── 조심할 것 ──
   · 적은 날이 적으면 아무 뜻이 없다. 다섯 개 아래로는 숫자를 내지
     않고 "아직 모자랍니다" 라고 말한다.
   · 이것은 예측력의 증명이 아니다. 지나간 한 구간에서 그랬다는
     기록일 뿐이다. 그래도 기억보다는 정확하다.
   · 30일 뒤가 아직 안 온 글은 세지 않는다. 세면 최근 글이 늘
     0%로 끌어내린다.
   ═══════════════════════════════════════════════════════════════ */

import * as journal from './journal.js';
import { MOODS, moodById } from './journal.js';

/** 며칠 뒤를 볼 것인가 */
export const HORIZONS = [
  { id: 'd30', ko: '30일 뒤', days: 30 },
  { id: 'd90', ko: '90일 뒤', days: 90 },
];

/** 이만큼은 있어야 숫자를 낸다 */
const MIN_N = 5;

/**
 * 채점한다.
 *
 * @param {Array} series  fetchSeries 가 준 것 (두 해치)
 * @returns {{ok, rows, moods, best, worst, total, skipped}}
 */
export function score(series, opts = {}) {
  const entries = journal.all();
  if (!entries.length) {
    return { ok: false, why: '아직 적어 둔 글이 없습니다.' };
  }

  // 기호 → 봉. 날짜로 값을 찾을 수 있게 지도로도 만들어 둔다.
  const bySymbol = new Map();
  for (const s of series || []) {
    if (!s.bars?.length) continue;
    bySymbol.set(s.symbol, {
      bars: s.bars,
      ko: s.ko || s.symbol,
      map: new Map(s.bars.map((b) => [dayKey(b.t), b.c])),
    });
  }

  if (!bySymbol.size) {
    return { ok: false, why: '견줄 시세가 없습니다.' };
  }

  const rows = [];
  let skipped = 0;

  for (const e of entries) {
    const marks = e.snapshot?.marks || [];
    if (!marks.length) { skipped += 1; continue; }

    const per = [];
    for (const m of marks) {
      const got = bySymbol.get(m.symbol);
      if (!got) continue;

      const at = priceOn(got, e.at);
      if (at == null) continue;

      const after = {};
      let any = false;
      for (const h of HORIZONS) {
        const later = priceOn(got, e.at + h.days * 86_400_000, { forward: false });
        // 아직 그날이 안 왔으면 null. 세면 최근 글이 늘 끌어내린다.
        if (later == null || e.at + h.days * 86_400_000 > lastAt(got)) {
          after[h.id] = null;
          continue;
        }
        after[h.id] = (later / at - 1) * 100;
        any = true;
      }
      if (any) per.push({ symbol: m.symbol, ko: got.ko, at, after });
    }

    if (!per.length) { skipped += 1; continue; }

    // 그 글에 딸린 종목들의 평균으로 그 글 하나의 성적을 낸다
    const avg = {};
    for (const h of HORIZONS) {
      const vs = per.map((p) => p.after[h.id]).filter((v) => v != null);
      avg[h.id] = vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    }

    rows.push({
      id: e.id,
      at: e.at,
      title: e.title,
      mood: e.mood,
      tags: e.tags || [],
      marks: per,
      after: avg,
    });
  }

  if (!rows.length) {
    return {
      ok: false,
      why: skipped
        ? `적어 둔 글 ${skipped}개에 아직 견줄 시세가 없습니다. `
          + '30일이 지난 글부터 채점됩니다.'
        : '채점할 수 있는 글이 없습니다.',
    };
  }

  return {
    ok: true,
    rows: rows.sort((a, b) => b.at - a.at),
    moods: byMood(rows),
    tags: byTag(rows),
    total: rows.length,
    skipped,
    verdict: verdictOf(byMood(rows)),
  };
}

/* ─────────────── 마음별 ───────────────

   여기가 이 판의 알맹이다.

   '오름을 본다' 고 적은 날 이후가 실제로 올랐나. '내림을 본다' 고
   적은 날 이후가 실제로 내렸나. 뒤엣것은 부호를 뒤집어서 센다 —
   내릴 것이라고 보고 실제로 내렸으면 맞힌 것이다. */
function byMood(rows) {
  return MOODS.map((m) => {
    const mine = rows.filter((r) => r.mood === m.id);
    const out = { ...m, n: mine.length, horizons: {} };

    for (const h of HORIZONS) {
      const vs = mine.map((r) => r.after[h.id]).filter((v) => v != null);
      if (vs.length < MIN_N) { out.horizons[h.id] = { n: vs.length, thin: true }; continue; }

      const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
      // 맞혔다는 것이 무슨 뜻인가는 마음마다 다르다
      const right = m.id === 'bear'
        ? vs.filter((v) => v < 0).length
        : m.id === 'bull' || m.id === 'act'
          ? vs.filter((v) => v > 0).length
          : null;

      out.horizons[h.id] = {
        n: vs.length,
        avg,
        median: median(vs),
        hit: right == null ? null : (right / vs.length) * 100,
        // 마음과 상관없이 그냥 그 기간이 어땠나 — 견줄 바닥이다
        best: Math.max(...vs),
        worst: Math.min(...vs),
      };
    }
    return out;
  }).filter((m) => m.n > 0);
}

function byTag(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const t of r.tags) {
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(r);
    }
  }

  return [...map.entries()]
    .map(([tag, list]) => {
      const vs = list.map((r) => r.after.d30).filter((v) => v != null);
      return {
        tag,
        n: list.length,
        avg: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null,
        thin: vs.length < MIN_N,
      };
    })
    .filter((t) => t.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
}

/* ─────────────── 한 줄 판정 ───────────────

   숫자를 내놓고 끝내면 사람은 그중 좋은 것만 본다. 그래서 무엇이
   드러났는지 한 줄로 적어 준다. 칭찬이 아니라 서술이다. */
function verdictOf(moods) {
  const bull = moods.find((m) => m.id === 'bull')?.horizons?.d30;
  const bear = moods.find((m) => m.id === 'bear')?.horizons?.d30;

  const enough = (h) => h && !h.thin && h.hit != null;

  if (!enough(bull) && !enough(bear)) {
    return {
      tone: 'thin',
      text: '아직 채점할 만큼 쌓이지 않았습니다. 오름과 내림을 각각 다섯 번씩은 '
          + '적어야 숫자에 뜻이 생깁니다.',
    };
  }

  const bits = [];
  if (enough(bull)) {
    bits.push(`오름을 본 ${bull.n}번 가운데 ${bull.hit.toFixed(0)}%가 실제로 올랐고, `
            + `평균 ${sign(bull.avg)}${bull.avg.toFixed(1)}% 였습니다.`);
  }
  if (enough(bear)) {
    bits.push(`내림을 본 ${bear.n}번 가운데 ${bear.hit.toFixed(0)}%가 실제로 내렸고, `
            + `평균 ${sign(bear.avg)}${bear.avg.toFixed(1)}% 였습니다.`);
  }

  // 어느 쪽이 더 맞았나
  let tone = 'flat';
  if (enough(bull) && enough(bear)) {
    const d = bull.hit - bear.hit;
    if (Math.abs(d) > 15) {
      bits.push(d > 0
        ? '오를 때를 보는 눈이 내릴 때를 보는 눈보다 낫습니다.'
        : '내릴 때를 보는 눈이 오를 때를 보는 눈보다 낫습니다.');
    }
    tone = Math.max(bull.hit, bear.hit) >= 60 ? 'good'
      : Math.max(bull.hit, bear.hit) <= 40 ? 'bad' : 'flat';
  }

  bits.push('이것은 앞을 맞힌다는 증명이 아닙니다. 지나간 한 구간에서 그랬다는 '
          + '기록일 뿐입니다. 그래도 기억보다는 정확합니다.');

  return { tone, text: bits.join(' ') };
}

/* ─────────────── 밑감 ─────────────── */

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const lastAt = (got) => got.bars[got.bars.length - 1].t;
const sign = (v) => (v > 0 ? '+' : '');

/**
 * 그날의 값. 그날 장이 안 섰으면 가장 가까운 날로 물러난다.
 *
 * 앞뒤 어느 쪽으로 물러날지는 뜻이 다르다. 글을 쓴 날은 뒤로(다음
 * 거래일) 물러나야 맞고, 30일 뒤는 앞으로(직전 거래일) 물러나야
 * 맞다 — 아직 안 온 날의 값을 끌어다 쓰면 안 되기 때문이다.
 */
function priceOn(got, t, { forward = true } = {}) {
  for (let d = 0; d <= 7; d++) {
    const step = forward ? d : -d;
    const v = got.map.get(dayKey(t + step * 86_400_000));
    if (v != null) return v;
  }
  return null;
}

function median(vs) {
  const s = [...vs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export { MIN_N, moodById };
