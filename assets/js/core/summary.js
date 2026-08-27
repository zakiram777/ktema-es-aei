/* ═══════════════════════════════════════════════════════════════
   summary.js — 긴 말을 한 입 크기로

   말풍선에는 답변 전문이 들어가지 않는다. 얼굴 옆에 글자가 길게
   흐르면 읽을 마음이 사라지고, 무엇보다 자키람을 가린다. 그래서
   요지만 남긴다.

   서버도 모형도 없으니 뽑아내는 방식(extractive)으로 짰다 —
   문장을 고르고 자를 뿐, 없던 말을 지어내지 않는다. 지어내면
   그 순간 틀릴 수 있고, 시장의 말은 틀리면 안 된다.

   고르는 기준
     · 앞에 있는 문장일수록 무겁게 본다 (기사도 답변도 두괄식이다)
     · 글 전체에서 자주 나온 낱말을 담은 문장을 높게 본다
     · 숫자가 든 문장을 조금 높게 본다 (시장의 말은 숫자가 알맹이다)
     · 물음표로 끝나는 문장은 낮게 본다 (되묻는 말은 요지가 아니다)
   ═══════════════════════════════════════════════════════════════ */

import { sentences } from './fmt.js';

/** 요지에 보탬이 되지 않는 흔한 낱말 — 셈에서 뺀다 */
const STOP_KO = new Set([
  '있다', '없다', '한다', '했다', '이다', '됐다', '된다', '같다', '통해',
  '대해', '위해', '따라', '경우', '지난', '올해', '오늘', '내일', '어제',
  '그리고', '하지만', '그러나', '또한', '이번', '관련', '전망', '분석',
]);
const STOP_EN = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has',
  'was', 'were', 'are', 'its', 'but', 'not', 'they', 'their', 'been',
  'will', 'would', 'about', 'after', 'into', 'over', 'said', 'says',
]);

/** 셈에 쓸 낱말로 잘게 나눈다 */
function words(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^가-힣a-z0-9]+/i)
    .filter((w) => {
      if (w.length < 2) return false;
      if (STOP_KO.has(w) || STOP_EN.has(w)) return false;
      return true;
    });
}

/**
 * 글을 요약한다.
 *
 * @param {string} text
 * @param {{max?:number, lines?:number}} opts
 *        max   글자 수 상한 (기본 110)
 *        lines 고를 문장 수 상한 (기본 2)
 * @returns {string}
 */
export function summarize(text, opts = {}) {
  const max = opts.max ?? 110;
  const want = opts.lines ?? 2;

  const clean = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')      // 코드 덩이는 통째로 뺀다
    .replace(/[*_#>`]/g, '')              // 마크다운 부호
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  if (clean.length <= max) return clean;

  const list = sentences(clean, 200);
  if (list.length <= 1) return cut(clean, max);

  // 낱말이 몇 번씩 나왔나
  const freq = new Map();
  for (const w of words(clean)) freq.set(w, (freq.get(w) || 0) + 1);

  const scored = list.map((s, i) => {
    const ws = words(s);
    const hit = ws.reduce((sum, w) => sum + (freq.get(w) || 0), 0);
    let score = ws.length ? hit / Math.sqrt(ws.length) : 0;
    score *= 1 / (1 + i * 0.45);                     // 앞 문장이 무겁다
    if (/\d/.test(s)) score *= 1.15;                 // 숫자가 든 문장
    if (/[?？]\s*$/.test(s)) score *= 0.5;           // 되묻는 말
    if (s.length < 8) score *= 0.4;                  // 너무 짧은 토막
    return { s, i, score };
  });

  const picked = [];
  let used = 0;
  for (const cand of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= want) break;
    if (used + cand.s.length > max && picked.length) continue;
    picked.push(cand);
    used += cand.s.length + 1;
  }
  if (!picked.length) picked.push(scored[0]);

  picked.sort((a, b) => a.i - b.i);                  // 원래 차례로 되돌린다
  return cut(picked.map((p) => p.s).join(' '), max);
}

/** 글자 수를 맞춰 자른다. 낱말 한가운데를 자르지 않는다. */
export function cut(text, max = 110) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const space = head.lastIndexOf(' ');
  // 한글은 빈칸 없이도 읽히므로, 빈칸이 너무 앞이면 그냥 자른다
  const body = space > max * 0.6 ? head.slice(0, space) : head;
  return body.replace(/[,·、\s]+$/, '') + '…';
}

/**
 * 기사 하나를 말풍선에 담을 꼴로.
 * 제목이 이미 요지이므로 제목을 앞세우고, 자리가 남으면 요약을 붙인다.
 */
export function forItem(item, max = 120) {
  const title = String(item?.title || '').trim();
  const body = String(item?.summary || '').trim();
  if (!body || title.length > max * 0.75) return cut(title, max);
  const room = max - title.length - 2;
  if (room < 24) return cut(title, max);
  const tail = summarize(body, { max: room, lines: 1 });
  return tail ? `${title} — ${tail}` : cut(title, max);
}
