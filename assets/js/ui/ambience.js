/* ═══════════════════════════════════════════════════════════════
   ambience.js — 종이 위의 소용돌이

   이토 준지의 『소용돌이』에서 마을 사람들은 소용돌이에 홀린다.
   벽의 무늬에서, 연기에서, 사람의 귀에서 그것을 본다. 처음에는
   아무도 알아채지 못하고, 알아챈 뒤에는 그것밖에 보이지 않는다.

   그 결을 배경에 두었다. 종이 위에 아주 옅은 소용돌이 둘이 서로
   반대로 감기고, 먹 티끌이 그 결을 따라 아주 느리게 흐른다.

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
      // 먹 티끌. 아주 가끔 하나가 붉다 — 종이에 떨어진 한 방울.
      g.fillStyle = m.warm
        ? `rgba(158, 31, 24, ${a * 0.5})`
        : `rgba(26, 24, 23, ${a * 0.62})`;
      g.fill();
    }
  }

  /**
   * 소용돌이 둘 — 서로 반대로 감긴다.
   *
   * 로그 나선(logarithmic spiral)이다. r = a·e^(bθ). 조개껍데기와
   * 은하와 태풍이 같은 셈으로 감긴다. 이토 준지가 그린 소용돌이도
   * 이 결이다 — 아르키메데스 나선(간격이 일정한 것)으로 그리면
   * 용수철처럼 보여 홀리지 않는다.
   */
  #mandala(g, w, h, px, py) {
    const cx = w * 0.5 + px * 26;
    const cy = h * 0.46 + py * 18;
    const R = Math.min(w, h) * 0.66;

    g.save();
    g.translate(cx, cy);
    g.lineWidth = 1;

    this.#spiral(g, R, this.t * 0.0062, 1, 'rgba(26, 24, 23, .085)', 5);
    this.#spiral(g, R * 0.74, -this.t * 0.0094, -1, 'rgba(26, 24, 23, .055)', 4);

    // 한가운데 — 여기서 모든 것이 시작한다
    g.strokeStyle = 'rgba(158, 31, 24, .12)';
    g.beginPath();
    g.arc(0, 0, R * 0.035, 0, Math.PI * 2);
    g.stroke();

    g.restore();
  }

  /**
   * @param {number} R      바깥 반지름
   * @param {number} rot    지금 얼마나 돌아갔나
   * @param {number} dir    감기는 방향
   * @param {string} color
   * @param {number} arms   팔이 몇 개인가
   */
  #spiral(g, R, rot, dir, color, arms) {
    g.save();
    g.rotate(rot);
    g.strokeStyle = color;

    const b = 0.19;                       // 감기는 정도. 크면 성기고 작으면 촘촘하다
    const turns = 3.4;
    const steps = 260;
    const thetaMax = turns * Math.PI * 2;
    const a = R / Math.exp(b * thetaMax);

    for (let arm = 0; arm < arms; arm++) {
      const off = (arm / arms) * Math.PI * 2;
      g.beginPath();
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * thetaMax;
        const r = a * Math.exp(b * th);
        const ang = off + th * dir;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
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
