/* ═══════════════════════════════════════════════════════════════
   mouth.js — 말을 따라 움직이는 입

   영상 열세 편의 입은 지금 읽는 말과 아무 상관이 없다. 그것을
   고치려면 영상을 새로 만드는 수밖에 없다. 대신 할 수 있는 일은
   있다 — 음소로 푼 입 모양(voice/phoneme.js)을 얼굴 위에 겹쳐
   그리는 것이다.

   그리는 방식을 고르는 데 오래 망설였다. 진짜 입술처럼 그리면
   조금만 어긋나도 흉해진다. 그래서 이 사이트가 처음부터 쓰던 결을
   따랐다 — 금빛 획 하나. 입술을 흉내 내지 않고, 말이 지나가는
   자리를 빛으로 짚는다. 어긋나도 그저 빛이고, 맞으면 말을 한다.

   ── 어디에 그리나 ──
   영상마다 얼굴의 자리가 조금씩 다르고, 보는 사람의 눈도 다르다.
   그래서 자리를 설정으로 뺐다. 설정 → Χείλη 에서 '입 자리 맞추기' 를
   켜고 얼굴 위를 누르면 그 자리에 놓인다. 한 번 맞추면 남는다.
   기본값은 포스터에서 입술을 재어 잡았다 (가로 74.3%, 세로 70%).

   ── 언제 그리나 ──
   말할 때만. 말이 끝나면 조용히 사그라든다. 소리를 꺼 두었거나
   입 맞추기를 꺼 두면 아예 그리지 않는다.
   ═══════════════════════════════════════════════════════════════ */

import { on } from '../core/bus.js';
import * as store from '../core/store.js';
import { calmly } from '../core/dom.js';
import { toVisemes, visemeAt, timeAt, VISEME } from '../voice/phoneme.js';
import { Pacer } from '../voice/pace.js';

/* 입 모양마다의 값 — 모두 입 상자 크기에 대한 비율이다.
     w  좌우로 벌린 너비(반쪽)
     t  윗입술이 열린 높이
     b  아랫입술이 열린 높이
     r  입꼬리를 오므린 정도 (0 넓게 퍼짐 … 1 동그랗게 모음) */
const SHAPE = {
  [VISEME.REST]: { w: 0.46, t: 0.02, b: 0.03, r: 0.18 },
  [VISEME.M]:    { w: 0.47, t: 0.00, b: 0.00, r: 0.12 },
  [VISEME.F]:    { w: 0.44, t: 0.02, b: 0.07, r: 0.14 },
  [VISEME.A]:    { w: 0.37, t: 0.19, b: 0.28, r: 0.30 },
  [VISEME.E]:    { w: 0.45, t: 0.11, b: 0.16, r: 0.22 },
  [VISEME.I]:    { w: 0.54, t: 0.06, b: 0.08, r: 0.08 },
  [VISEME.O]:    { w: 0.29, t: 0.17, b: 0.21, r: 0.62 },
  [VISEME.U]:    { w: 0.23, t: 0.10, b: 0.13, r: 0.80 },
  [VISEME.S]:    { w: 0.44, t: 0.04, b: 0.06, r: 0.16 },
  [VISEME.N]:    { w: 0.42, t: 0.08, b: 0.11, r: 0.18 },
  [VISEME.K]:    { w: 0.42, t: 0.11, b: 0.14, r: 0.20 },
};

/** 입이 그 꼴에 다다르는 데 걸리는 시간 — 짧으면 딱딱하고 길면 흐리멍덩하다 */
const TAU_OPEN = 34;    // 벌릴 때는 빠르게
const TAU_CLOSE = 52;   // 다물 때는 조금 느긋하게

const SVG_NS = 'http://www.w3.org/2000/svg';

export class Mouth {
  /** @param {HTMLElement} zak  .zak */
  constructor(zak) {
    this.zak = zak;
    this.frame = zak.querySelector('.zak__frame');

    this.tl = null;          // 지금 읽는 조각의 입 모양 줄
    this.pacer = null;       // 그 조각을 실제 속도에 맞춰 따라가는 자
    this.speaking = false;
    this.raf = 0;
    this.last = 0;
    this.align = false;

    // 지금 그려져 있는 꼴 (목표를 향해 스르르 옮겨 간다)
    this.cur = { ...SHAPE[VISEME.REST], a: 0 };

    this.#build();
    this.place();
    this.#wireBus();
    this.#wireDrag();
    this.#wireHidden();
  }

