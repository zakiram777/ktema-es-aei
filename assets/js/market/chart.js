/* ═══════════════════════════════════════════════════════════════
   chart.js — 봉과 선을 캔버스에 그린다

   외부 라이브러리를 쓰지 않는다. 그려야 할 것이 봉, 이동평균 둘,
   눈금, 십자선 정도라서 직접 그리는 편이 가볍고 색을 맞추기 쉽다.
   색은 CSS 변수에서 읽어 오므로, 설정에서 오름·내림 색을 뒤집으면
   차트도 따라 바뀐다.

   봉 하나를 누르면 onPick(bar) 이 불린다 — 자키람이 그 날을 읽는다.
   ═══════════════════════════════════════════════════════════════ */

import { px, num, big, dayStamp } from '../core/fmt.js';
import { computeAll, colorVar } from './indicators.js';

const PAD = { top: 16, right: 64, bottom: 28, left: 10 };

export class Chart {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{tip:HTMLElement, onPick:(bar,i)=>void}} opts
   */
  constructor(canvas, opts = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.tip = opts.tip || null;
    this.onPick = opts.onPick || (() => {});

    this.bars = [];
    this.inds = [];          // 겹쳐 그릴 지표들 (셈은 indicators.js 가 한다)
    this.hover = -1;
    this.intraday = false;

    this.#bindSize();
    this.#bindPointer();
  }

  /* ─────────────── 자료 ─────────────── */

  set(bars, { intraday = false, indicators = null } = {}) {
    this.bars = bars || [];
    this.intraday = intraday;
    if (indicators) this.list = indicators;
    this.recompute();
    this.hover = -1;
    this.draw();
  }

  /** 지표 목록이 바뀌었을 때 — 봉은 그대로 두고 줄만 다시 셈한다 */
  setIndicators(list) {
    this.list = list;
    this.recompute();
    this.draw();
  }

  recompute() {
    this.inds = computeAll(this.list || [], this.bars);
    // 가격 칸에 겹칠 것과 아래 칸에 따로 그릴 것을 가른다
    this.overlay = this.inds.filter((i) => i.pane === 'price');
    this.lower = this.inds.filter((i) => i.pane === 'lower');
  }

  /** 지금 그려진 것들 — 범례를 만들 때 쓴다 */
  legend() {
    return this.inds.map((i) => ({
      name: i.name,
      color: this.#css(colorVar(i.ind.color), '#d0ab63'),
      pane: i.pane,
      last: lastOf(i.out.lines[0]?.values),
    }));
  }

  /* ─────────────── 크기 ─────────────── */

  #bindSize() {
    const fit = () => {
      const r = this.cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.w = r.width; this.h = r.height; this.dpr = dpr;
      this.cv.width = Math.round(r.width * dpr);
      this.cv.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    };
    this.fit = fit;
    this.ro = new ResizeObserver(fit);
    this.ro.observe(this.cv);
    fit();
  }

  /* ─────────────── 손가락 ─────────────── */

  #bindPointer() {
    const at = (e) => {
      const r = this.cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (!this.bars.length) return -1;
      const { x0, step } = this.#geom();
      const i = Math.round((x - x0) / step);
      return Math.max(0, Math.min(this.bars.length - 1, i));
    };

    this.cv.addEventListener('pointermove', (e) => {
      const i = at(e);
      if (i !== this.hover) { this.hover = i; this.draw(); }
      this.#showTip(e);
    });

    this.cv.addEventListener('pointerleave', () => {
      this.hover = -1;
      if (this.tip) this.tip.hidden = true;
      this.draw();
    });

    this.cv.addEventListener('click', (e) => {
      const i = at(e);
      if (i >= 0 && this.bars[i]) this.onPick(this.bars[i], i, this.bars);
    });
  }

  #showTip(e) {
    if (!this.tip || this.hover < 0) return;
    const b = this.bars[this.hover];
    if (!b) return;

    const prev = this.bars[this.hover - 1];
    const ch = prev ? ((b.c - prev.c) / prev.c) * 100 : null;
    const when = this.intraday
      ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(b.t))
      : new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }).format(new Date(b.t));

    this.tip.innerHTML = `
      <b>${when}</b>
      <dl>
        <dt>시</dt><dd>${px(b.o)}</dd>
        <dt>고</dt><dd>${px(b.h)}</dd>
        <dt>저</dt><dd>${px(b.l)}</dd>
        <dt>종</dt><dd>${px(b.c)}</dd>
        ${ch != null ? `<dt>전일</dt><dd class="${ch > 0 ? 'up' : ch < 0 ? 'down' : ''}">${ch > 0 ? '+' : ''}${num(ch, 2)}%</dd>` : ''}
        ${b.v ? `<dt>양</dt><dd>${big(b.v)}</dd>` : ''}
      </dl>
      <span class="hint">눌러서 듣기</span>`;

    const r = this.cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    this.tip.style.left = `${Math.max(4, Math.min(this.w - tw - 4, x + 14))}px`;
    this.tip.style.top = `${Math.max(4, Math.min(this.h - th - 4, y - th - 12))}px`;
  }

  /* ─────────────── 자리 셈 ─────────────── */

  #geom() {
    const n = this.bars.length;
    const w = this.w - PAD.left - PAD.right;
    const step = n > 1 ? w / (n - 1) : w;
    return { x0: PAD.left, step, w };
  }

  #scale() {
    let lo = Infinity, hi = -Infinity;
    for (const b of this.bars) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
    // 겹쳐 그릴 지표도 눈금 안에 들어와야 한다. 볼린저 상단이 값의
    // 꼭대기를 넘는 일이 흔한데, 넣지 않으면 그 줄만 잘려 나간다.
    for (const ind of this.overlay || []) {
      for (const ln of ind.out.lines) {
        for (const v of ln.values) {
          if (v == null) continue;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1;
    lo -= pad; hi += pad;
    const top = PAD.top, bot = this.h - PAD.bottom;
    return { lo, hi, y: (v) => bot - ((v - lo) / (hi - lo)) * (bot - top), top, bot };
  }

  #css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ─────────────── 그리기 ─────────────── */

  draw() {
    const g = this.ctx;
    if (!g || !this.w) return;
    g.clearRect(0, 0, this.w, this.h);
    if (!this.bars.length) return;

    const s = this.#scale();
    if (!s) return;
    const { x0, step } = this.#geom();

    const cUp   = this.#css('--up', '#e2564a');
    const cDown = this.#css('--down', '#4f92e6');
    const cLine = this.#css('--line-soft', 'rgba(224,196,137,.07)');
    const cText = this.#css('--tx-600', '#4c4763');
    const cGold = this.#css('--gold-500', '#b98f45');
    const cJade = this.#css('--jade-500', '#5f9481');

    /* ── 가로 눈금과 오른쪽 값 ── */
    g.font = '11px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const v = s.lo + ((s.hi - s.lo) * i) / steps;
      const y = Math.round(s.y(v)) + 0.5;
      g.strokeStyle = cLine;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD.left, y); g.lineTo(this.w - PAD.right, y); g.stroke();
      g.fillStyle = cText;
      g.textAlign = 'left';
      g.fillText(px(v), this.w - PAD.right + 8, y);
    }

    /* ── 아래 날짜 ── */
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const marks = Math.min(6, this.bars.length);
    for (let i = 0; i < marks; i++) {
      const idx = Math.round((this.bars.length - 1) * (i / (marks - 1 || 1)));
      const b = this.bars[idx];
      if (!b) continue;
      const x = x0 + idx * step;
      const label = this.intraday
        ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(b.t))
        : new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: 'numeric' }).format(new Date(b.t));
      g.fillStyle = cText;
      g.fillText(label, Math.max(20, Math.min(this.w - PAD.right - 20, x)), this.h - PAD.bottom + 8);
    }

    /* ── 봉, 또는 선 ── */
    const bw = Math.max(1, Math.min(9, step * 0.66));
    if (bw >= 2.4 && !this.intraday) this.#candles(g, s, x0, step, bw, cUp, cDown);
    else this.#area(g, s, x0, step, cUp, cDown);

    /* ── 겹쳐 그릴 지표들 ──
       예전에는 이동평균 두 줄이 여기 박혀 있었다. 이제는 사람이 만든
       것을 그대로 그린다 (market/indicators.js). 볼린저처럼 두 줄
       사이를 물들여야 하는 것은 띠부터 깔고 줄을 얹는다. */
    for (const ind of this.overlay || []) {
      const color = this.#css(colorVar(ind.ind.color), cGold);

      if (ind.out.band) {
        this.#band(g, s, x0, step, ind.out.band, color);
      }
      for (const ln of ind.out.lines) {
        this.#line(g, s, x0, step, ln.values, color, ln.dash ? 1 : 1.35, ln.dash);
      }
    }

    /* ── 십자선 ── */
    if (this.hover >= 0 && this.bars[this.hover]) {
      const b = this.bars[this.hover];
      const x = Math.round(x0 + this.hover * step) + 0.5;
      g.save();
      g.strokeStyle = 'rgba(224,196,137,.34)';
      g.setLineDash([3, 4]);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, PAD.top); g.lineTo(x, this.h - PAD.bottom); g.stroke();
      const y = Math.round(s.y(b.c)) + 0.5;
      g.beginPath(); g.moveTo(PAD.left, y); g.lineTo(this.w - PAD.right, y); g.stroke();
      g.restore();

      // 오른쪽에 지금 값을 못박아 둔다
      g.fillStyle = 'rgba(9,7,20,.94)';
      g.strokeStyle = 'rgba(224,196,137,.4)';
      g.lineWidth = 1;
      const label = px(b.c);
      g.font = '11px "IBM Plex Mono", monospace';
      const tw = g.measureText(label).width + 12;
      g.beginPath();
      g.rect(this.w - PAD.right + 3, y - 9, tw, 18);
      g.fill(); g.stroke();
      g.fillStyle = this.#css('--gold-200', '#efdcb2');
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(label, this.w - PAD.right + 9, y);
    }
  }

  #candles(g, s, x0, step, bw, cUp, cDown) {
    for (let i = 0; i < this.bars.length; i++) {
      const b = this.bars[i];
      const prev = this.bars[i - 1];
      // 한국 관행대로: 전일 종가보다 높으면 오름색
      const up = prev ? b.c >= prev.c : b.c >= b.o;
      const col = up ? cUp : cDown;
      const x = Math.round(x0 + i * step) + 0.5;

      g.strokeStyle = col;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, Math.round(s.y(b.h)));
      g.lineTo(x, Math.round(s.y(b.l)));
      g.stroke();

      const yo = s.y(b.o), yc = s.y(b.c);
      const top = Math.min(yo, yc);
      const hgt = Math.max(1, Math.abs(yc - yo));
      g.fillStyle = col;
      g.globalAlpha = up ? 0.92 : 0.86;
      g.fillRect(Math.round(x - bw / 2), Math.round(top), Math.round(bw), Math.round(hgt));
      g.globalAlpha = 1;
    }
  }

  #area(g, s, x0, step, cUp, cDown) {
    const first = this.bars[0].c;
    const last = this.bars[this.bars.length - 1].c;
    const col = last >= first ? cUp : cDown;

    g.beginPath();
    this.bars.forEach((b, i) => {
      const x = x0 + i * step, y = s.y(b.c);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });

    // 아래를 옅게 채운다
    const fill = g.createLinearGradient(0, s.top, 0, s.bot);
    fill.addColorStop(0, this.#alpha(col, 0.26));
    fill.addColorStop(1, this.#alpha(col, 0));
    g.save();
    g.lineTo(x0 + (this.bars.length - 1) * step, s.bot);
    g.lineTo(x0, s.bot);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.restore();

    g.beginPath();
    this.bars.forEach((b, i) => {
      const x = x0 + i * step, y = s.y(b.c);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = col;
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.stroke();
  }

  /** 두 줄 사이를 아주 옅게 물들인다 — 볼린저 밴드 같은 것 */
  #band(g, s, x0, step, band, color) {
    const { upper, lower } = band;
    if (!upper?.length || !lower?.length) return;

    g.save();
    g.fillStyle = color;
    g.globalAlpha = 0.06;
    g.beginPath();

    let started = false;
    for (let i = 0; i < upper.length; i++) {
      const v = upper[i];
      if (v == null) continue;
      const x = x0 + i * step, y = s.y(v);
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    for (let i = lower.length - 1; i >= 0; i--) {
      const v = lower[i];
      if (v == null) continue;
      g.lineTo(x0 + i * step, s.y(v));
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  #line(g, s, x0, step, values, color, width, dash) {
    if (!values?.length) return;
    g.save();
    g.strokeStyle = color;
    g.globalAlpha = dash ? 0.44 : 0.62;
    g.lineWidth = width;
    g.lineJoin = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath();
    let started = false;
    values.forEach((v, i) => {
      if (v == null) { started = false; return; }
      const x = x0 + i * step, y = s.y(v);
      if (!started) { g.moveTo(x, y); started = true; }
      else g.lineTo(x, y);
    });
    g.stroke();
    g.restore();
  }

  /** #rrggbb 또는 rgb() 을 반투명으로 */
  #alpha(color, a) {
    const c = color.trim();
    if (c.startsWith('#')) {
      const n = c.length === 4
        ? c.slice(1).split('').map((x) => parseInt(x + x, 16))
        : [c.slice(1, 3), c.slice(3, 5), c.slice(5, 7)].map((x) => parseInt(x, 16));
      return `rgba(${n[0]},${n[1]},${n[2]},${a})`;
    }
    if (c.startsWith('rgb')) return c.replace(/rgba?\(([^)]+)\)/, (_, inner) => {
      const p = inner.split(',').slice(0, 3).map((x) => x.trim());
      return `rgba(${p.join(',')},${a})`;
    });
    return c;
  }

  destroy() { this.ro?.disconnect(); }
}

/** 카드 뒤에 깔리는 작은 선 */
export function sparkline(canvas, bars, color) {
  const g = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = canvas.getBoundingClientRect();
  if (!r.width || !bars?.length) return;
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);

  let lo = Infinity, hi = -Infinity;
  for (const b of bars) { if (b.c < lo) lo = b.c; if (b.c > hi) hi = b.c; }
  if (hi === lo) { hi += 1; lo -= 1; }

  g.beginPath();
  bars.forEach((b, i) => {
    const x = (i / (bars.length - 1 || 1)) * r.width;
    const y = r.height - ((b.c - lo) / (hi - lo)) * (r.height - 3) - 1.5;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  });
  g.strokeStyle = color;
  g.lineWidth = 1.2;
  g.lineJoin = 'round';
  g.stroke();
}

