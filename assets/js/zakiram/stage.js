/* ═══════════════════════════════════════════════════════════════
   stage.js — 끊기지 않는 얼굴

   요구는 하나다. 기사를 읽는 동안 입과 표정이 끊기지 않을 것.
   그래서 이렇게 짰다.

   ── 겹 두 장 ──
   <video> 를 두 장 포개 놓는다. 한 장이 보이는 동안 다른 한 장은
   다음에 틀 구간을 미리 열어 그 자리에 세워 둔다. 넘길 때가 되면
   세워 둔 쪽을 재생시키고 불투명도만 바꾼다. 검은 화면도, 멈춘
   프레임도 없다. 겹치는 0.5초 동안은 두 얼굴이 포개져 보이는데,
   같은 사람이고 같은 구도라 스르르 녹는 것처럼 보인다.

   ── 미리 세워 두기 ──
   구간이 시작하는 순간에 다음 구간을 정하고 곧바로 반대쪽 겹에
   실어 둔다. 넘기기까지 대개 5초에서 10초가 남으므로, 그 사이에
   파일을 받고 seek 까지 끝난다. 넘기는 순간에는 play() 한 번뿐이다.

   ── 기분은 다음 구간부터 ──
   기분이 바뀌어도 지금 재생 중인 구간은 끊지 않는다. 아직 넘기지
   않았으면 세워 둔 것만 바꿔 끼운다. 그래서 시장이 급변해도
   읽던 문장의 입 모양은 그대로 이어진다.

   급한 일(속보)에는 flash() 를 쓴다. 이때도 끊지 않고, 다음 넘길
   자리를 앞당길 뿐이다.
   ═══════════════════════════════════════════════════════════════ */

import { emit } from '../core/bus.js';
import { calmly } from '../core/dom.js';
import { clipUrl, posterUrl, chooseSpan, FIRST, WARM_ORDER, MOOD_KO, MOOD_GR } from './clips.js';

/** 겹치는 시간 (ms). 짧으면 툭 끊기고, 길면 흐리멍덩해진다 */
const XFADE = 560;
/** 말하지 않을 때의 재생 속도 — 느리게 틀면 숨 쉬는 것처럼 보인다 */
const REST_RATE = 0.62;
const TALK_RATE = 1.0;

export class Stage {
  /**
   * @param {HTMLElement} root  .zak
   */
  constructor(root) {
    this.root = root;
    this.frame = root.querySelector('.zak__frame');
    this.layers = [...root.querySelectorAll('.zak__layer')];
    this.moodEl = document.getElementById('zakMood');

    this.front = 0;          // 지금 보이는 겹
    this.mood = 'serene';
    this.speaking = false;
    this.current = null;     // 지금 재생 중인 구간
    this.armed = null;       // 반대쪽 겹에 세워 둔 구간
    this.armToken = 0;
    this.swapping = false;
    this.running = false;
    this.raf = 0;

    this.frame.style.setProperty('--xfade', `${XFADE}ms`);
    for (const v of this.layers) {
      v.muted = true;                 // 소리는 자키람의 목(tts)에서만 난다
      v.playsInline = true;
      v.loop = false;
      v.preload = 'auto';
    }
  }

  /* ─────────────── 켜기 ─────────────── */

  async start() {
    if (this.running) return;
    this.running = true;

    const first = FIRST;
    // 포스터를 먼저 깔아 두면 첫 프레임까지의 빈 자리가 없다
    this.frame.style.backgroundImage = `url("${posterUrl(first.n)}")`;

    const ok = await this.#load(this.layers[this.front], first);

    if (!ok) {
      // 영상이 아예 안 온다. 바닥의 정지 초상만 남기고 그렇다고 알린다.
      // 빈 네모를 보여 주며 아무 말도 하지 않는 것이 가장 나쁘다.
      this.root.classList.add('is-videoless');
      this.running = false;
      console.error('[zakiram] 영상을 하나도 불러오지 못했습니다. 정지 초상으로 대신합니다.');
      return;
    }

    this.current = first;
    this.layers[this.front].classList.add('is-on');
    this.#rate(this.layers[this.front]);
    await this.#play(this.layers[this.front]);

    this.#arm();
    this.#watch();
    this.#warm();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const v of this.layers) { try { v.pause(); } catch {} }
  }

  /* ─────────────── 기분 ─────────────── */

  /**
   * 기분을 바꾼다. 지금 재생 중인 구간은 끊지 않는다.
   * @param {string} mood
   */
  setMood(mood) {
    if (!mood || mood === this.mood) return;
    this.mood = mood;
    this.root.dataset.mood = mood;
    if (this.moodEl) this.moodEl.textContent = MOOD_KO[mood] || '';
    emit('mood:shown', { mood });

    // 아직 안 넘겼으면, 세워 둔 것만 새 기분에 맞게 갈아 끼운다
    if (!this.swapping) this.#arm(true);
  }

