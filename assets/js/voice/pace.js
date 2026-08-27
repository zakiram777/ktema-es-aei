/* ═══════════════════════════════════════════════════════════════
   pace.js — 이 목소리가 실제로 얼마나 빠른가

   입이 말을 못 따라가던 까닭은 이러했다.

   phoneme.js 는 "한 음절에 대략 150ms" 같은 어림으로 입 모양의 줄을
   만든다. 그런데 합성기가 실제로 읽는 속도는 목소리마다, 언어마다,
   기기마다 다르다. Heami 는 어림보다 빠르고 Zira 는 느리다. 어긋난
   채로 두면 문장이 길수록 뒤로 갈수록 벌어진다 — 앞은 맞다가 끝에는
   입이 한참 먼저 다물어져 있다.

   예전에는 boundary 사건이 올 때마다 시작 시각(t0)만 뒤로 당겼다.
   그것은 어긋난 자리를 옮길 뿐, 어긋나는 속도는 그대로 두는 일이다.
   당겨 놓아도 곧 다시 벌어지고, 당길 때마다 입이 튄다.

   ── 고친 방법 ──
   시각을 옮기는 대신 **줄 자체를 늘이고 줄인다.** 지금 어디를 읽는지
   (boundary 의 charIndex) 와 실제로 흐른 시간을 견주면 이 목소리가
   어림보다 몇 배 빠른지 나온다. 그 배수로 줄 전체를 늘인다.

     scale = 실제로 흐른 시간 / 줄에서 그 자리까지의 시간

   scale 이 1.4 면 어림보다 40% 느리게 읽고 있다는 뜻이다.

   ── 배운 것은 남긴다 ──
   목소리마다 그 배수를 적어 둔다. 다음에 같은 목소리로 말할 때는
   첫 마디부터 맞은 속도로 시작한다 — 문장마다 처음부터 배울 필요가
   없다. 사람이 빠르기(rate)를 바꾸면 그 몫은 따로 셈하므로,
   0.8배로 낮춰도 배운 것은 그대로 쓴다.

   ── boundary 를 안 주는 목소리 ──
   그런 목소리가 흔하다. 그때는 문장이 끝난 뒤 실제로 걸린 시간을
   재어 배운다. 그 문장에는 늦었지만 다음 문장부터는 맞는다.
   ═══════════════════════════════════════════════════════════════ */

const KEY = 'ktema.pace.v1';

/** 배수의 울타리 — 이 밖으로 나가면 무언가 잘못 잰 것이다 */
const MIN = 0.45;
const MAX = 2.6;

/** 처음 배울 때는 성큼, 나중에는 조금씩 (0…1) */
const FAST_LEARN = 0.5;
const SLOW_LEARN = 0.18;

/** 이만큼은 읽어야 잰 값을 믿는다 (ms) */
const TRUST_MS = 500;

/** voiceName|lang → { scale, n } */
const learned = new Map(load());

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw).filter(([, v]) => v && Number.isFinite(v.scale));
  } catch { return []; }
}

let timer = 0;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(learned))); }
    catch { /* 사생활 보호 창 — 이번 방문에만 기억한다 */ }
  }, 1500);
}

const keyOf = (voice, lang) => (voice || '(기본)') + '|' + (lang || 'ko');

/** 이 목소리에 대해 지금까지 배운 배수 */
export function scaleFor(voice, lang) {
  const hit = learned.get(keyOf(voice, lang));
  return hit ? hit.scale : 1;
}

/**
 * 새로 잰 값을 배움에 섞는다.
 * @param {string} voice  목소리 이름
 * @param {string} lang   'ko' | 'en'
 * @param {number} scale  이번에 잰 배수
 */
export function learn(voice, lang, scale) {
  if (!Number.isFinite(scale)) return;
  const s = Math.max(MIN, Math.min(MAX, scale));
  const k = keyOf(voice, lang);
  const hit = learned.get(k);

  if (!hit) {
    learned.set(k, { scale: s, n: 1 });
  } else {
    // 처음 몇 번은 크게 배우고, 자리를 잡으면 조금씩만 고친다
    const rate = hit.n < 4 ? FAST_LEARN : SLOW_LEARN;
    learned.set(k, {
      scale: Math.max(MIN, Math.min(MAX, hit.scale + (s - hit.scale) * rate)),
      n: hit.n + 1,
    });
  }
  persist();
}

export function forget() {
  learned.clear();
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
}

/** 지금까지 배운 것 — 설정 화면에서 보여 준다 */
export function report() {
  return [...learned.entries()].map(([k, v]) => {
    const [voice, lang] = k.split('|');
    return { voice, lang, scale: v.scale, n: v.n };
  });
}

/* ═══════════════════ 한 마디를 따라가는 자 ═══════════════════

   말 한 마디마다 하나씩 만든다. boundary 가 올 때마다 먹이고,
   지금 몇 밀리초 자리인지 물으면 답한다. */

export class Pacer {
  /**
   * @param {object} timeline  phoneme.toVisemes 가 만든 것
   * @param {{voice?:string, lang?:string, at?:number}} opts
   */
  constructor(timeline, opts = {}) {
    this.tl = timeline;
    this.voice = opts.voice || '';
    this.lang = opts.lang || 'ko';
    this.t0 = opts.at ?? performance.now();

    // 배운 것이 있으면 그 속도로 시작한다
    this.scale = scaleFor(this.voice, this.lang);
    this.measured = false;
  }

  /**
   * 합성기가 "여기를 읽는 중" 이라고 알려 줄 때 부른다.
   * @param {number} charIndex  글에서의 자리
   * @param {number} expectedMs 그 자리까지 줄에서 걸리는 시간
   * @param {number} now
   */
  mark(charIndex, expectedMs, now = performance.now()) {
    const elapsed = now - this.t0;

    // 너무 이른 자리는 못 믿는다 — 합성기가 말을 시작하기까지의
    // 시간이 섞여 들어가 배수가 크게 흔들린다
    if (elapsed < TRUST_MS || expectedMs < 120) return;

    const got = elapsed / expectedMs;
    if (!Number.isFinite(got) || got < MIN || got > MAX) return;

    // 한 마디 안에서는 부드럽게 좇는다. 확 바꾸면 입이 튄다.
    this.scale += (got - this.scale) * (this.measured ? 0.25 : 0.6);
    this.scale = Math.max(MIN, Math.min(MAX, this.scale));
    this.measured = true;
  }

  /** 말이 끝났을 때 — 실제로 걸린 시간으로 마지막 한 번 배운다 */
  finish(actualMs, now = performance.now()) {
    const total = this.tl?.total || 0;
    const spent = Number.isFinite(actualMs) ? actualMs : now - this.t0;
    if (total > 200 && spent > TRUST_MS) {
      const got = spent / total;
      if (got >= MIN && got <= MAX) {
        this.scale += (got - this.scale) * 0.5;
        learn(this.voice, this.lang, got);
        return;
      }
    }
    if (this.measured) learn(this.voice, this.lang, this.scale);
  }

  /** 지금은 줄에서 몇 밀리초 자리인가 */
  at(now = performance.now()) {
    return (now - this.t0) / this.scale;
  }

  /** 아직 이 마디를 읽고 있을 만한가 (끝난 뒤에도 입이 남아 있지 않게) */
  done(now = performance.now()) {
    const total = this.tl?.total || 0;
    return this.at(now) > total + 400;
  }
}
