/* ═══════════════════════════════════════════════════════════════
   tts.js — 유리아의 목

   Web Speech 의 speechSynthesis 를 쓴다. 브라우저에 이미 들어 있어
   열쇠도 서버도 필요 없고, 기기에 깔린 목소리를 그대로 고를 수 있다.

   다만 규격대로 움직이지 않는 구석이 셋 있어서 감싸 두었다.

   1) 크롬은 한 번에 15초 남짓만 읽고 조용히 멈춘다.
      → 긴 글을 문장으로 쪼개 줄지어 읽고, 읽는 동안 resume() 를
        주기적으로 불러 깨워 둔다.

   2) cancel() 직후에 speak() 하면 엔진이 먹통이 될 때가 있다.
      → 취소한 뒤 한 박자 쉬었다가 다음 말을 시작한다.

   3) 어떤 목소리는 boundary 사건을 주지 않는다.
      → 그런 경우 글자 수와 흐른 시간으로 어림잡아 자리를 짚는다.
        (화면에 어디를 읽는지 밝혀 주려는 것뿐이라 어림이면 충분하다)

   바깥으로는 speak() 하나와 stop() 하나만 보인다.
   ═══════════════════════════════════════════════════════════════ */

import { emit } from '../core/bus.js';
import * as store from '../core/store.js';
import { sentences, speakable, isKorean, langRuns } from '../core/fmt.js';
import { byName, best, presetById } from './voices.js';

const synth = window.speechSynthesis;

export const supported = !!synth && typeof SpeechSynthesisUtterance !== 'undefined';

/* ─────────────── 지금 무엇을 말하고 있나 ─────────────── */

let job = null;        // { chunks, at, lang, opts, alive }
let keepAlive = 0;
let picked = { ko: null, en: null };

/** 지금 말하고 있나 */
export const speaking = () => !!job?.alive;

/* ─────────────── 목소리 고르기 ─────────────── */

/** 설정에 저장된 목소리를 되살린다. 없으면 스스로 고른다. */
export async function resolveVoice(langBase) {
  const saved = langBase === 'en' ? store.get('voiceEn') : store.get('voiceKo');
  const found = await byName(saved);
  if (found) return found;
  const auto = await best(langBase, { femaleOnly: store.get('femaleOnly') !== false });
  return auto?.voice || null;
}

/**
 * 이 말을 아는 목소리. 없으면 다른 쪽 목소리에게라도 맡긴다 —
 * 발음은 어색해도 조용한 것보다는 낫다.
 */
function voiceFor(langBase) {
  return (langBase === 'en' ? picked.en : picked.ko)
      || (langBase === 'en' ? picked.ko : picked.en)
      || null;
}

/** 미리 골라 둔다 — 첫 말이 늦지 않게 */
export async function warm() {
  if (!supported) return;
  picked.ko = await resolveVoice('ko');
  picked.en = await resolveVoice('en');
}

/** 설정이 바뀌면 다시 고른다 */
export async function refreshVoices() {
  picked = { ko: null, en: null };
  await warm();
}

/* ─────────────── 말하기 ─────────────── */

/**
 * @param {string|string[]} text  한 덩이 글, 또는 미리 나눈 문장들
 * @param {object} opts
 *   lang      'ko' | 'en' | 'auto'
 *   onstart   () => void
 *   onchunk   (index, text) => void      문장 하나를 시작할 때
 *   onword    (charIndex, chunkIndex) => void
 *   onend     (finished:boolean) => void
 *   rate/pitch/volume  설정을 덮어쓰고 싶을 때
 * @returns {{stop:()=>void, done:Promise<boolean>}}
 */
export function speak(text, opts = {}) {
  stop();   // 앞말은 끊는다. 유리아은 한 번에 한 가지만 말한다.

  if (!supported || store.get('muted')) {
    opts.onend?.(false);
    return { stop() {}, done: Promise.resolve(false) };
  }

  const raw = Array.isArray(text) ? text.filter(Boolean) : [text];
  const joined = raw.join(' ');
  const lang = opts.lang && opts.lang !== 'auto'
    ? opts.lang
    : (isKorean(joined) ? 'ko' : 'en');

  /* 읽을 꼴로 다듬고 문장으로 나눈다.
     ── 한 문장 안에 두 나라 말이 섞여 있으면 ──
     "Fed 가 금리를 동결했습니다" 를 한국어 목소리에게 통째로 주면
     Fed 를 제대로 읽지 못한다. 그래서 말결대로 한 번 더 나누어
     조각마다 그 말을 아는 목소리에게 준다. 조각에는 어느 줄에서
     왔는지(line)를 적어 둔다 — 읽기 판이 문단을 짚을 때 쓴다. */
  const mix = store.get('mixLang') !== false;
  const chunks = [];
  raw.forEach((piece, line) => {
    const clean = speakable(piece, lang);
    if (!clean) return;
    for (const s of sentences(clean)) {
      if (!mix) { chunks.push({ text: s, lang, line }); continue; }
      const runs = langRuns(s, lang);
      if (runs.length <= 1) { chunks.push({ text: s, lang, line }); continue; }
      for (const r of runs) chunks.push({ text: r.text, lang: r.lang, line });
    }
  });
  if (!chunks.length) {
    opts.onend?.(false);
    return { stop() {}, done: Promise.resolve(false) };
  }

  const preset = presetById(store.get('preset'));
  const cfg = {
    rate:   opts.rate   ?? store.get('rate')   ?? preset.rate,
    pitch:  opts.pitch  ?? store.get('pitch')  ?? preset.pitch,
    volume: opts.volume ?? store.get('volume') ?? 1,
  };

  const me = { chunks, at: 0, lang, opts, alive: true, cfg };
  job = me;

  const done = new Promise((resolve) => { me.resolve = resolve; });

  emit('speak:start', { text: joined, lang });
  opts.onstart?.();
  startKeepAlive();

  // cancel() 바로 뒤에 speak() 하면 엔진이 멎는 일이 있다. 한 박자 쉰다.
  setTimeout(() => { if (me.alive) next(me); }, 90);

  return {
    stop,
    done,
  };
}

