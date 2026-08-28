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
import { PAPERS, groups } from './sources.js';
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

/* ── 무엇을 버리나 ──
   실제로 걸린 것들을 놓고 맞췄다. 백 건에서 따옴표는 열 개쯤 나오고,
   그중 말이라 할 만한 것은 둘이었다.

     ✓ Wealth is not the same as money
     ✓ The village idiot could have made it
     ✗ Does Anybody Want That Job?          제목을 따옴표로 감싼 것
     ✗ Blessing in Disguise,                조각
     ✗ in three years, give or take two.    문장 가운데를 자른 것

   여덟을 버리고 둘을 남긴다. 아깝지만, 버린 여덟을 실으면 이 화면은
   '유명한 사람 이름이 붙은 아무 말' 이 된다. */

const MIN_WORDS = 6;
const MIN_LEN = 28;
const MIN_LEN_KO = 16;

/* 영어 제목은 낱말마다 첫 자를 크게 쓴다. 그 버릇으로 제목과 말을
   가른다 — 사람은 말할 때 제목처럼 말하지 않는다. */
function titleCase(s) {
  const words = s.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (words.length < 3) return false;
  const upper = words.filter((w) => w[0] === w[0].toUpperCase()).length;
  return upper / words.length > 0.6;
}

/* 문장 가운데를 자른 것. 이런 것들로 시작하면 앞이 잘린 것이다. */
const MID = /^(and|but|or|that|which|in|on|at|to|of|for|with|as|if|when|because|so|the same|더|그리고|하지만|그런데)\b/i;

export function quotesIn(text) {
  const out = [];
  if (!text) return out;

  for (const m of String(text).matchAll(QUOTE_RE)) {
    const said = m[1].trim().replace(/\s+/g, ' ');
    const hangul = /[가-힣]/.test(said);

    if (hangul) {
      if (said.length < MIN_LEN_KO) continue;
    } else {
      if (said.length < MIN_LEN) continue;
      if (said.split(/\s+/).length < MIN_WORDS) continue;
      if (titleCase(said)) continue;
      if (said === said.toUpperCase()) continue;      // 죄다 대문자면 상표나 제목
    }
    if (MID.test(said)) continue;

    out.push(said);
  }
  return out;
}

/* 이 말이 그 사람 것인가.

   ── 왜 이것을 따지나 ──
   버핏 기사 안에 다른 사람의 말이 인용되는 일은 흔하다. 그것을 버핏의
   말로 실으면 틀린 것을 싣는 것이다.

   따옴표 둘레에 그 사람 이름과 '말했다' 류가 함께 있는지 본다.
   확실하지 않으면 그렇다고 화면에 적는다 — 모르면서 아는 척하지 않는
   편이 낫다.

   ── 왜 성만 보지 않나 ──
   처음에는 성 하나로 찾았다. 그러자 'Cathie Wood' 를 찾는데 'wood'
   가 든 기사가 죄다 걸렸다 — 백 건 중 서른여덟 건이 그런 것이었다.
   흔한 낱말이 성인 사람에게는 성만으로 부족하다. 이름을 통째로 본다. */
const SAID = /(said|says|told|wrote|added|warned|noted|argued|말했|밝혔|전했|강조|덧붙|지적|경고)/i;

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 이 글에 그 사람 이름이 통째로 들어 있나 */
function mentions(text, v) {
  const names = [v.en, v.ko].filter(Boolean);
  return names.some((n) => new RegExp(esc(n), 'i').test(text));
}

/* ── 처음 만든 규칙이 너무 좁았다 ──
   '이름 + 말했다' 를 함께 요구했더니 아무것도 통과하지 못했다. 실제
   제목을 보면 이렇게 쓴다.

     Ray Dalio on the AI bubble … : 'Wealth is not the same as money'
     'The village idiot could have made it': Warren Buffett's playbook

   신문 제목은 '말했다' 를 잘 안 쓴다. 콜론과 소유격이 그 자리를 대신
   한다. 그것을 모르고 만든 규칙이라 여섯 건이 모두 '확인 못 함' 이
   되었고, 그러면 모든 칸에 경고가 붙어 경고가 뜻을 잃는다.

   ── 그러면 무엇으로 가리나 ──
   이름이 따옴표 가까이 있으면 그 사람 말로 본다. 다만 '다른 사람이
   말했다' 가 같은 제목에 있으면 물러선다. 이런 것이 실제로 있다.

     Elon Musk Says He's Not Warren Buffett's 'Biggest Fan' …

   버핏의 이름이 있지만 말한 이는 머스크다. '이름 + 말했다' 짝이
   우리 사람이 아닌 채로 있으면 확인하지 않은 것으로 둔다. */

