/* ═══════════════════════════════════════════════════════════════
   ambience.js — 종이 위의 소용돌이

   이토 준지의 『소용돌이』에서 마을 사람들은 소용돌이에 홀린다.
   벽의 무늬에서, 연기에서, 사람의 귀에서 그것을 본다. 처음에는
   아무도 알아채지 못하고, 알아챈 뒤에는 그것밖에 보이지 않는다.

   그 결을 배경으로 삼았다. 넉 겹이다.

     1. 소용돌이   로그 나선 여럿이 서로 반대로 감긴다. 숨을 쉰다.
     2. 해칭       그 나선의 흐름을 따라 그은 잔선. 만화의 스크린톤이다.
     3. 균열       가장자리에서 이따금 금이 자라 들어온다.
     4. 티끌       흐름을 따라 아주 느리게 떠다니는 먹가루.

   ── 왜 흐름장(flow field)인가 ──
   해칭을 아무렇게나 그으면 그냥 빗금이다. 나선의 접선 방향으로
   그으면 종이 전체가 한 방향으로 빨려 드는 것처럼 보인다. 눈은
   선 하나하나를 읽지 않고 그 흐름만 읽는다.

   ── 눈에 띄면 실패다 ──
   글을 읽는 사람의 눈이 배경으로 가면 안 된다. 그래서 짙기를 아주
   낮게 두고, 대신 아주 느리게 움직인다. 알아채기 직전에서 멈춘다.
   ═══════════════════════════════════════════════════════════════ */

import { calmly, throttle } from '../core/dom.js';

const MOTE_PER_MPX = 34;
const MAX_MOTES = 130;

/** 소용돌이의 감김 — 크면 성기고 작으면 촘촘하다 */
const COIL = 0.185;

export class Ambience {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d', { alpha: true });
    this.motes = [];
    this.cracks = [];
    this.t = 0;
    this.raf = 0;
    this.on = false;
    this.pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    this.scroll = 0;

