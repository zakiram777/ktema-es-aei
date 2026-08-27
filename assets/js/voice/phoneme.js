/* ═══════════════════════════════════════════════════════════════
   phoneme.js — 글자를 입 모양으로

   자키람의 영상은 열세 편으로 정해져 있다. 그 안의 입은 지금 읽는
   낱말과 아무 상관이 없다. "안녕하십니까" 를 말하는데 입은 다른
   말을 하고 있으니, 보는 사람에게는 그것이 가장 먼저 눈에 띈다.

   그래서 소리를 만드는 쪽이 아니라 **입 모양을 만드는 쪽**을 음소
   단위로 짰다. 읽을 글을 음소로 풀고, 음소마다 입이 어떤 꼴이
   되는지(비짐, viseme)를 정하고, 말이 흐르는 속도에 맞춰 그 꼴을
   차례로 내보낸다. 그 꼴을 얼굴 위에 겹쳐 그린다 (zakiram/mouth.js).

   ── 한글 ──
   한글은 음소가 글자 안에 그대로 들어 있다. 유니코드에서 음절을
   초성·중성·종성으로 나누는 셈이 정해져 있으므로, 사전도 규칙표도
   필요 없다.

     (음절 − 0xAC00) = ((초성 × 21) + 중성) × 28 + 종성

   입 모양을 정하는 것은 거의 중성(모음)이다. 초성은 그 앞에 짧게
   얹히고(ㅁㅂㅍ 는 입을 다문다), 종성은 뒤에 짧게 닫는다.

   ── 영어 ──
   영어는 철자와 소리가 따로 논다. 사전을 통째로 들일 수는 없으니
   두 글자 묶음(sh, ch, th, oo, ea…)을 먼저 보고 나머지는 낱자로
   본다. 정확한 발음 기호는 아니지만 입 모양을 정하는 데는 넉넉하다.
   보는 사람이 가리는 것은 '입이 말을 따라 움직이는가' 이지
   /iː/ 와 /ɪ/ 의 차이가 아니다.

   ── 시간 ──
   말이 실제로 흐르는 속도는 목소리마다 다르다. 그래서 여기서는
   '대략의 길이' 만 만들고, 실제 맞춤은 합성기가 주는 boundary
   사건으로 잡는다 (voice/tts.js → speak:word). 어긋나면 그때
   끌어당긴다.
   ═══════════════════════════════════════════════════════════════ */

/** 입 모양의 갈래. 이름은 소리가 아니라 '보이는 꼴' 을 가리킨다. */
export const VISEME = {
  REST: 'REST',   // 다물었으나 힘을 뺀 자리
  M:    'M',      // ㅁ ㅂ ㅍ / b p m — 완전히 다문다
  F:    'F',      // ㅍ / f v — 아랫입술을 문다
  A:    'A',      // ㅏ — 크게 벌린다
  E:    'E',      // ㅐ ㅔ ㅓ — 반쯤
  I:    'I',      // ㅣ — 옆으로 길게
  O:    'O',      // ㅗ — 둥글게
  U:    'U',      // ㅜ ㅡ — 작고 둥글게 내민다
  S:    'S',      // ㅅ ㅈ ㅊ / s z ch sh — 좁게
  N:    'N',      // ㄴ ㄷ ㅌ ㄹ / t d n l — 살짝
  K:    'K',      // ㄱ ㅋ ㅎ ㅇ / k g h — 목 안쪽, 입은 반쯤
};

/* ─────────────── 한글 ─────────────── */

const CHO = [
  'g', 'gg', 'n', 'd', 'dd', 'r', 'm', 'b', 'bb',
  's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h',
];

/** 중성 21 — [주된 입 모양, 앞에 스치는 반모음] */
const JUNG = [
  ['A'],            // ㅏ
  ['E'],            // ㅐ
  ['I', 'A'],       // ㅑ
  ['I', 'E'],       // ㅒ
  ['E'],            // ㅓ
  ['E'],            // ㅔ
  ['I', 'E'],       // ㅕ
  ['I', 'E'],       // ㅖ
  ['O'],            // ㅗ
  ['U', 'A'],       // ㅘ
  ['U', 'E'],       // ㅙ
  ['U', 'E'],       // ㅚ
  ['I', 'O'],       // ㅛ
  ['U'],            // ㅜ
  ['U', 'E'],       // ㅝ
  ['U', 'E'],       // ㅞ
  ['U', 'I'],       // ㅟ
  ['I', 'U'],       // ㅠ
  ['U'],            // ㅡ
  ['U', 'I'],       // ㅢ
  ['I'],            // ㅣ
];