const OTHER_SPEAKER = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:said|says|told|wrote|warned|argued)/g;

function attributed(text, at, v) {
  const from = at < 0 ? 0 : at;
  const around = String(text).slice(Math.max(0, from - 90), from + 200);

  if (!mentions(around, v)) return false;

  // 같은 자리에서 다른 사람이 말한 것으로 되어 있나
  for (const m of String(text).matchAll(OTHER_SPEAKER)) {
    const who = m[1];
    const mine = [v.en, v.ko].filter(Boolean)
      .some((n) => n.toLowerCase().includes(who.toLowerCase())
                || who.toLowerCase().includes(n.toLowerCase()));
    if (!mine) return false;
  }

  return true;
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

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

/* 글자 두 개씩(바이그램) 얼마나 겹치나 — 0 이면 딴판, 1 이면 같은 말.
   낱말로 견주면 한국어에서 조사 하나에 갈리므로 글자로 본다. */
function similar(a, b) {
  const grams = (s) => {
    const t = norm(s);
    const g = new Set();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const g of A) if (B.has(g)) both++;
  return (2 * both) / (A.size + B.size);
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

/* ═══════════════════ 한 묶음 긁기 ═══════════════════

   다섯 사람을 한 번에 묻고, 온 기사마다 '이 글에 이름이 든 사람' 을
   가려 붙인다. 이름이 하나도 없으면 버린다 — 검색이 엉뚱한 것을 물어
   온 것이다. 둘 이상이면 따옴표에 가장 가까이 있는 쪽을 고른다. */

async function pullGroup(g) {
  const { doc } = await fetchXML(g.url, { timeout: 15_000 });
  const items = [...doc.querySelectorAll('item')].slice(0, 60);
  const out = [];

  for (const n of items) {
    const rawTitle = stripTags(n.querySelector('title')?.textContent);
    const desc = stripTags(n.querySelector('description')?.textContent);
    const link = unwrap(n.querySelector('link')?.textContent?.trim() || '');
    const when = n.querySelector('pubDate')?.textContent;
    const at = when ? Date.parse(when) : NaN;

    const body = rawTitle + ' — ' + desc;

    const here = g.voices.filter((v) => mentions(body, v));
    if (!here.length) continue;

    for (const said of quotesIn(body)) {
      const where = body.indexOf(said);

      // 여럿이 걸리면 그 말이 자기 것이라고 확인되는 쪽을 먼저 본다
      const v = here.find((x) => attributed(body, where, x)) || here[0];
      const sure = here.length === 1
        ? attributed(body, where, v)
        : !!here.find((x) => attributed(body, where, x)) && here.filter((x) => attributed(body, where, x)).length === 1;

      out.push({
        id: hash(v.id + '|' + said),
        said,
        who: v.ko,
        whoEn: v.en,
        role: v.role,
        voice: v.id,
        tag: v.tag,
        sure,
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

   ── 한 번 잘못 만들었다 ──
   처음에는 연설문 목록의 제목을 그대로 격언으로 실었다. 공식 원문이니
   따옴표를 의심할 필요가 없다고 여겼는데, 그래서 'Cook, Outlook for
   the U.S. and Alaskan Economies' 가 격언 자리에 앉았다. 그것은 말이
   아니라 문서 이름이다.

   게다가 '확실한 것' 으로 셈해 맨 위로 올라갔고, 열 자리 중 여섯을
   문서 이름이 차지했다. 거르개를 조인 것이 아니라 순서를 잘못 잡은
   탓이었다.

   지금은 갈라 둔다. 따옴표가 든 것만 격언으로 올리고, 나머지는 화면
   아래 '오늘 나온 원문' 으로 따로 적는다. 그쪽도 값진 것이지만
   격언은 아니다. */
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
      // 따옴표가 있으면 말이고, 없으면 문서 이름일 뿐이다
      kind: inner ? 'speech-quote' : 'paper',
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
    return { items: saved.items, papers: saved.papers || [], cached: true, day: saved.day };
  }

  const seen = new Set(store.get(SEEN) || []);
  const jobs = [
    ...groups().map((g) => () => pullGroup(g).catch(() => [])),
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
  }, 2);

  const got = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));

  // 문서 이름은 격언이 아니다. 따로 담아 화면 아래에 적는다.
  const all = got.filter((q) => q.kind !== 'paper');
  const papers = got
    .filter((q) => q.kind === 'paper')
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, 6);

  /* ── 고르는 차례 ──
     1. 같은 말은 하나만 (매체 여럿이 같은 말을 옮긴다)
     2. 어제까지 이미 보여 준 것은 뒤로
     3. 그 사람 말이라고 확인된 것을 앞으로
     4. 새것을 앞으로
     5. 한 사람이 열 자리를 다 먹지 않게 */
  const byText = new Map();
  for (const q of all) {
    const key = norm(q.said).slice(0, 80);
    const had = byText.get(key);
    if (!had || (!had.sure && q.sure)) byText.set(key, q);
  }

  /* ── 글자가 딱 같아야만 같은 말인 것은 아니다 ──
     매체마다 같은 발언을 조금씩 다르게 줄여 적는다.

       원화 곧 휴지조각? 국내 유튜버들 하는 얘기
       원화가 곧 휴지조각? 유튜버들 얘기…해외 시각은 달라

     같은 말인데 글자로는 다르다. 위의 짝 맞추기로는 둘 다 살아남고,
     실제로 한 사람의 한 발언이 매체만 바꿔 셋 들어왔다. 그러면 열
     자리 중 셋이 같은 말이 된다.

     글자 두 개씩 겹치는 비율로 견준다. 위의 두 줄이 딱 0.500 이 나와서
     '절반 넘게' 로는 못 걸렀다. 0.45 로 내렸다 — 정말 다른 말끼리는
     0.00~0.12 이므로 이 자리는 넉넉하다. */
  const uniq = [];
  for (const q of byText.values()) {
    const twin = uniq.find((x) => x.voice === q.voice && similar(x.said, q.said) > 0.45);
    if (!twin) { uniq.push(q); continue; }
    // 둘 중 확인된 쪽, 그것도 같으면 새것을 남긴다
    if ((!twin.sure && q.sure) || (twin.sure === q.sure && (q.at || 0) > (twin.at || 0))) {
      uniq[uniq.indexOf(twin)] = q;
    }
  }

  const fresh = uniq.filter((q) => !seen.has(q.id));
  const pool2 = fresh.length >= DAILY ? fresh : uniq;

  /* ── 오래된 것을 뒤로 ──
     구글 뉴스는 몇 달 지난 것도 함께 준다. 그것이 '오늘의 열' 에
     섞이면 오늘 나온 말처럼 읽히는데, 그것은 거짓말에 가깝다.
     두 달 안쪽을 먼저 쓰고, 모자랄 때만 그 밖을 쓴다. */
  const RECENT = 60 * 86_400_000;
  const now = Date.now();
  const recent = (q) => q.at && now - q.at < RECENT;

  pool2.sort((a, b) => {
    if (recent(a) !== recent(b)) return recent(a) ? -1 : 1;
    if (a.sure !== b.sure) return a.sure ? -1 : 1;
    return (b.at || 0) - (a.at || 0);
  });

  /* 한 사람이 열 자리를 다 먹지 않게. 처음에는 둘까지만 받고, 그래도
     모자라면 셋까지 늘린다 — 전에는 아예 풀어 버려서 한 사람의 같은
     발언이 매체만 바꿔 셋이 들어왔다. */
  const picked = [];
  for (const cap of [2, 3]) {
    const perVoice = new Map();
    for (const q of picked) perVoice.set(q.voice, (perVoice.get(q.voice) || 0) + 1);

    for (const q of pool2) {
      if (picked.length >= DAILY) break;
      if (picked.includes(q)) continue;
      const n = perVoice.get(q.voice) || 0;
      if (n >= cap) continue;
      perVoice.set(q.voice, n + 1);
      picked.push(q);
    }
    if (picked.length >= DAILY) break;
  }

  store.set(KEY, { day: dayKey(), items: picked, papers, at: Date.now() });
  store.set(SEEN, [...seen, ...picked.map((q) => q.id)].slice(-SEEN_MAX));

  return { items: picked, papers, cached: false, day: dayKey(), found: all.length };
}

/** 저장해 둔 것 (부르지 않고 그냥 본다) */
export const saved = () => {
  const s = store.get(KEY);
  return s?.day === dayKey() ? { items: s.items || [], papers: s.papers || [] } : { items: [], papers: [] };
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