/* ═══════════════════ 아래 칸 ═══════════════════

   상대강도나 MACD 를 봉과 같은 자리에 겹쳐 그리면 둘 다 못 읽는다.
   값의 단위가 아예 다르기 때문이다 (코스피는 6900, RSI 는 38).
   그래서 따로 칸을 내어 그린다. 가로 자리는 위 차트와 똑같이 맞춘다 —
   같은 날이 위아래로 나란해야 눈이 잇는다. */

export class LowerChart {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.inds = [];
    this.bars = [];
    this.#bindSize();
  }

  #bindSize() {
    const fit = () => {
      const r = this.cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.w = r.width; this.h = r.height;
      this.cv.width = Math.round(r.width * dpr);
      this.cv.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    };
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(this.cv);
    else window.addEventListener('resize', fit);
    requestAnimationFrame(fit);
    this.fit = fit;
  }

  set(bars, inds) {
    this.bars = bars || [];
    this.inds = inds || [];
    this.draw();
  }

  /** 그릴 것이 있나 — 없으면 칸 자체를 접는다 */
  get empty() { return !this.inds.length || !this.bars.length; }

  draw() {
    const g = this.ctx;
    if (!g || !this.w) return;
    g.clearRect(0, 0, this.w, this.h);
    if (this.empty) return;

    // 여럿이면 칸을 나누어 쓴다
    const each = this.h / this.inds.length;
    this.inds.forEach((ind, n) => this.#one(g, ind, n * each, each));
  }

  #one(g, ind, top, height) {
    const pad = { left: PAD.left, right: PAD.right, top: 8, bottom: 8 };
    const iw = this.w - pad.left - pad.right;
    const ih = height - pad.top - pad.bottom;
    if (ih <= 4) return;

    const lines = ind.out.lines || [];
    const hist = ind.out.histogram;

    let lo = Infinity, hi = -Infinity;
    const eat = (vals) => {
      for (const v of vals) {
        if (v == null || !Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    };
    for (const ln of lines) eat(ln.values);
    if (hist) eat(hist.values);
    for (const lv of ind.out.levels || []) { if (lv < lo) lo = lv; if (lv > hi) hi = lv; }

    if (ind.out.range) { lo = ind.out.range[0]; hi = ind.out.range[1]; }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) return;

    const padv = (hi - lo) * 0.08;
    lo -= padv; hi += padv;

    const y = (v) => top + pad.top + (1 - (v - lo) / (hi - lo)) * ih;
    const step = iw / Math.max(1, this.bars.length - 1);
    const x = (i) => pad.left + i * step;

    const css = (n, f) => (getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f);
    const color = css(colorVar(ind.ind.color), '#d0ab63');
    const faint = css('--line-soft', 'rgba(224,196,137,.07)');
    const dim = css('--tx-600', '#4c4763');

    /* 눈금선 — 상대강도의 30·70 처럼 뜻이 있는 자리 */
    g.save();
    g.strokeStyle = faint;
    g.lineWidth = 1;
    g.font = '10px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';
    for (const lv of ind.out.levels || []) {
      if (lv < lo || lv > hi) continue;
      const yy = Math.round(y(lv)) + 0.5;
      g.beginPath(); g.moveTo(pad.left, yy); g.lineTo(pad.left + iw, yy); g.stroke();
      g.fillStyle = dim;
      g.textAlign = 'left';
      g.fillText(String(lv), this.w - pad.right + 6, yy);
    }
    g.restore();

    /* 막대 — 거래량, MACD 의 차이 */
    if (hist) {
      const bw = Math.max(1, Math.min(7, step * 0.62));
      const zero = hist.positive ? y(Math.max(0, lo)) : y(0);
      const up = css('--up', '#e2564a');
      const down = css('--down', '#4f92e6');
      g.save();
      g.globalAlpha = 0.42;
      hist.values.forEach((v, i) => {
        if (v == null) return;
        const yy = y(v);
        g.fillStyle = hist.positive ? color : (v >= 0 ? up : down);
        g.fillRect(x(i) - bw / 2, Math.min(yy, zero), bw, Math.max(1, Math.abs(zero - yy)));
      });
      g.restore();
    }

    /* 줄 */
    for (const ln of lines) {
      g.save();
      g.strokeStyle = color;
      g.globalAlpha = ln.dash ? 0.5 : 0.85;
      g.lineWidth = 1.3;
      g.lineJoin = 'round';
      if (ln.dash) g.setLineDash(ln.dash);
      g.beginPath();
      let started = false;
      ln.values.forEach((v, i) => {
        if (v == null) { started = false; return; }
        const xx = x(i), yy = y(v);
        if (!started) { g.moveTo(xx, yy); started = true; } else g.lineTo(xx, yy);
      });
      g.stroke();
      g.restore();
    }

    /* 이름표 */
    g.save();
    g.fillStyle = color;
    g.globalAlpha = 0.8;
    g.font = '10px "IBM Plex Mono", monospace';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(ind.name, pad.left + 3, top + 3);
    g.restore();
  }
}

const lastOf = (vals) => {
  if (!vals) return null;
  for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return vals[i];
  return null;
};
