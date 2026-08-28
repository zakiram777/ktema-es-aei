/* ═══════════════════════════════════════════════════════════════
   fmt.js — 눈으로 볼 꼴과, 입으로 낼 꼴

   같은 숫자라도 화면에 적을 때와 소리 내어 읽을 때가 다르다.
   -1.23% 는 눈에는 "-1.23%" 지만 귀에는 "1.23 퍼센트 하락" 이다.
   그 둘을 여기서 갈라 둔다.
   ═══════════════════════════════════════════════════════════════ */

/* ─────────────── 눈으로 ─────────────── */

export function num(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 값의 크기에 맞춰 소수 자리를 고른다 */
export function px(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const d = a >= 1000 ? 2 : a >= 100 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
  return num(n, d);
}

export function signed(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n), digits);
}

export function pct(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n), digits) + '%';
}

export const dir = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');
export const arrow = (n) => (n > 0 ? '▲' : n < 0 ? '▼' : '—');

/** 거래량 같은 큰 수 — 한국식 자리로 줄인다 */
export function big(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return num(n / 1e12, 2) + '조';
  if (a >= 1e8)  return num(n / 1e8, 2) + '억';
  if (a >= 1e4)  return num(n / 1e4, 1) + '만';
  return num(n, 0);
}

/* ─────────────── 때 ─────────────── */

export function clock(d, tz) {
  const o = { hour: '2-digit', minute: '2-digit', hour12: false };
  if (tz) o.timeZone = tz;
  return new Intl.DateTimeFormat('ko-KR', o).format(d);
}

export function stamp(d = new Date()) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d);
}

export function dayStamp(d) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

/** 몇 분 전 */
export function ago(then, now = Date.now()) {
  if (!then) return '';
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60)     return '방금';
  if (s < 3600)   return `${Math.floor(s / 60)}분 전`;
  if (s < 86400)  return `${Math.floor(s / 3600)}시간 전`;
  if (s < 604800) return `${Math.floor(s / 86400)}일 전`;
  return dayStamp(new Date(then));
}

