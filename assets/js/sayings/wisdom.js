/* ═══════════════════════════════════════════════════════════════
   wisdom.js — 따옴표 안의 말만 꺼낸다

   ── 무엇이 어려운가 ──
   기사 제목은 대개 기자가 쓴 말이다. "버핏, 시장 과열 경고" 는 버핏이
   한 말이 아니라 기자가 요약한 말이다. 그것을 격언으로 실으면 그
   사람이 하지 않은 말을 그 사람 이름으로 싣는 것이 된다.

   그래서 따옴표 안에 든 것만 꺼낸다. 따옴표가 없으면 그 기사는 버린다.
   버려지는 것이 훨씬 많지만, 남는 것은 실제로 그 사람 입에서 나온
   말이다. 이 화면에서는 양보다 그쪽이 값지다.

   ── 하루 열 건 ──
   더 담을 수 있지만 담지 않는다. 격언은 스무 개를 읽으면 하나도 남지
   않는다. 열 개도 많다.

   ── 하루가 지나면 ──
   같은 날에는 같은 열 건을 보여 준다. 새로 고칠 때마다 바뀌면 어제
   본 말을 다시 찾을 수 없고, 그러면 적어 둘 수도 없다.
   ═══════════════════════════════════════════════════════════════ */

import { fetchXML } from '../net/proxy.js';
import { VOICES, PAPERS, feedFor, voiceById } from './sources.js';
import * as store from '../core/store.js';
import { pool } from '../core/pool.js';

export const DAILY = 10;

const KEY = 'sayings';                 // { day, items }
const SEEN = 'sayingsSeen';            // 이미 보여 준 말 (되풀이를 막는다)
const SEEN_MAX = 400;

const dayKey = () => new Date().toISOString().slice(0, 10);

/* ═══════════════════ 따옴표 꺼내기 ═══════════════════

   한국어와 영어가 쓰는 따옴표가 다르고, 매체마다 또 다르다.
   곧은 것, 굽은 것, 낫표까지 모두 받는다.

   ── 왜 길이를 재나 ──
   너무 짧은 것("좋다")은 말이 아니라 조각이고, 너무 긴 것은 기사
   본문을 통째로 옮긴 것이다. 인용은 짧아야 인용이다 — 길게 옮기면
   그것은 인용이 아니라 복제가 된다. */

const OPEN = '"“‘「『«';
const CLOSE = '"”’」』»';

const QUOTE_RE = new RegExp(
  '[' + OPEN + ']([^' + OPEN + CLOSE + ']{18,220})[' + CLOSE + ']', 'g');

const MIN_WORDS = 4;

export function quotesIn(text) {
  const out = [];
  if (!text) return out;

  for (const m of String(text).matchAll(QUOTE_RE)) {
    const said = m[1].trim().replace(/\s+/g, ' ');

    // 낱말이 몇은 되어야 말이다
    const words = said.split(/\s+/).length;
    const hangul = /[가-힣]/.test(said);
    if (!hangul && words < MIN_WORDS) continue;
    if (hangul && said.length < 12) continue;

    // 통째로 대문자면 대개 제목이나 상표다
    if (!hangul && said === said.toUpperCase() && said.length > 20) continue;

    out.push(said);
  }
  return out;
}

/* 이 말이 그 사람 것인가.

   ── 왜 이것을 따지나 ──
   버핏 기사 안에 다른 사람의 말이 인용되는 일은 흔하다. 그것을 버핏의
   말로 실으면 틀린 것을 싣는 것이다.

   따옴표 바로 앞뒤에 그 사람 이름이나 '말했다' 류의 말이 있는지 본다.
   확실하지 않으면 '이 기사에 실린 말' 로만 적고 그 사람 이름을 달지
   않는다 — 모르면서 아는 척하지 않는 편이 낫다. */
const SAID = /(said|says|told|wrote|added|warned|noted|argued|말했|밝혔|전했|강조|덧붙|지적|경고)/i;