  /**
   * 급한 일 — 지금 구간을 끊지 않고 넘길 자리를 앞당긴다.
   * 남은 시간이 겹침보다 길면 바로 다음 프레임에 넘어가도록
   * 마감을 당겨 둔다.
   */
  flash(mood) {
    this.setMood(mood);
    this.hurry = true;
  }

  /** 말하는 중인가 — 재생 속도와 테두리가 달라진다 */
  setSpeaking(on) {
    if (this.speaking === on) return;
    this.speaking = on;
    this.root.classList.toggle('is-speaking', on);
    this.#rate(this.layers[this.front]);
    if (this.armed) this.#rate(this.layers[1 - this.front]);
  }

  /* ─────────────── 안쪽 ─────────────── */

  #rate(v) {
    if (!v) return;
    try { v.playbackRate = this.speaking ? TALK_RATE : REST_RATE; } catch {}
  }

  /**
   * 겹 하나에 구간을 실어 그 자리에 세운다.
   * @returns {Promise<boolean>} 그림이 실제로 실렸는지
   */
  #load(v, span) {
    const want = clipUrl(span.n);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(bail);
        v.removeEventListener('seeked', onSeeked);
        v.removeEventListener('error', onError);
        resolve(ok);
      };

      const onSeeked = () => done(true);
      const onError = () => {
        console.warn('[zakiram] 영상을 읽지 못했습니다:', want);
        done(false);
      };

      const seek = () => {
        try {
          v.currentTime = span.from;
          v.addEventListener('seeked', onSeeked, { once: true });
        } catch { done(v.readyState >= 2); }
      };

      v.addEventListener('error', onError, { once: true });

      // 이미 그 파일이면 자리만 옮긴다 — 다시 받지 않는다
      const same = v.dataset.clip === String(span.n) && v.readyState >= 1;
      if (same) { seek(); }
      else {
        v.dataset.clip = String(span.n);
        v.src = want;
        v.load();
        v.addEventListener('loadedmetadata', seek, { once: true });
      }

      // 느린 회선에서 영영 기다리지 않게.
      // 시간이 다 됐어도 그림이 들어와 있으면 성공으로 본다.
      const bail = setTimeout(() => done(v.readyState >= 2), 6000);
    });
  }

  /**
   * 재생. 자동 재생이 막히면 조용히 넘어가지 않고 화면에 표시한다.
   *
   * 음소거된 영상은 대개 자동 재생이 허용되지만, 브라우저 설정이나
   * 전원 절약 모드에서는 막힌다. 그때 아무 말도 하지 않으면 자키람이
   * 멈춘 그림처럼 보인다. 눌러서 깨울 수 있게 알려 준다.
   */
  async #play(v) {
    try {
      await v.play();
      this.root.classList.remove('is-stalled');
      return true;
    } catch {
      this.root.classList.add('is-stalled');
      this.#armWake();
      return false;
    }
  }

  /** 아무 데나 한 번 누르면 다시 재생을 시도한다 */
  #armWake() {
    if (this.waking) return;
    this.waking = true;

    const wake = async () => {
      const v = this.layers[this.front];
      if (!v) return;
      try {
        await v.play();
        this.root.classList.remove('is-stalled');
        this.waking = false;
        document.removeEventListener('pointerdown', wake);
        document.removeEventListener('keydown', wake);
      } catch { /* 아직도 막혀 있다 — 다음 누름을 기다린다 */ }
    };

    document.addEventListener('pointerdown', wake);
    document.addEventListener('keydown', wake);
  }

  /** 다음 구간을 정해 반대쪽 겹에 세워 둔다 */
  async #arm(replace = false) {
    if (!this.running) return;
    if (this.armed && !replace) return;

    const token = ++this.armToken;
    const back = this.layers[1 - this.front];
    const span = chooseSpan(this.mood, this.current);

    this.armed = null;
    const ok = await this.#load(back, span);
    if (token !== this.armToken || !this.running) return;   // 그새 다른 것이 정해졌다

    // 한 편을 못 읽었다고 멈추지는 않는다. 다음 것으로 다시 세운다.
    if (!ok) { setTimeout(() => this.#arm(true), 400); return; }

    this.#rate(back);
    this.armed = span;
  }

  /** 넘기기 */
  async #swap() {
    if (this.swapping || !this.armed) return;
    this.swapping = true;
    this.hurry = false;

    const fromIdx = this.front;
    const toIdx = 1 - this.front;
    const from = this.layers[fromIdx];
    const to = this.layers[toIdx];
    const span = this.armed;

    this.#rate(to);
    await this.#play(to);

    // 들어오는 쪽이 실제로 그림을 내보내기 시작한 뒤에 겹친다.
    // 그러지 않으면 잠깐 멈춘 프레임이 비친다.
    await this.#firstFrame(to);

    to.classList.add('is-on');
    from.classList.remove('is-on');

    this.front = toIdx;
    this.current = span;
    this.armed = null;

    // 겹침이 끝나면 뒤로 간 겹을 세운다 (전지와 발열)
    setTimeout(() => {
      if (this.front !== fromIdx) { try { from.pause(); } catch {} }
      this.swapping = false;
      this.#arm();
    }, XFADE + 60);
  }

  /** 그림 한 장이 실제로 나올 때까지 */
  #firstFrame(v) {
    return new Promise((resolve) => {
      const rvfc = v.requestVideoFrameCallback?.bind(v);
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      if (rvfc) rvfc(() => rvfc(fin));           // 두 장째에 확실히 나온다
      else requestAnimationFrame(() => requestAnimationFrame(fin));
      setTimeout(fin, 400);
    });
  }

  /**
   * 구간의 끝에 왔는가. 왔으면 넘긴다.
   * 세 곳에서 부른다 — 프레임마다(정확), timeupdate(성기지만 꾸준),
   * 그리고 영상이 제 끝까지 갔을 때(마지막 그물).
   */
  #edge() {
    if (!this.running || this.swapping) return;

    const v = this.layers[this.front];
    const span = this.current;
    if (!v || !span) return;

    const rate = v.playbackRate || 1;
    // 겹치는 동안 들어오는 쪽도 재생되어야 하므로, 겹침만큼 미리 시작한다
    const lead = (XFADE / 1000) * rate;

    if (v.currentTime >= span.to - lead || this.hurry) {
      if (this.armed) { this.#swap(); return; }
      // 다음 것이 아직 안 섰다 — 이 구간을 되감아 이어 간다.
      // 끊기느니 같은 자리를 한 번 더 도는 편이 낫다.
      if (v.currentTime >= span.to - 0.05) {
        try { v.currentTime = span.from; } catch {}
        this.#play(v);
        this.#arm(true);
      }
      return;
    }

    // 어쩌다 구간 밖으로 나갔으면 되돌린다
    if (v.currentTime < span.from - 0.4) {
      try { v.currentTime = span.from; } catch {}
    }
    if (v.paused) this.#play(v);
  }

  /**
   * 구간의 끝을 지킨다.
   *
   * 프레임마다 보는 것이 가장 깔끔하다 — timeupdate 는 초당 네 번쯤이라
   * 최대 0.25초를 넘겨 버린다. 다만 rAF 는 탭이 뒤에 있으면 아예 돌지
   * 않는다. 그래서 timeupdate 와 ended 를 그물로 한 겹 더 둔다.
   * 뒤에 있는 동안에는 겹침이 매끄럽지 않아도 상관없다. 멈춰 서지만
   * 않으면 된다.
   */
  #watch() {
    const tick = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      this.#edge();
    };
    this.raf = requestAnimationFrame(tick);

    for (const v of this.layers) {
      v.addEventListener('timeupdate', () => {
        if (v === this.layers[this.front]) this.#edge();
      });
      v.addEventListener('ended', () => {
        if (v === this.layers[this.front]) this.#edge();
      });
    }

    // 탭이 돌아왔을 때 자리를 바로잡는다
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !this.running) return;
      const v = this.layers[this.front];
      const s = this.current;
      if (!v || !s) return;
      if (v.currentTime >= s.to || v.currentTime < s.from - 0.4) {
        try { v.currentTime = s.from; } catch {}
      }
      this.#play(v);
    });
  }

  /**
   * 나머지 영상을 조용히 미리 받아 둔다.
   * 화면이 자리를 잡은 뒤, 한 편씩, 회선이 한가할 때만.
   */
  #warm() {
    if (navigator.connection?.saveData) return;
    const slow = /2g/.test(navigator.connection?.effectiveType || '');
    if (slow) return;

    let i = 0;
    const step = () => {
      if (!this.running || i >= WARM_ORDER.length) return;
      const n = WARM_ORDER[i++];
      fetch(clipUrl(n), { cache: 'force-cache', mode: 'same-origin' })
        .catch(() => {})
        .finally(() => setTimeout(step, 900));
    };
    // 첫 화면이 다 그려지고 나서
    if ('requestIdleCallback' in window) requestIdleCallback(() => setTimeout(step, 2500));
    else setTimeout(step, 4000);
  }
}

/** 기분 이름을 그리스어로 — 이름표에 쓴다 */
export const moodGreek = (m) => MOOD_GR[m] || '';