const JONG = [
  '', 'g', 'gg', 'gs', 'n', 'nj', 'nh', 'd', 'r', 'rg', 'rm', 'rb', 'rs',
  'rt', 'rp', 'rh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h',
];

/** 닿소리(자음) 하나가 만드는 입 모양 */
function consonantViseme(c) {
  if (!c) return null;
  const first = c[0];
  switch (first) {
    case 'm': case 'b': return VISEME.M;
    case 'p': return VISEME.M;          // ㅍ 은 다물었다 터진다
    case 'f': case 'v': return VISEME.F;
    case 's': case 'j': case 'c': return VISEME.S;   // ss, j, jj, ch
    case 'n': case 'd': case 't': case 'r': case 'l': return VISEME.N;
    case 'g': case 'k': case 'h': return VISEME.K;
    default: return null;
  }
}

/* ─────────────── 길이 (ms, rate 1.0 일 때) ─────────────── */

const D = {
  onset: 46,
  vowel: 104,
  glide: 52,
  coda: 42,
  cons: 54,
  space: 58,
  comma: 165,
  stop: 255,
};

/* ─────────────── 영어 ─────────────── */

/** 두 글자 이상 묶음을 먼저 본다. 긴 것부터 늘어놓아야 한다. */
const EN_GROUPS = [
  ['igh', [VISEME.A, VISEME.I]],
  ['tion', [VISEME.S, VISEME.K, VISEME.N]],
  ['sh', [VISEME.S]], ['ch', [VISEME.S]], ['th', [VISEME.N]],
  ['ph', [VISEME.F]], ['wh', [VISEME.U]], ['ck', [VISEME.K]],
  ['ng', [VISEME.K]], ['qu', [VISEME.U]], ['gh', [VISEME.K]],
  ['ee', [VISEME.I]], ['ea', [VISEME.I]], ['ie', [VISEME.I]],
  ['oo', [VISEME.U]], ['ou', [VISEME.O, VISEME.U]], ['ow', [VISEME.O, VISEME.U]],
  ['oa', [VISEME.O]], ['oi', [VISEME.O, VISEME.I]], ['oy', [VISEME.O, VISEME.I]],
  ['ai', [VISEME.E, VISEME.I]], ['ay', [VISEME.E, VISEME.I]],
  ['au', [VISEME.O]], ['aw', [VISEME.O]], ['ew', [VISEME.U]],
  ['ei', [VISEME.E, VISEME.I]], ['ey', [VISEME.E, VISEME.I]],
];

const EN_LETTER = {
  a: VISEME.A, e: VISEME.E, i: VISEME.I, o: VISEME.O, u: VISEME.U, y: VISEME.I,
  b: VISEME.M, p: VISEME.M, m: VISEME.M,
  f: VISEME.F, v: VISEME.F,
  s: VISEME.S, z: VISEME.S, c: VISEME.S, j: VISEME.S, x: VISEME.S,
  t: VISEME.N, d: VISEME.N, n: VISEME.N, l: VISEME.N, r: VISEME.N,
  k: VISEME.K, g: VISEME.K, h: VISEME.K, q: VISEME.K,
  w: VISEME.U,
};

const VOWELS = new Set([VISEME.A, VISEME.E, VISEME.I, VISEME.O, VISEME.U]);

/** 숫자가 그대로 남아 있을 때를 위한 마지막 그물 */
const DIGIT_KO = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

/* ─────────────── 만들기 ─────────────── */

/**
 * 글 한 줄을 입 모양의 줄로 편다.
 *
 * @param {string} text
 * @param {'ko'|'en'} lang
 * @param {{rate?:number}} opts   말 빠르기 (1 이 보통)
 * @returns {{list:{v:string,at:number,d:number,i:number}[], total:number}}
 *          at 은 줄의 처음부터 흐른 시간(ms), i 는 글자 자리
 */