/** 남은 시간 — 자동 갱신 카운트다운 */
export function until(ms) {
  if (ms <= 0) return '곧';
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}초`;
}

/* ═══════════════════════════════════════════════════════════════
   귀로 — 소리 내어 읽을 꼴

   음성 합성기는 기호를 잘 못 읽는다. "▲" 를 그대로 주면 침묵하거나
   "검은 위쪽 삼각형" 이라고 읽는다. 숫자와 기호를 미리 말로 풀어 준다.
   ═══════════════════════════════════════════════════════════════ */

/**
 * 숫자를 읽는 꼴로.
 * 한국어는 소수점 아래를 한 자리씩 끊어 읽어야 자연스럽다.
 *   2470.55 → "이천사백칠십 점 오오" 대신 "2470 점 5 5" 로 주고
 *   나머지는 합성기에 맡긴다. 합성기가 한글 수사를 더 잘 만든다.
 */
export function sayNum(n, lang = 'ko', digits = 2) {
  if (n == null || !Number.isFinite(n)) return lang === 'ko' ? '알 수 없음' : 'unknown';
  const neg = n < 0;
  const a = Math.abs(n);
  const fixed = a.toFixed(digits).replace(/\.?0+$/, '');
  const [whole, frac] = fixed.split('.');

  if (lang === 'ko') {
    let out = Number(whole).toLocaleString('ko-KR');
    if (frac) out += ' 점 ' + frac.split('').join(' ');
    return (neg ? '마이너스 ' : '') + out;
  }
  let out = Number(whole).toLocaleString('en-US');
  if (frac) out += ' point ' + frac.split('').join(' ');
  return (neg ? 'negative ' : '') + out;
}

/**
 * 값의 크기에 맞춰 읽을 자리를 고른다.
 * 코스피를 "육천팔백팔 점 이일" 이라고 읽으면 소수점 아래가 귀에
 * 걸린다. 큰 수일수록 소수를 버리는 편이 알아듣기 쉽다.
 */
export function sayPrice(n, lang = 'ko') {
  if (n == null || !Number.isFinite(n)) return lang === 'ko' ? '알 수 없음' : 'unknown';
  const a = Math.abs(n);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 4;
  return sayNum(n, lang, d);
}

/** 등락을 방향까지 말로 */
export function sayChange(chg, chgPct, lang = 'ko') {
  const up = chgPct > 0, down = chgPct < 0;
  if (lang === 'ko') {
    if (!up && !down) return '보합입니다';
    const w = up ? '올라' : '내려';
    return `${sayNum(Math.abs(chg), 'ko')} ${w}, ${sayNum(Math.abs(chgPct), 'ko')} 퍼센트 ${up ? '상승' : '하락'}입니다`;
  }
  if (!up && !down) return 'unchanged';
  return `${up ? 'up' : 'down'} ${sayNum(Math.abs(chg), 'en')}, ${sayNum(Math.abs(chgPct), 'en')} percent`;
}

/** 백분율만 */
export function sayPct(v, lang = 'ko') {
  if (v == null || !Number.isFinite(v)) return lang === 'ko' ? '알 수 없음' : 'unknown';
  return lang === 'ko'
    ? `${sayNum(Math.abs(v), 'ko')} 퍼센트 ${v > 0 ? '상승' : v < 0 ? '하락' : ''}`.trim()
    : `${sayNum(Math.abs(v), 'en')} percent ${v > 0 ? 'up' : v < 0 ? 'down' : ''}`.trim();
}

/** 큰 수를 말로 — 거래량, 시가총액 */
export function sayBig(n, lang = 'ko') {
  if (n == null || !Number.isFinite(n)) return lang === 'ko' ? '알 수 없음' : 'unknown';
  const a = Math.abs(n);
  if (lang === 'ko') {
    if (a >= 1e12) return `${sayNum(n / 1e12, 'ko', 1)} 조`;
    if (a >= 1e8)  return `${sayNum(n / 1e8, 'ko', 1)} 억`;
    if (a >= 1e4)  return `${sayNum(n / 1e4, 'ko', 0)} 만`;
    return sayNum(n, 'ko', 0);
  }
  if (a >= 1e12) return `${sayNum(n / 1e12, 'en', 2)} trillion`;
  if (a >= 1e9)  return `${sayNum(n / 1e9, 'en', 2)} billion`;
  if (a >= 1e6)  return `${sayNum(n / 1e6, 'en', 2)} million`;
  if (a >= 1e3)  return `${sayNum(n / 1e3, 'en', 1)} thousand`;
  return sayNum(n, 'en', 0);
}

/** 날짜를 말로 */
export function sayDate(d, lang = 'ko') {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(+dt)) return '';
  return lang === 'ko'
    ? `${dt.getMonth() + 1}월 ${dt.getDate()}일`
    : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(dt);
}

/* ─────────────── 글을 읽을 꼴로 다듬기 ───────────────
   기사 본문에는 합성기가 걸려 넘어지는 것들이 섞여 있다.
   대괄호 머리표, 기자 이메일, URL, 잇단 말줄임표. */

export function speakable(text, lang = 'ko') {
  if (!text) return '';
  let t = String(text);

  t = t.replace(/https?:\/\/\S+/g, ' ');                 // 주소
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ');        // 편지주소
  t = t.replace(/^\s*\[[^\]]{1,24}\]\s*/, '');           // [속보] 같은 머리표는 따로 붙인다
  t = t.replace(/[<>《》〈〉]/g, ' ');
  t = t.replace(/[▲△]/g, lang === 'ko' ? ' 상승 ' : ' up ');
  t = t.replace(/[▼▽]/g, lang === 'ko' ? ' 하락 ' : ' down ');
  t = t.replace(/[…]+/g, ', ');
  t = t.replace(/\.{3,}/g, ', ');
  t = t.replace(/[·ㆍ]/g, ', ');
  t = t.replace(/[~∼]/g, lang === 'ko' ? ' 에서 ' : ' to ');
  t = t.replace(/%/g, lang === 'ko' ? ' 퍼센트' : ' percent');
  t = t.replace(/\s*\/\s*/g, ' ');
  t = t.replace(/["'`“”‘’]/g, '');
  t = t.replace(/\(\s*\)/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();

  return t;
}

