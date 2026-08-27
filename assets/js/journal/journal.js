/* ═══════════════════════════════════════════════════════════════
   journal.js — 투자일지

   시장에 대한 자기 생각을 적어 두는 자리다. 왜 이렇게 보았는지,
   무엇을 하기로 했는지, 그때 값은 얼마였는지.

   ── 왜 이것이 필요한가 ──
   사람의 기억은 결과에 맞추어 고쳐진다. 오른 뒤에는 "그럴 줄 알았다"
   가 되고, 내린 뒤에는 "불안했다" 가 된다. 그날 적어 둔 글만이
   그 고침을 막는다. 그래서 이 일지는 적을 때의 시세를 함께 붙들어
   둔다 — 그때 무엇을 보고 그렇게 생각했는지가 남아야 한다.

   ── 어디에 남나 ──
   이 브라우저에만. 서버가 없으니 계정도 없다. 그래서 내보내기가
   있다 — 파일 한 장으로 옮기거나 갈무리해 둘 수 있다.
   ═══════════════════════════════════════════════════════════════ */

import { emit } from '../core/bus.js';

const KEY = 'ktema.journal.v1';

/** 그날의 마음 — 나중에 되짚을 때 이것으로 걸러 본다 */
export const MOODS = [
  { id: 'bull', ko: '오름을 본다', gr: 'Ταῦρος', tone: 'up' },
  { id: 'bear', ko: '내림을 본다', gr: 'Ἄρκτος', tone: 'down' },
  { id: 'watch', ko: '지켜본다', gr: 'Σκοπός', tone: 'flat' },
  { id: 'act', ko: '움직였다', gr: 'Πρᾶξις', tone: 'act' },
  { id: 'learn', ko: '배웠다', gr: 'Μάθημα', tone: 'learn' },
];

export const moodById = (id) => MOODS.find((m) => m.id === id) || MOODS[2];

/* ─────────────── 들고 나기 ─────────────── */

export function all() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.sort((a, b) => (b.at || 0) - (a.at || 0));
  } catch { return []; }
}

function persist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    emit('journal:changed', { count: list.length });
    return true;
  } catch (err) {
    console.warn('[journal] 남기지 못했습니다', err);
    return false;
  }
}

/**
 * 새로 적거나 고쳐 적는다.
 * @param {{id?:string, title:string, body:string, mood:string, tags?:string[], snapshot?:object}} entry
 */
export function save(entry) {
  const list = all();
  const now = Date.now();

  const clean = {
    id: entry.id || 'j' + now.toString(36),
    at: entry.at || now,
    edited: entry.id ? now : null,
    title: String(entry.title || '').trim().slice(0, 120),
    body: String(entry.body || '').trim().slice(0, 20_000),
    mood: moodById(entry.mood).id,
    tags: (entry.tags || [])
      .map((t) => String(t).trim().replace(/^#/, ''))
      .filter(Boolean)
      .slice(0, 8),
    snapshot: entry.snapshot || null,
  };

  if (!clean.title && !clean.body) return null;
  if (!clean.title) clean.title = clean.body.slice(0, 40).replace(/\s+/g, ' ');

  const at = list.findIndex((x) => x.id === clean.id);
  if (at >= 0) list[at] = { ...list[at], ...clean };
  else list.unshift(clean);

  return persist(list) ? clean : null;
}

export function remove(id) {
  const list = all().filter((x) => x.id !== id);
  return persist(list);
}

export function byId(id) {
  return all().find((x) => x.id === id) || null;
}

/** 적혀 있는 모든 이름표 — 많이 쓴 것부터 */
export function tags() {
  const count = new Map();
  for (const e of all()) {
    for (const t of e.tags || []) count.set(t, (count.get(t) || 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => ({ tag, n }));
}

/** 글과 이름표와 마음으로 걸러 본다 */
export function search({ text = '', tag = '', mood = '' } = {}) {
  const q = String(text).trim().toLowerCase();
  return all().filter((e) => {
    if (mood && e.mood !== mood) return false;
    if (tag && !(e.tags || []).includes(tag)) return false;
    if (!q) return true;
    return (e.title + ' ' + e.body + ' ' + (e.tags || []).join(' '))
      .toLowerCase()
      .includes(q);
  });
}

/* ─────────────── 그때의 시세 ───────────────

   적을 때 화면에 있던 값을 함께 붙들어 둔다. 나중에 그 글을 다시
   볼 때, 무엇을 보고 그렇게 썼는지가 같이 나와야 한다. */

export function snapshotOf(quotes) {
  if (!quotes || !quotes.length) return null;
  return {
    at: Date.now(),
    marks: quotes
      .filter((q) => q.ok && Number.isFinite(q.price))
      .slice(0, 6)
      .map((q) => ({
        ko: q.ko || q.name || q.symbol,
        symbol: q.symbol,
        price: q.price,
        changePct: Number.isFinite(q.changePct) ? q.changePct : null,
      })),
  };
}

/* ─────────────── 옮기기 ─────────────── */

export function exportAll() {
  return {
    kind: 'ktema-journal',
    version: 1,
    savedAt: new Date().toISOString(),
    entries: all(),
  };
}

/**
 * 들여온다. 같은 id 가 있으면 더 나중에 고친 것을 남긴다.
 * @returns {{added:number, merged:number}}
 */
export function importAll(data) {
  const incoming = Array.isArray(data?.entries) ? data.entries : null;
  if (!incoming) throw new Error('이 사이트의 일지 파일이 아닙니다.');

  const mine = new Map(all().map((e) => [e.id, e]));
  let added = 0, merged = 0;

  for (const raw of incoming) {
    if (!raw || !raw.id) continue;
    const has = mine.get(raw.id);
    if (!has) { mine.set(raw.id, raw); added += 1; continue; }
    const mineAt = has.edited || has.at || 0;
    const theirAt = raw.edited || raw.at || 0;
    if (theirAt > mineAt) { mine.set(raw.id, raw); merged += 1; }
  }

  persist([...mine.values()].sort((a, b) => (b.at || 0) - (a.at || 0)));
  return { added, merged };
}

/** 사람이 읽는 글로 — 갈무리해 두고 싶을 때 */
export function toText() {
  return all().map((e) => {
    const when = new Date(e.at).toLocaleString('ko-KR');
    const head = '── ' + when + ' · ' + moodById(e.mood).ko + ' ──';
    const tag = (e.tags || []).length ? '\n#' + e.tags.join(' #') : '';
    const snap = e.snapshot?.marks?.length
      ? '\n[그때 시세] ' + e.snapshot.marks
        .map((m) => m.ko + ' ' + fmtNum(m.price) + (m.changePct != null ? ' (' + sign(m.changePct) + m.changePct.toFixed(2) + '%)' : ''))
        .join(' · ')
      : '';
    return head + '\n' + e.title + '\n\n' + e.body + tag + snap;
  }).join('\n\n');
}

const sign = (v) => (v > 0 ? '+' : '');
const fmtNum = (v) => (Number.isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—');