export function toVisemes(text, lang = 'ko', opts = {}) {
  const src = String(text || '');
  const rate = Math.max(0.4, Math.min(2.5, opts.rate || 1));
  const list = [];
  let at = 0;

  const put = (v, d, i) => {
    if (d <= 0) return;
    const ms = d / rate;
    const prev = list[list.length - 1];
    // 같은 꼴이 잇달으면 늘려 준다. 같은 자리를 두 번 그릴 까닭이 없다.
    if (prev && prev.v === v) { prev.d += ms; at += ms; return; }
    list.push({ v, at, d: ms, i });
    at += ms;
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const code = ch.codePointAt(0);

    // ── 한글 음절 ──
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const n = code - 0xAC00;
      const cho = CHO[Math.floor(n / 588)];
      const jung = JUNG[Math.floor((n % 588) / 28)] || ['E'];
      const jong = JONG[n % 28];

      const onset = consonantViseme(cho);
      if (onset) put(onset, D.onset, i);

      if (jung.length > 1) {
        put(VISEME[jung[0]], D.glide, i);
        put(VISEME[jung[1]], D.vowel, i);
      } else {
        put(VISEME[jung[0]], D.vowel, i);
      }

      const coda = consonantViseme(jong);
      if (coda) put(coda, D.coda, i);
      continue;
    }

    // ── 홀로 쓰인 자모 (ㄱ, ㅏ …) ──
    if (code >= 0x3131 && code <= 0x318E) { put(VISEME.E, D.vowel, i); continue; }

    // ── 라틴 글자 ──
    if (/[A-Za-z]/.test(ch)) {
      const rest = src.slice(i).toLowerCase();
      const group = EN_GROUPS.find((g) => rest.startsWith(g[0]));
      if (group) {
        const [word, vs] = group;
        for (const v of vs) put(v, VOWELS.has(v) ? D.vowel : D.cons, i);
        i += word.length - 1;
        continue;
      }
      const low = ch.toLowerCase();
      // 낱말 끝의 소리 없는 e — 'take' 의 e 에 입을 벌리면 어색하다.
      // 다만 'the' 나 'be' 처럼 짧은 낱말의 e 는 소리가 난다.
      const next = src[i + 1] || '';
      if (low === 'e' && !/[A-Za-z]/.test(next)) {
        let start = i;
        while (start > 0 && /[A-Za-z]/.test(src[start - 1])) start -= 1;
        const word = src.slice(start, i + 1).toLowerCase();
        if (word.length >= 4 && /[aeiouy]/.test(word.slice(0, -1))) continue;
      }
      const v = EN_LETTER[low];
      if (v) put(v, VOWELS.has(v) ? D.vowel : D.cons, i);
      continue;
    }

    // ── 숫자 ──
    if (/[0-9]/.test(ch)) {
      const say = lang === 'en' ? null : DIGIT_KO[Number(ch)];
      if (say) { const sub = toVisemes(say, 'ko', { rate }); for (const s of sub.list) put(s.v, s.d * rate, i); }
      else put(VISEME.E, D.vowel, i);
      continue;
    }

    // ── 쉼과 마침 ──
    if (/[.!?。！？]/.test(ch)) { put(VISEME.REST, D.stop, i); continue; }
    if (/[,;:·、]/.test(ch)) { put(VISEME.REST, D.comma, i); continue; }
    if (/\s/.test(ch)) { put(VISEME.REST, D.space, i); continue; }
    // 그 밖의 부호는 입에 아무 일도 일으키지 않는다
  }

  // 끝에는 반드시 입을 닫는다
  put(VISEME.REST, D.stop, src.length);

  return { list, total: at };
}

/**
 * 합성기가 "지금 이 글자를 읽는 중" 이라고 알려 줄 때,
 * 그 자리가 우리 줄에서는 몇 밀리초인지 되돌려 준다.
 * 어긋난 시간을 여기서 끌어당긴다.
 */
export function timeAt(timeline, charIndex) {
  const list = timeline?.list || [];
  if (!list.length) return 0;
  let lo = 0, hi = list.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].i <= charIndex) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return list[ans].at;
}

/** 그 시각에는 어떤 입 모양인가 */
export function visemeAt(timeline, ms) {
  const list = timeline?.list || [];
  if (!list.length) return VISEME.REST;
  if (ms <= 0) return list[0].v;
  let lo = 0, hi = list.length - 1, ans = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].at <= ms) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  const cur = list[ans];
  return ms > cur.at + cur.d + 240 ? VISEME.REST : cur.v;
}

/** 이 글을 다 읽는 데 걸릴 대략의 시간 (ms) */
export function estimate(text, lang = 'ko', rate = 1) {
  return toVisemes(text, lang, { rate }).total;
}