/** 긴 글을 문장으로 자른다 — 합성기는 한 번에 긴 글을 못 견딘다 */
export function sentences(text, max = 190) {
  const clean = String(text || '').trim();
  if (!clean) return [];

  // 문장 부호에서 자르되, 소수점(1.23) 한가운데서는 자르지 않는다
  const STOP = '.!?。！？';
  const raw = [];
  let start = 0;
  for (let i = 0; i < clean.length; i++) {
    if (!STOP.includes(clean[i])) continue;
    const next = clean[i + 1];
    if (next) {
      if (clean[i] === '.' && /[0-9]/.test(next)) continue;   // 1.23 의 점
      if (!/\s/.test(next)) continue;                        // U.S. 같은 줄임말
    }
    const piece = clean.slice(start, i + 1).trim();
    if (piece) raw.push(piece);
    start = i + 1;
  }
  const tail = clean.slice(start).trim();
  if (tail) raw.push(tail);

  // 너무 긴 문장은 쉼표에서 한 번 더 자른다
  const out = [];
  for (const s of raw) {
    if (s.length <= max) { out.push(s); continue; }
    let buf = '';
    for (const part of s.split(/,\s*/)) {
      if ((buf + part).length > max && buf) { out.push(buf.trim()); buf = ''; }
      buf += (buf ? ', ' : '') + part;
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out;
}

/** 한글이 섞여 있나 — 읽을 언어를 스스로 고를 때 쓴다 */
export function isKorean(text) {
  if (!text) return false;
  const han = (text.match(/[가-힣]/g) || []).length;
  return han / Math.max(1, text.replace(/\s/g, '').length) > 0.12;
}

/* ═══════════════════ 한 문장 안의 두 나라 말 ═══════════════════

   "Fed 가 금리를 동결했습니다" 를 한국어 목소리에게 통째로 주면
   Fed 를 '에프 이 디' 나 '페드' 로 읽는다. 영어 목소리에게 통째로
   주면 뒷말이 통째로 무너진다. 그래서 글을 말결대로 잘라, 조각마다
   그 말을 아는 목소리에게 준다.

   다만 잘게 자를수록 사이가 뚝뚝 끊긴다. 그래서 짧은 라틴 문자
   덩이(예: 'A', 'GDP' 의 낱자 하나)는 자르지 않고 한국어 쪽에
   남겨 둔다. 이름값을 할 만큼 긴 것만 건너보낸다. */

const LATIN_WORD = /[A-Za-z][A-Za-z'’.&-]*/g;

/**
 * 글을 언어 조각으로 나눈다.
 * @param {string} text
 * @param {'ko'|'en'} base   이 글의 바탕이 되는 말
 * @param {{min?:number}} opts  이 길이 이상인 라틴 덩이만 따로 떼어 낸다
 * @returns {{lang:'ko'|'en', text:string}[]}
 */
export function langRuns(text, base = 'ko', opts = {}) {
  const src = String(text || '');
  if (!src.trim()) return [];

  // 바탕이 영어인 글에는 손대지 않는다. 한글이 섞여 있으면 그 자리만 떼어 낸다.
  if (base === 'en') {
    if (!/[가-힣]/.test(src)) return [{ lang: 'en', text: src }];
    return runsBy(src, /[가-힣][가-힣\s]*/g, 'ko', 'en', 1);
  }

  const min = opts.min ?? 3;
  return runsBy(src, LATIN_WORD, 'en', 'ko', min, true);
}

/**
 * @param {RegExp} re     떼어 낼 조각을 찾는 눈
 * @param {string} inner  떼어 낸 조각의 말
 * @param {string} outer  나머지의 말
 * @param {number} min    이 길이 미만이면 떼지 않는다
 * @param {boolean} joinRun  잇닿은 조각(빈칸을 사이에 둔)을 하나로 묶을지
 */
function runsBy(src, re, inner, outer, min, joinRun = false) {
  const out = [];
  let last = 0;
  let m;
  re.lastIndex = 0;

  const push = (lang, text) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (prev && prev.lang === lang) prev.text += text;   // 붙은 것은 이어 붙인다
    else out.push({ lang, text });
  };

  while ((m = re.exec(src))) {
    const word = m[0];
    const keep = word.replace(/[^A-Za-z가-힣]/g, '').length >= min;
    if (!keep) continue;                                  // 짧은 것은 바탕말에 맡긴다

    push(outer, src.slice(last, m.index));
    push(inner, word);
    last = m.index + word.length;

    // 'Federal Reserve' 처럼 잇닿은 것은 한 숨에 읽어야 자연스럽다
    if (joinRun) {
      re.lastIndex = last;
      let gap = /^[\s,]+/.exec(src.slice(last));
      let peek;
      while (gap && (peek = new RegExp(`^${LATIN_WORD.source}`).exec(src.slice(last + gap[0].length)))) {
        push(inner, gap[0] + peek[0]);
        last += gap[0].length + peek[0].length;
        re.lastIndex = last;
        gap = /^[\s,]+/.exec(src.slice(last));
      }
    }
  }

  push(outer, src.slice(last));

  return out
    .map((r) => ({ lang: r.lang, text: r.text.trim() }))
    .filter((r) => r.text);
}

/* ═══════════════════ 조사 ═══════════════════

   앞말의 받침에 따라 조사가 갈린다. 이 사이트는 열 이름을 사람이
   올린 표에서 그대로 받아 쓰므로, 무엇이 올지 미리 알 수 없다.

     기준가 + 이/가  →  기준가가
     설정액 + 이/가  →  설정액이

   "기준가 이 1 오를 때" 는 그 자리에서 바로 눈에 걸린다. 숫자를 아무리
   맞게 내도 이런 데서 어설프면 나머지도 대충 만든 것으로 읽힌다.

   ── 무엇을 받침으로 보나 ──
   한글은 유니코드에서 (글자 − 0xAC00) % 28 이 0이면 받침이 없다.
   숫자로 끝나면 그 숫자를 읽는 소리의 받침을 따른다 (1·7·8·0 은 받침).
   그 밖(영문·기호)은 받침이 없는 것으로 둔다 — 틀리더라도 덜 어색하다. */

const DIGIT_JONG = { 0: true, 1: true, 3: true, 6: true, 7: true, 8: true };

export function hasJong(word) {
  // 끝에 붙은 괄호·따옴표는 소리가 없다. 올라오는 열 이름에는
  // '설정액(억)' 처럼 단위를 괄호로 단 것이 흔한데, 그 ')' 를 보고
  // 조사를 고르면 언제나 틀린다.
  const s = String(word ?? '').trim().replace(/[)\]}>」』"'·.\s]+$/, '');
  if (!s) return false;
  const ch = s[s.length - 1];
  const code = ch.charCodeAt(0);

  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (ch >= '0' && ch <= '9') return !!DIGIT_JONG[+ch];
  return false;
}

/**
 * 앞말에 맞는 조사를 붙인다.
 *   josa('기준가', '이/가')  →  '기준가가'
 *   josa('설정액', '은/는')  →  '설정액은'
 */
export function josa(word, pair) {
  const [withJong, without] = String(pair).split('/');
  return String(word) + (hasJong(word) ? withJong : without);
}
