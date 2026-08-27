/* ═══════════════════════════════════════════════════════════════
   feed.js — 소식을 길어 와 하나로 합친다

     1. 갈래에 필요한 출처를 모두 동시에 부른다
     2. RSS / Atom / RDF 어느 모양이든 같은 꼴로 편다
     3. 같은 기사를 걸러 낸다 (제목이 닮았으면 하나로)
     4. 시간 순으로 세운다
     5. 못 보던 것을 표시하고, 속보를 가려낸다

   한 곳이 막혀도 나머지로 화면을 채운다. 전부 막혔을 때만
   실패로 본다.
   ═══════════════════════════════════════════════════════════════ */

import { fetchXML } from '../net/proxy.js';
import { pool } from '../core/pool.js';
import { stripTags } from '../core/dom.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';
import { sourcesFor, urgency, URGENT_AT, splitFlag } from './sources.js';

/** 갈래별로 마지막에 받은 것 */
const cache = new Map();   // cat → { items, at }

export const cached = (cat) => cache.get(cat);

/* ─────────────── 한 곳에서 길어 오기 ─────────────── */

async function pull(src, limit) {
  const { doc } = await fetchXML(src.url, { timeout: 12_000 });

  const nodes = [
    ...doc.querySelectorAll('item'),
    ...doc.querySelectorAll('entry'),
  ].slice(0, limit);

  return nodes.map((n) => shape(n, src)).filter(Boolean);
}

/** RSS·Atom·RDF 의 서로 다른 모양을 하나로 편다 */
function shape(node, src) {
  const pick = (...names) => {
    for (const nm of names) {
      const found = node.getElementsByTagName(nm)[0]
                 ?? node.querySelector(nm.replace(':', '\\:'));
      const v = found?.textContent?.trim();
      if (v) return v;
    }
    return '';
  };

  const title = stripTags(pick('title')).trim();
  if (!title) return null;

  // 링크: RSS 는 <link>글</link>, Atom 은 <link href="…">
  let link = pick('link');
  if (!link || !/^https?:/i.test(link)) {
    const alt = [...node.getElementsByTagName('link')]
      .find((l) => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate');
    link = alt?.getAttribute('href') || link || '';
  }
  if (!link) link = pick('guid', 'id');
  if (!/^https?:/i.test(link)) link = '';

  const summary = stripTags(
    pick('description', 'summary', 'content:encoded', 'content'),
  ).slice(0, 900);

  const when = pick('pubDate', 'published', 'updated', 'dc:date', 'date');
  const t = when ? Date.parse(when) : NaN;

  const { flag, rest } = splitFlag(title);

  const item = {
    id: hash(`${src.id}|${link || title}`),
    title: rest || title,
    flag,
    fullTitle: title,
    summary,
    link,
    time: Number.isFinite(t) ? t : null,
    src: src.id,
    srcName: src.name,
    lang: src.lang,
    cats: src.cats,
    weight: src.weight,
  };
  item.urgency = urgency(item);
  return item;
}

/** 짧고 안정적인 id — 같은 기사면 같은 값이 나와야 한다 */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/* ─────────────── 겹치는 기사 걸러 내기 ─────────────── */

/** 비교하기 좋게 제목을 민다 */
function key(title) {
  return title
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .slice(0, 34);
}

function dedupe(items) {
  const seenKey = new Map();
  const seenLink = new Set();
  const out = [];

  for (const it of items) {
    if (it.link && seenLink.has(it.link)) continue;

    const k = key(it.title);
    const rival = seenKey.get(k);
    if (rival) {
      // 더 무거운 출처, 같으면 더 최근 것을 남긴다
      const better = it.weight > rival.weight
        || (it.weight === rival.weight && (it.time || 0) > (rival.time || 0));
      if (!better) continue;
      const at = out.indexOf(rival);
      if (at >= 0) out.splice(at, 1);
    }

    seenKey.set(k, it);
    if (it.link) seenLink.add(it.link);
    out.push(it);
  }
  return out;
}

/* ─────────────── 부르기 ─────────────── */

let inFlight = null;

/**
 * 한 갈래를 새로 길어 온다.
 * @returns {Promise<{items, at, errors, ok}>}
 */
export async function load(cat = 'all', opts = {}) {
  // 같은 부름이 겹치면 앞의 것을 그대로 나눠 쓴다
  if (inFlight && inFlight.cat === cat && !opts.force) return inFlight.p;

  const perSource = store.get('perSource') || 12;
  const off = store.get('sourcesOff') || [];
  const list = sourcesFor(cat, off);

  const p = (async () => {
    // 열여덟 곳을 한꺼번에 두드리면 공개 프록시가 문을 닫는다.
    // 여섯씩 줄을 세운다 — 다 받는 데 걸리는 시간은 비슷하다.
    const settled = await pool(list, (s) => pull(s, perSource), 6);

    const errors = [];
    let items = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') items.push(...r.value);
      else errors.push({ src: list[i].id, name: list[i].name, why: String(r.reason?.message || r.reason) });
    });

    const ok = items.length > 0;
    if (!ok) {
      const err = new Error(
        errors.length ? '소식을 가져오지 못했습니다' : '켜 둔 출처가 없습니다',
      );
      err.errors = errors;
      throw err;
    }

    items = dedupe(items);
    items.sort((a, b) => (b.time || 0) - (a.time || 0));

    // 못 보던 것 표시. 첫 방문에는 전부를 새 것으로 보지 않는다.
    const first = store.isFirstVisit();
    const fresh = [];
    for (const it of items) {
      it.isNew = !first && !store.hasSeen(it.id);
      it.isRead = store.hasRead(it.id);
      if (it.isNew) fresh.push(it);
    }
    store.markSeen(items.map((it) => it.id));

    const at = Date.now();
    cache.set(cat, { items, at });

    emit('news:loaded', { cat, items, at, errors });
    if (fresh.length) emit('news:new', { cat, items: fresh });

    // 속보 — 새로 온 것 중에서만 고른다. 이미 본 것을 다시 외치지 않는다.
    const urgent = fresh
      .filter((it) => it.urgency >= URGENT_AT)
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, store.get('breakingMax') || 3);
    for (const it of urgent) emit('news:urgent', { item: it });

    return { items, at, errors, ok: true };
  })();

  inFlight = { cat, p };
  try { return await p; }
  finally { if (inFlight?.p === p) inFlight = null; }
}

/** 이 갈래를 마지막으로 길어 온 지 얼마나 되었나 (ms) */
export function age(cat) {
  const hit = cache.get(cat);
  return hit ? Date.now() - hit.at : Infinity;
}