function attributed(text, at, name) {
  if (!name) return false;
  const around = String(text).slice(Math.max(0, at - 120), at + 260);
  const last = name.split(/\s+/).pop();       // Buffett · 버핏
  if (!last) return false;
  return new RegExp(last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(around)
      && SAID.test(around);
}

/* ═══════════════════ 매체 이름 ═══════════════════

   구글 뉴스는 제목 끝에 ' - 매체이름' 을 붙인다. 그것을 떼어 매체로
   삼는다. 없으면 링크의 host 에서 가져온다. */
function outletOf(title, link) {
  const m = /\s[-–—]\s([^-–—]{2,40})$/.exec(String(title || ''));
  if (m) return m[1].trim();
  try {
    return new URL(link).host.replace(/^www\./, '');
  } catch { return ''; }
}

const stripOutlet = (title) => String(title || '').replace(/\s[-–—]\s[^-–—]{2,40}$/, '').trim();

/* 구글 뉴스는 제 주소로 감싸서 준다. 원문 주소가 안에 들어 있으면 꺼낸다 —
   출처를 밝히겠다고 해 놓고 구글로 보내면 그것은 출처가 아니다. */
function unwrap(link) {
  try {
    const u = new URL(link);
    if (!/news\.google\./.test(u.host)) return link;
    const inner = u.searchParams.get('url');
    return inner && /^https?:/.test(inner) ? inner : link;
  } catch { return link; }
}

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

const stripTags = (s) => String(s || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(amp|lt|gt|quot|#39|nbsp|apos);/g, (x) =>
    ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&apos;': "'" }[x] || ' '))
  .replace(/\s+/g, ' ')
  .trim();

/* ═══════════════════ 한 사람 긁기 ═══════════════════ */

async function pullVoice(v) {
  const { doc } = await fetchXML(feedFor(v), { timeout: 14_000 });
  const items = [...doc.querySelectorAll('item')].slice(0, 20);
  const out = [];

  for (const n of items) {
    const rawTitle = stripTags(n.querySelector('title')?.textContent);
    const desc = stripTags(n.querySelector('description')?.textContent);
    const link = unwrap(n.querySelector('link')?.textContent?.trim() || '');
    const when = n.querySelector('pubDate')?.textContent;
    const at = when ? Date.parse(when) : NaN;

    const body = rawTitle + ' — ' + desc;
    const name = v.en || v.ko;

    for (const said of quotesIn(body)) {
      const where = body.indexOf(said);
      out.push({
        id: hash(v.id + '|' + said),
        said,
        who: v.ko,
        whoEn: v.en,
        role: v.role,
        voice: v.id,
        tag: v.tag,
        sure: attributed(body, where, name) || attributed(body, where, v.ko),
        headline: stripOutlet(rawTitle),
        outlet: outletOf(rawTitle, link),
        link,
        at: Number.isFinite(at) ? at : null,
        kind: 'press',
      });
    }
  }
  return out;
}

/* ═══════════════════ 원문 긁기 ═══════════════════

   연설문 목록은 따옴표가 없다. 여기서는 제목이 곧 그 사람이 고른
   말이므로 제목을 그대로 싣되, '연설' 이라고 또렷이 적는다. */
async function pullPaper(p) {
  const { doc } = await fetchXML(p.url, { timeout: 14_000 });
  const items = [...doc.querySelectorAll('item'), ...doc.querySelectorAll('entry')].slice(0, 12);
  const out = [];

  for (const n of items) {
    const title = stripTags(n.querySelector('title')?.textContent);
    if (!title || title.length < 12) continue;

    let link = n.querySelector('link')?.textContent?.trim() || '';
    if (!/^https?:/.test(link)) link = n.querySelector('link')?.getAttribute('href') || '';

    const when = n.querySelector('pubDate')?.textContent
              || n.querySelector('published')?.textContent
              || n.querySelector('updated')?.textContent;
    const at = when ? Date.parse(when) : NaN;

    const desc = stripTags(n.querySelector('description')?.textContent
                        || n.querySelector('summary')?.textContent);

    // 안에 따옴표가 있으면 그쪽이 낫다 — 요약보다 그 사람 말이므로
    const inner = quotesIn(title + ' — ' + desc)[0];

    out.push({
      id: hash(p.id + '|' + (inner || title)),
      said: inner || title,
      who: p.name,
      role: p.ko,
      voice: p.id,
      tag: 'central',
      sure: true,                       // 공식 원문이다
      headline: inner ? title : '',
      outlet: p.name,
      link,
      at: Number.isFinite(at) ? at : null,
      kind: inner ? 'speech-quote' : 'speech',
    });
  }
  return out;
}

/* ═══════════════════ 오늘의 열 ═══════════════════ */

/**
 * 오늘 몫을 가져온다. 같은 날에는 같은 것을 돌려준다.
 * @param {{fresh?:boolean, onEach?:(done,total)=>void}} opts
 */
export async function today(opts = {}) {
  const saved = store.get(KEY);
  if (!opts.fresh && saved?.day === dayKey() && saved.items?.length) {
    return { items: saved.items, cached: true, day: saved.day };
  }

  const seen = new Set(store.get(SEEN) || []);
  const jobs = [
    ...VOICES.map((v) => () => pullVoice(v).catch(() => [])),
    ...PAPERS.map((p) => () => pullPaper(p).catch(() => [])),
  ];

  let done = 0;
  const total = jobs.length;

  // pool 은 하나가 넘어져도 나머지를 마저 돈다. 스물몇 곳을 두드리는
  // 자리라 그 성질이 필요하다 — 한 곳이 막혔다고 오늘 몫이 통째로
  // 비면 안 된다.
  const settled = await pool(jobs, async (job) => {
    const r = await job();
    opts.onEach?.(++done, total);
    return r;
  }, 4);

  const all = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));

  /* ── 고르는 차례 ──
     1. 같은 말은 하나만 (매체 여럿이 같은 말을 옮긴다)
     2. 어제까지 이미 보여 준 것은 뒤로
     3. 그 사람 말이라고 확인된 것을 앞으로
     4. 새것을 앞으로
     5. 한 사람이 열 자리를 다 먹지 않게 */
  const byText = new Map();
  for (const q of all) {
    const key = q.said.toLowerCase().replace(/[^a-z0-9가-힣]/g, '').slice(0, 80);
    const had = byText.get(key);
    if (!had || (!had.sure && q.sure)) byText.set(key, q);
  }

  const fresh = [...byText.values()].filter((q) => !seen.has(q.id));
  const pool2 = fresh.length >= DAILY ? fresh : [...byText.values()];

  pool2.sort((a, b) => {
    if (a.sure !== b.sure) return a.sure ? -1 : 1;
    return (b.at || 0) - (a.at || 0);
  });

  const picked = [];
  const perVoice = new Map();
  for (const q of pool2) {
    if (picked.length >= DAILY) break;
    const n = perVoice.get(q.voice) || 0;
    if (n >= 2) continue;                    // 한 사람 최대 둘
    perVoice.set(q.voice, n + 1);
    picked.push(q);
  }
  // 그래도 모자라면 사람 제한을 풀고 채운다
  for (const q of pool2) {
    if (picked.length >= DAILY) break;
    if (!picked.includes(q)) picked.push(q);
  }

  store.set(KEY, { day: dayKey(), items: picked, at: Date.now() });
  store.set(SEEN, [...seen, ...picked.map((q) => q.id)].slice(-SEEN_MAX));

  return { items: picked, cached: false, day: dayKey(), found: all.length };
}

/** 저장해 둔 것 (부르지 않고 그냥 본다) */
export const saved = () => {
  const s = store.get(KEY);
  return s?.day === dayKey() ? s.items || [] : [];
};

/** 마음에 든 말을 따로 담아 둔다 */
const KEEP = 'sayingsKept';
export const kept = () => store.get(KEEP) || [];
export function keep(q) {
  const list = kept();
  if (list.some((x) => x.id === q.id)) return list;
  const next = [{ ...q, keptAt: Date.now() }, ...list].slice(0, 200);
  store.set(KEEP, next);
  return next;
}
export function unkeep(id) {
  const next = kept().filter((x) => x.id !== id);
  store.set(KEEP, next);
  return next;
}
