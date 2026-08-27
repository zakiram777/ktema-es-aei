/* ═══════════════════════════════════════════════════════════════
   ambience.js — 배경의 티끌과 만다라

   금가루가 아주 느리게 떠다니고, 그 뒤로 커다란 문양 두 겹이
   서로 반대로 돈다. 자키람의 후광이 화면 전체로 번진 것처럼
   보이게 하려는 것이다.

   눈에 띄면 실패다. 알아채기 직전에서 멈춘다.
   ═══════════════════════════════════════════════════════════════ */

import { calmly, throttle } from '../core/dom.js';

const MOTE_PER_MPX = 42;      // 백만 화소당 티끌 수
const MAX_MOTES = 150;

export class Ambience {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d', { alpha: true });
    this.motes = [];
    this.t = 0;
    this.raf = 0;
    this.on = false;
    this.pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

    this.fit = throttle(() => this.#fit(), 160);
    window.addEventListener('resize', this.fit);
    this.#fit();

    if (!calmly()) {
      window.addEventListener('pointermove', (e) => {
        this.pointer.tx = e.clientX / window.innerWidth;
        this.pointer.ty = e.clientY / window.innerHeight;
      }, { passive: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.start();
      else this.pause();
    });
  }

  #fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#seed();
  }

  #seed() {
    const want = Math.min(MAX_MOTES, Math.round((this.w * this.h) / 1e6 * MOTE_PER_MPX));
    const m = this.motes;
    while (m.length > want) m.pop();
    while (m.length < want) m.push(this.#mote());
  }

  #mote() {
    const depth = Math.random();          // 0 멀리 … 1 가까이
    return {
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + depth * 1.5,
      depth,
      // 위로 아주 천천히, 옆으로는 더 천천히
      vy: -(0.0035 + depth * 0.012) / 60,
      vx: (Math.random() - 0.5) * 0.006 / 60,
      phase: Math.random() * Math.PI * 2,
      blink: 0.5 + Math.random() * 1.6,
      warm: Math.random() < 0.72,        // 금빛 / 푸른빛
    };
  }

  start() {
    if (this.on) return;
    this.on = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.#tick);
  }

  pause() {
    this.on = false;
    cancelAnimationFrame(this.raf);
  }

  #tick = (now) => {
    if (!this.on) return;
    this.raf = requestAnimationFrame(this.#tick);

    const dt = Math.min(64, now - this.last);
    this.last = now;
    this.t += dt / 1000;

    // 커서를 아주 조금 따라간다
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.02;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.02;

    this.#draw(dt);
  };

  #draw(dt) {
    const g = this.g;
    const { w, h } = this;
    g.clearRect(0, 0, w, h);

    const px = (this.pointer.x - 0.5);
    const py = (this.pointer.y - 0.5);

    this.#mandala(g, w, h, px, py);

    // ── 티끌 ──
    for (const m of this.motes) {
      m.y += m.vy * dt;
      m.x += m.vx * dt;
      if (m.y < -0.03) { m.y = 1.03; m.x = Math.random(); }
      if (m.x < -0.03) m.x = 1.03;
      if (m.x > 1.03) m.x = -0.03;

      // 가까운 것일수록 커서를 더 따라간다
      const ox = px * m.depth * 34;
      const oy = py * m.depth * 22;
      const x = m.x * w + ox;
      const y = m.y * h + oy;

      const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.t * m.blink + m.phase));
      const a = (0.10 + m.depth * 0.30) * blink;

      g.beginPath();
      g.arc(x, y, m.r, 0, Math.PI * 2);
      g.fillStyle = m.warm
        ? `rgba(228, 198, 140, ${a})`
        : `rgba(158, 176, 226, ${a * 0.8})`;
      g.fill();

      // 가장 가까운 것 몇에만 빛무리
      if (m.depth > 0.86) {
        g.beginPath();
        g.arc(x, y, m.r * 5, 0, Math.PI * 2);
        g.fillStyle = `rgba(228, 198, 140, ${a * 0.07})`;
        g.fill();
      }
    }
  }

  /** 아주 옅은 문양 두 겹 — 서로 반대로 돈다 */
  #mandala(g, w, h, px, py) {
    const cx = w * 0.5 + px * 26;
    const cy = h * 0.46 + py * 18;
    const R = Math.min(w, h) * 0.62;

    g.save();
    g.translate(cx, cy);
    g.lineWidth = 1;

    // 바깥 — 눈금 고리
    g.save();
    g.rotate(this.t * 0.0072);
    g.strokeStyle = 'rgba(208, 171, 99, .052)';
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.965, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const long = i % 6 === 0;
      const r1 = R * 0.965, r2 = R * (long ? 0.925 : 0.947);
      g.beginPath();
      g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      g.stroke();
    }
    g.restore();

    // 안쪽 — 겹친 삼각형
    g.save();
    g.rotate(-this.t * 0.0115);
    g.strokeStyle = 'rgba(208, 171, 99, .038)';
    const r = R * 0.58;
    for (const flip of [0, Math.PI]) {
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = flip + (i / 3) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath(); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.stroke();
    g.restore();

    g.restore();
  }

  destroy() {
    this.pause();
    window.removeEventListener('resize', this.fit);
  }
}

/** 관문의 인장에 눈금을 박는다 */
export function drawSealTicks(svgGroup) {
  if (!svgGroup) return;
  const ns = 'http://www.w3.org/2000/svg';
  const cx = 110, cy = 110;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    const r1 = 98, r2 = long ? 88 : 93;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', (cx + Math.cos(a) * r1).toFixed(2));
    line.setAttribute('y1', (cy + Math.sin(a) * r1).toFixed(2));
    line.setAttribute('x2', (cx + Math.cos(a) * r2).toFixed(2));
    line.setAttribute('y2', (cy + Math.sin(a) * r2).toFixed(2));
    svgGroup.appendChild(line);
  }
}