  /* ─────────────── 짓기 ─────────────── */

  #build() {
    const box = document.createElement('div');
    box.className = 'zak__mouth';
    box.setAttribute('aria-hidden', 'true');

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '-50 -50 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 안쪽(입 안)과 획(입술) 두 겹. 안쪽이 있어야 벌어진 것이 보인다.
    this.fill = document.createElementNS(SVG_NS, 'path');
    this.fill.setAttribute('class', 'zak__mouth-in');
    this.line = document.createElementNS(SVG_NS, 'path');
    this.line.setAttribute('class', 'zak__mouth-lip');

    svg.append(this.fill, this.line);
    box.appendChild(svg);
    this.box = box;
    this.frame.appendChild(box);
  }

  /* ─────────────── 자리와 크기 ─────────────── */

  /** 설정에 적힌 자리로 옮긴다 */
  place() {
    const x = num(store.get('mouthX'), 50);
    const y = num(store.get('mouthY'), 64);
    const size = num(store.get('mouthSize'), 17);
    this.box.style.left = `${x}%`;
    this.box.style.top = `${y}%`;
    this.box.style.width = `${size}%`;
    this.#paint(true);
  }

  /** 입 맞추기 — 켜면 얼굴 위에서 끌어 옮길 수 있다 */
  setAlign(on) {
    this.align = !!on;
    this.zak.classList.toggle('is-aligning', this.align);
    if (this.align) this.#paint(true);
  }

  #wireDrag() {
    let dragging = false;

    const move = (e) => {
      if (!dragging) return;
      const r = this.frame.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      store.set({
        mouthX: Math.round(Math.max(10, Math.min(90, x)) * 10) / 10,
        mouthY: Math.round(Math.max(10, Math.min(95, y)) * 10) / 10,
      });
      this.place();
    };

    this.frame.addEventListener('pointerdown', (e) => {
      if (!this.align) return;
      dragging = true;
      this.frame.setPointerCapture?.(e.pointerId);
      move(e);
      e.preventDefault();
    });
    this.frame.addEventListener('pointermove', move);
    this.frame.addEventListener('pointerup', () => { dragging = false; });
    this.frame.addEventListener('pointercancel', () => { dragging = false; });
  }

  /* ─────────────── 말을 듣는다 ─────────────── */

  #wireBus() {
    on('speak:chunk', ({ text, lang, rate, voice }) => {
      if (!this.#enabled()) return;
      this.tl = toVisemes(text, lang, { rate });
      // 이 목소리가 실제로 얼마나 빠른지는 pace.js 가 안다.
      // 배운 것이 있으면 첫 마디부터 맞은 속도로 시작한다.
      this.pacer = new Pacer(this.tl, { voice, lang, at: performance.now() });
      this.#start();
    });

    /* 합성기가 "여기를 읽는 중" 이라고 알려 줄 때.

       예전에는 시작 시각만 뒤로 당겼다. 그것은 어긋난 자리를 옮길 뿐
       어긋나는 속도는 그대로 두는 일이라, 당겨 놓아도 곧 다시 벌어지고
       당길 때마다 입이 튀었다. 이제는 줄 자체를 늘이고 줄인다. */
    on('speak:word', ({ index }) => {
      if (!this.tl || !this.pacer || !this.speaking) return;
      this.pacer.mark(index ?? 0, timeAt(this.tl, index ?? 0));
    });

    // 한 마디가 끝나면 실제로 걸린 시간으로 이 목소리의 속도를 배운다
    on('speak:chunkend', ({ ms }) => {
      this.pacer?.finish(ms);
    });

    on('speak:end', () => this.#stop());

    // 설정에서 자리나 크기를 만지면 곧바로 따라 옮긴다
    on('settings:changed', ({ key }) => {
      if (/^mouth/.test(key) || key === 'lipsync') this.place();
    });
  }

  #enabled() {
    return store.get('lipsync') !== false && !store.get('muted');
  }

  #start() {
    if (this.speaking) return;
    this.speaking = true;
    this.zak.classList.add('is-mouthing');
    this.last = performance.now();
    const frame = (now) => {
      if (!this.speaking) return;
      this.raf = requestAnimationFrame(frame);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(frame);
  }

  #stop() {
    this.tl = null;
    this.pacer = null;
    if (!this.speaking) return;
    this.speaking = false;
    this.zak.classList.remove('is-mouthing');
    cancelAnimationFrame(this.raf);
    // 말이 끝나면 다문 자리로 조용히 되돌린다
    const settle = (now) => {
      const done = this.tick(now, VISEME.REST, 0);
      if (!done) requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
  }

  /**
   * 탭이 뒤로 가면 rAF 가 멎는다. 그동안 벌어져 있던 입이 그대로
   * 굳어 있게 되므로, 돌아왔을 때 어색하지 않게 다문 자리로 되돌린다.
   */
  #wireHidden() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') return;
      this.cur = { ...SHAPE[VISEME.REST], a: 0 };
      this.#paint(true);
    });
  }

  /**
   * 한 프레임 그린다. 대개 requestAnimationFrame 이 부르지만,
   * 밖에서 시각을 주어 직접 돌릴 수도 있다 (시험할 때 쓴다).
   * @returns {boolean} 목표에 다다라 더 그릴 것이 없나
   */
  tick(now = performance.now(), forceViseme = null, forceAlpha = null) {
    const dt = Math.min(64, now - this.last || 16);
    this.last = now;

    const v = forceViseme
      || (this.tl && this.pacer ? visemeAt(this.tl, this.pacer.at(now)) : VISEME.REST);
    const want = SHAPE[v] || SHAPE[VISEME.REST];

    // '동작 줄이기' 를 켜 둔 사람에게는 덜 움직이고 더 느긋하게.
    // 아예 끄지는 않는다 — 이 획은 꾸밈이 아니라 지금 말하고 있다는 표시다.
    const calm = calmly();
    const strength = clamp(num(store.get('mouthStrength'), 1), 0.2, 1.6) * (calm ? 0.6 : 1);
    const alpha = forceAlpha ?? (this.speaking ? 1 : 0);

    // 지수 감쇠로 다가간다. 벌릴 때와 다물 때의 결이 다르다.
    const open = want.t + want.b > this.cur.t + this.cur.b;
    const tau = (open ? TAU_OPEN : TAU_CLOSE) * (calm ? 2.2 : 1);
    const k = 1 - Math.exp(-dt / tau);

    let moved = false;
    for (const key of ['w', 't', 'b', 'r']) {
      const target = key === 't' || key === 'b' ? want[key] * strength : want[key];
      const next = this.cur[key] + (target - this.cur[key]) * k;
      if (Math.abs(next - this.cur[key]) > 0.0004) moved = true;
      this.cur[key] = next;
    }
    const na = this.cur.a + (alpha - this.cur.a) * (1 - Math.exp(-dt / 90));
    if (Math.abs(na - this.cur.a) > 0.002) moved = true;
    this.cur.a = na;

    this.#paint();
    return !moved;
  }

  #paint(force = false) {
    if (!this.box) return;
    const { w, t, b, r, a } = this.cur;
    const show = this.align ? Math.max(a, 0.5) : a;
    this.box.style.opacity = String(show);
    if (!show && !force) return;

    // 좌우 40 을 최대 너비로 삼는다 (viewBox −50…50)
    const W = w * 88;
    const T = t * 88;
    const B = b * 88;
    const cx = W * (1 - r);          // 입꼬리에서 안쪽으로 얼마나 모을지

    const d = `M ${-W} 0`
            + ` C ${-cx} ${-T * 2.1} ${cx} ${-T * 2.1} ${W} 0`
            + ` C ${cx} ${B * 2.1} ${-cx} ${B * 2.1} ${-W} 0 Z`;

    this.line.setAttribute('d', d);
    this.fill.setAttribute('d', d);
  }
}

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