    this.fit = throttle(() => this.#fit(), 160);
    window.addEventListener('resize', this.fit);
    this.#fit();

    if (!calmly()) {
      window.addEventListener('pointermove', (e) => {
        this.pointer.tx = e.clientX / window.innerWidth;
        this.pointer.ty = e.clientY / window.innerHeight;
      }, { passive: true });

      // 굴릴 때 소용돌이가 함께 감긴다 — 화면이 살아 있게
      window.addEventListener('scroll', () => {
        this.scroll = window.scrollY || 0;
      }, { passive: true });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.start();
      else this.pause();
    });
  }

  #fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const want = Math.min(MAX_MOTES, Math.round((w * h) / 1e6 * MOTE_PER_MPX));
    this.motes = Array.from({ length: want }, () => this.#mote());
  }

  #mote() {
    const depth = Math.random();
    return {
      a: Math.random() * Math.PI * 2,        // 나선 위의 어느 각도에 있나
      r: 0.12 + Math.random() * 0.95,        // 가운데서 얼마나 멀리
      depth,
      size: 0.5 + depth * 1.5,
      speed: 0.00006 + Math.random() * 0.00018,
      phase: Math.random() * Math.PI * 2,
      blink: 0.4 + Math.random() * 1.1,
      red: Math.random() < 0.06,             // 아주 가끔 한 방울이 붉다
    };
  }

  start() {
    if (this.on || calmly()) return;
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
    this.t += dt;

    // 손을 천천히 따라간다 — 곧바로 따라붙으면 배경이 아니라 커서가 된다
    this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.018;
    this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.018;

    this.#draw(dt);
  };

  /* ═══════════════ 흐름장 ═══════════════

     어느 자리에서 소용돌이가 어느 쪽으로 흐르는가.
     나선의 접선이다 — 반지름 방향에서 조금 비껴 있다. */

  #flow(dx, dy) {
    const ang = Math.atan2(dy, dx);
    // 로그 나선의 접선은 반지름과 늘 같은 각을 이룬다 (그것이 로그 나선의 성질이다)
    const pitch = Math.atan(1 / COIL);
    return ang + pitch;
  }

  #draw(dt) {
    const g = this.g;
    const { w, h } = this;
    g.clearRect(0, 0, w, h);

    const px = this.pointer.x - 0.5;
    const py = this.pointer.y - 0.5;

    // 소용돌이의 눈. 손을 따라 아주 조금 움직이고, 굴리면 함께 돈다.
    const cx = w * 0.5 + px * 40;
    const cy = h * 0.44 + py * 28;
    const R = Math.max(w, h) * 0.78;
    const spin = this.t * 0.00006 + this.scroll * 0.00028;

    // 숨 — 아주 느리게 커졌다 작아진다
    const breath = 1 + Math.sin(this.t * 0.00016) * 0.045;

    g.save();
    g.translate(cx, cy);

    this.#hatch(g, R * breath, spin);
    this.#spiral(g, R * breath, spin, 1, 'rgba(26, 24, 23, .075)', 5, 1.1);
    this.#spiral(g, R * 0.62 * breath, -spin * 1.7, -1, 'rgba(26, 24, 23, .05)', 4, 0.9);
    this.#eye(g, R);

    g.restore();

    this.#crackTick(g, dt);
    this.#motes(g, cx, cy, R);
  }

  /**
   * 소용돌이 하나.
   * 로그 나선이다 — r = a·e^(bθ). 조개껍데기와 은하와 태풍이 같은
   * 셈으로 감긴다. 간격이 일정한 아르키메데스 나선으로 그리면
   * 용수철처럼 보여 홀리지 않는다.
   */
  #spiral(g, R, rot, dir, color, arms, width) {
    g.save();
    g.rotate(rot);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';

    const turns = 3.6;
    const steps = 300;
    const thetaMax = turns * Math.PI * 2;
    const a = R / Math.exp(COIL * thetaMax);

    for (let arm = 0; arm < arms; arm++) {
      const off = (arm / arms) * Math.PI * 2;
      g.beginPath();
      for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * thetaMax;
        const r = a * Math.exp(COIL * th);
        const ang = off + th * dir;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  /**
   * 해칭 — 흐름을 따라 그은 잔선.
   *
   * 만화의 스크린톤이 하는 일이다. 면을 칠하지 않고 선을 촘촘히
   * 그어 어둡게 만든다. 여기서는 그 선들이 소용돌이의 접선을
   * 따르므로, 종이 전체가 한쪽으로 빨려 드는 것처럼 보인다.
   */
  #hatch(g, R, rot) {
    g.save();
    g.strokeStyle = 'rgba(26, 24, 23, .035)';
    g.lineWidth = 0.8;

    const rings = 9;
    const perRing = 46;

    for (let ring = 1; ring <= rings; ring++) {
      const rr = (ring / rings) * R * 0.95;
      // 고리마다 조금씩 다른 속도로 돈다 — 그래야 층이 살아 움직인다
      const drift = rot * (1 + ring * 0.16) + ring * 0.5;
      const len = 10 + ring * 3.4;

      g.beginPath();
      for (let i = 0; i < perRing; i++) {
        const th = drift + (i / perRing) * Math.PI * 2;
        const x = Math.cos(th) * rr;
        const y = Math.sin(th) * rr;
        const dir = this.#flow(x, y);
        g.moveTo(x - Math.cos(dir) * len * 0.5, y - Math.sin(dir) * len * 0.5);
        g.lineTo(x + Math.cos(dir) * len * 0.5, y + Math.sin(dir) * len * 0.5);
      }
      g.stroke();
    }
    g.restore();
  }

  /**
   * 소용돌이의 눈.
   * 한가운데의 작은 고리 하나. 이 화면에서 붉은 것은 이것뿐이다.
   */
  #eye(g, R) {
    const r = R * 0.028;
    const pulse = 1 + Math.sin(this.t * 0.0008) * 0.18;

    g.save();
    g.strokeStyle = 'rgba(158, 31, 24, .16)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, r * pulse, 0, Math.PI * 2);
    g.stroke();

    g.strokeStyle = 'rgba(158, 31, 24, .08)';
    g.beginPath();
    g.arc(0, 0, r * pulse * 2.4, 0, Math.PI * 2);
    g.stroke();
    g.restore();
  }

  /* ═══════════════ 균열 ═══════════════

     이따금 가장자리에서 금이 하나 자라 들어온다. 다 자라면 천천히
     옅어져 사라진다. 늘 있으면 무늬가 되고, 없으면 종이가 너무
     멀쩡하다. 이따금이어야 한다. */

  #crackTick(g, dt) {
    // 대략 12초에 하나
    if (this.cracks.length < 3 && Math.random() < dt / 12000) {
      this.cracks.push(this.#newCrack());
    }

    for (const c of this.cracks) {
      c.grow = Math.min(1, c.grow + dt / c.growMs);
      if (c.grow >= 1) c.fade = Math.min(1, c.fade + dt / 9000);
    }
    this.cracks = this.cracks.filter((c) => c.fade < 1);

    for (const c of this.cracks) this.#drawCrack(g, c);
  }

  #newCrack() {
    const { w, h } = this;
    const side = Math.floor(Math.random() * 4);
    const start = [
      { x: Math.random() * w, y: -4 },
      { x: w + 4, y: Math.random() * h },
      { x: Math.random() * w, y: h + 4 },
      { x: -4, y: Math.random() * h },
    ][side];

    // 화면 가운데(소용돌이의 눈) 쪽으로 자란다 — 모든 것이 그리로 간다
    const toward = Math.atan2(h * 0.44 - start.y, w * 0.5 - start.x);

    const pts = [start];
    let x = start.x, y = start.y, ang = toward;
    const steps = 16 + Math.floor(Math.random() * 14);
    const step = Math.min(w, h) * 0.035;

    for (let i = 0; i < steps; i++) {
      ang += (Math.random() - 0.5) * 0.9;
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
      pts.push({ x, y });
    }

    return { pts, grow: 0, fade: 0, growMs: 2600 + Math.random() * 2600 };
  }

  #drawCrack(g, c) {
    const n = Math.max(2, Math.floor(c.pts.length * c.grow));
    g.save();
    g.strokeStyle = `rgba(26, 24, 23, ${0.11 * (1 - c.fade)})`;
    g.lineWidth = 0.9;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const p = c.pts[i];
      i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y);
    }
    g.stroke();

    // 잔가지 — 금은 곧게 자라지 않는다
    g.strokeStyle = `rgba(26, 24, 23, ${0.06 * (1 - c.fade)})`;
    for (let i = 3; i < n - 1; i += 4) {
      const a = c.pts[i], b = c.pts[i + 1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + (i % 8 === 3 ? 0.8 : -0.8);
      const len = 8 + (i % 5) * 4;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(a.x + Math.cos(ang) * len, a.y + Math.sin(ang) * len);
      g.stroke();
    }
    g.restore();
  }

  /* ═══════════════ 티끌 ═══════════════
     흐름을 따라 아주 느리게 안으로 빨려 든다. 가운데에 닿으면
     다시 바깥에서 시작한다. */

  #motes(g, cx, cy, R) {
    for (const m of this.motes) {
      m.a += m.speed * 16 * (1 + m.depth);
      m.r -= m.speed * 3.2;
      if (m.r < 0.06) { m.r = 1.05; m.a = Math.random() * Math.PI * 2; }

      const rr = m.r * R * 0.62;
      const x = cx + Math.cos(m.a) * rr;
      const y = cy + Math.sin(m.a) * rr * 0.92;
      if (x < -20 || x > this.w + 20 || y < -20 || y > this.h + 20) continue;

      const blink = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.t * 0.001 * m.blink + m.phase));
      const alpha = (0.08 + m.depth * 0.2) * blink;

      g.beginPath();
      g.arc(x, y, m.size, 0, Math.PI * 2);
      g.fillStyle = m.red
        ? `rgba(158, 31, 24, ${alpha * 0.85})`
        : `rgba(26, 24, 23, ${alpha})`;
      g.fill();
    }
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

  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    const r1 = 92;
    const r2 = long ? 84 : 88;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', (cx + Math.cos(a) * r1).toFixed(2));
    line.setAttribute('y1', (cy + Math.sin(a) * r1).toFixed(2));
    line.setAttribute('x2', (cx + Math.cos(a) * r2).toFixed(2));
    line.setAttribute('y2', (cy + Math.sin(a) * r2).toFixed(2));
    svgGroup.appendChild(line);
  }
}

/**
 * 관문의 소용돌이를 그린다.
 *
 * 들어오기 전에 이미 홀려 있어야 한다. 그래서 관문의 것은 배경보다
 * 훨씬 짙고 크다 — 넉 자를 넣는 동안 이것을 보게 된다.
 */
export function drawGateSpiral(svgGroup) {
  if (!svgGroup) return;
  const ns = 'http://www.w3.org/2000/svg';
  const cx = 110, cy = 110;
  const R = 100;
  const coil = 0.2;
  const turns = 3.2;
  const thetaMax = turns * Math.PI * 2;
  const a = R / Math.exp(coil * thetaMax);

  for (let arm = 0; arm < 3; arm++) {
    const off = (arm / 3) * Math.PI * 2;
    let d = '';
    for (let i = 0; i <= 220; i++) {
      const th = (i / 220) * thetaMax;
      const r = a * Math.exp(coil * th);
      const ang = off + th;
      const x = (cx + Math.cos(ang) * r).toFixed(2);
      const y = (cy + Math.sin(ang) * r).toFixed(2);
      d += (i ? 'L' : 'M') + x + ' ' + y + ' ';
    }
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d.trim());
    svgGroup.appendChild(path);
  }
}