function next(me) {
  if (!me.alive || job !== me) return;

  if (me.at >= me.chunks.length) { finish(me, true); return; }

  const idx = me.at;
  const chunk = me.chunks[idx];
  const line = chunk.text;
  const u = new SpeechSynthesisUtterance(line);

  const v = voiceFor(chunk.lang);
  if (v) { u.voice = v; u.lang = v.lang; }
  else u.lang = chunk.lang === 'en' ? 'en-US' : 'ko-KR';

  u.rate = clamp(me.cfg.rate, 0.1, 3);
  u.pitch = clamp(me.cfg.pitch, 0, 2);
  u.volume = clamp(me.cfg.volume, 0, 1);

  // 문장 사이는 아주 살짝 쉬어야 읽는 사람처럼 들린다
  let boundarySeen = false;
  let guess = 0;

  u.onstart = () => {
    if (!me.alive || job !== me) return;
    me.opts.onchunk?.(chunk.line ?? idx, line);
    // 지금 무엇을 읽고 있는지 — 읽기 판이 문단을 짚을 때 듣는다
    emit('speak:chunk', {
      index: idx, text: line, lang: chunk.lang, rate: u.rate,
      voice: v ? v.name : '',
    });
    // boundary 를 안 주는 목소리를 위한 어림 — 글자 수와 속도로 훑는다
    const perChar = 62 / u.rate;
    guess = setInterval(() => {
      if (boundarySeen || !me.alive) { clearInterval(guess); return; }
      const spent = Date.now() - t0;
      const at = Math.min(line.length, Math.floor(spent / perChar));
      me.opts.onword?.(at, idx);
      emit('speak:word', { index: at, chunk: idx, length: line.length });
    }, 120);
  };
  const t0 = Date.now();

  u.onboundary = (e) => {
    if (!me.alive || job !== me) return;
    boundarySeen = true;
    clearInterval(guess);
    me.opts.onword?.(e.charIndex ?? 0, idx);
    emit('speak:word', { index: e.charIndex ?? 0, chunk: idx, length: line.length });
  };

  u.onend = () => {
    clearInterval(guess);
    if (!me.alive || job !== me) return;
    emit('speak:chunkend', { index: idx, ms: Date.now() - t0, lang: chunk.lang });
    me.at += 1;
    // 문장과 문장 사이의 숨
    setTimeout(() => next(me), 130);
  };

  u.onerror = (e) => {
    clearInterval(guess);
    if (!me.alive || job !== me) return;
    // 'interrupted' / 'canceled' 는 우리가 끊은 것이니 조용히 넘어간다
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    console.warn('[tts]', e.error, '—', line.slice(0, 40));
    me.at += 1;              // 한 문장을 잃더라도 계속 읽는다
    setTimeout(() => next(me), 160);
  };

  me.current = u;
  try { synth.speak(u); }
  catch (err) { console.error('[tts] speak', err); finish(me, false); }
}

function finish(me, ok) {
  if (job === me) job = null;
  me.alive = false;
  stopKeepAlive();
  me.opts.onend?.(ok);
  me.resolve?.(ok);
  emit('speak:end', { finished: ok });
}

/** 말을 끊는다 */
export function stop() {
  const me = job;
  job = null;
  stopKeepAlive();
  if (me) {
    me.alive = false;
    me.opts.onend?.(false);
    me.resolve?.(false);
  }
  try { synth?.cancel(); } catch { /* 무시 */ }
  if (me) emit('speak:end', { finished: false });
}

/* ── 크롬이 조용히 잠드는 것을 막는다 ──
   말하는 동안 주기적으로 pause/resume 을 한 번씩 밟아 주면
   15초 벽을 넘어간다. 다른 브라우저에는 아무 해도 없다. */
function startKeepAlive() {
  stopKeepAlive();
  keepAlive = setInterval(() => {
    if (!job?.alive) { stopKeepAlive(); return; }
    if (synth.speaking && !synth.paused) {
      try { synth.pause(); synth.resume(); } catch { /* 무시 */ }
    }
  }, 9000);
}
function stopKeepAlive() {
  if (keepAlive) { clearInterval(keepAlive); keepAlive = 0; }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

/* ── 한 마디만 짧게 (시세 읽기·시험 듣기) ── */
export function say(line, opts = {}) {
  return speak(line, { ...opts });
}

/* ── 창을 떠날 때 입을 다문다 ── */
window.addEventListener('beforeunload', () => { try { synth?.cancel(); } catch {} });
document.addEventListener('visibilitychange', () => {
  // 탭이 뒤로 가면 크롬이 합성을 얼려 버린다. 돌아왔을 때 되살린다.
  if (document.visibilityState === 'visible' && job?.alive) {
    try { synth.resume(); } catch { /* 무시 */ }
  }
});
