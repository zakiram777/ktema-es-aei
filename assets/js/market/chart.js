/* ═══════════════════════════════════════════════════════════════
   chart.js — 봉과 선을 캔버스에 그린다

   외부 라이브러리를 쓰지 않는다. 그려야 할 것이 봉, 이동평균 둘,
   눈금, 십자선 정도라서 직접 그리는 편이 가볍고 색을 맞추기 쉽다.
   색은 CSS 변수에서 읽어 오므로, 설정에서 오름·내림 색을 뒤집으면
   차트도 따라 바뀐다.

   ── 견주어 보기 ──
   비교할 것을 걸면 눈금이 값에서 백분율로 바뀐다. 코스피 3천과 애플
   230은 같은 눈금에 못 올리지만, "이 구간에서 몇 퍼센트 움직였나" 는
   올릴 수 있다. 견줄 수 있는 것은 값이 아니라 움직인 정도다.
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

    this.bars = [];          // 받아 온 것 전부
    this.shown = [];         // 그중 지금 보이는 것
    this.view = null;        // { from, to } — null 이면 전부
    this.inds = [];          // 겹쳐 그릴 지표들 (셈은 indicators.js 가 한다)
    this.cmp = [];           // 견주어 그릴 것들 — 있으면 눈금이 백분율로 바뀐다
    this.profile = false;    // 값대별 거래량을 옆으로 눕혀 그릴지
    this.ratio = false;      // 견주는 것이 하나일 때 비율 한 줄로 볼지
    this.hover = -1;
    this.intraday = false;

    this.#bindSize();
    this.#bindPointer();
  }

  /* ─────────────── 자료 ─────────────── */

  set(bars, { intraday = false, indicators = null, keepView = false, name = '' } = {}) {
    this.bars = bars || [];
    if (name) this.name = name;
    this.intraday = intraday;
    // 봉이 갈렸으면 견주는 줄도 새 날짜에 맞춰 다시 짝짓는다
    for (const c of this.cmp) c.values = alignTo(this.bars, c.bars);
    if (indicators) this.list = indicators;
    if (!keepView) this.view = null;      // 새 종목이면 처음부터 다시 본다
    this.recompute();
    this.hover = -1;
    this.draw();
  }

  /* ═══════════════ 보이는 구간 ═══════════════

     차트에 손을 얹고 굴리면 그 자리를 중심으로 당겨지고 밀린다.
     밀고 끌면 옆으로 흐른다. 두 번 누르면 처음으로 돌아간다.

     기간 단추(5일·1개월…)는 서버에 다시 묻는 일이고, 이것은 이미
     받아 둔 봉 안에서 들여다보는 일이다. 둘은 다르다 — 5년치를
     받아 놓고 그 안의 한 달을 확대해 볼 수 있다. */

  /** 지금 보이는 자리 — 늘 성한 값으로 돌려준다 */
  range() {
    const n = this.bars.length;
    if (!n) return { from: 0, to: 0, count: 0 };
    if (!this.view) return { from: 0, to: n - 1, count: n };
    const from = Math.max(0, Math.min(n - 1, Math.round(this.view.from)));
    const to = Math.max(from + 1, Math.min(n - 1, Math.round(this.view.to)));
    return { from, to, count: to - from + 1 };
  }

  /** 보이는 구간을 새로 정한다 */
  setRange(from, to) {
    const n = this.bars.length;
    if (n < 2) return;

    let a = Math.round(from);
    let b = Math.round(to);

    // 너무 좁으면 봉 하나가 화면을 다 먹는다. 너무 넓으면 전부다.
    const MIN = Math.min(12, n);
    if (b - a + 1 < MIN) {
      const mid = (a + b) / 2;
      a = Math.round(mid - MIN / 2);
      b = a + MIN - 1;
    }

    if (a < 0) { b -= a; a = 0; }
    if (b > n - 1) { a -= (b - (n - 1)); b = n - 1; }
    a = Math.max(0, a);

    this.view = (a === 0 && b === n - 1) ? null : { from: a, to: b };
    this.recompute();
    this.draw();
    this.onView?.(this.range());
  }

  /** 처음으로 — 받아 온 것 전부를 다시 본다 */
  resetView() {
    if (!this.view) return;
    this.view = null;
    this.recompute();
    this.draw();
    this.onView?.(this.range());
  }

  /* ═══════════════ 견주어 보기 ═══════════════

     날짜를 맞춰 짝짓는다. 그냥 나란히 늘어놓으면 안 된다 — 서울과
     뉴욕은 장이 서는 날이 다르므로, 개수만 맞춰 붙이면 하루씩 밀린
     채로 겹쳐진다. 밀린 그림은 틀린 그림보다 나쁘다. 틀린 줄은
     알아보지만 하루 밀린 줄은 알아보지 못하기 때문이다.

     짝이 없는 날은 null 로 둔다. 선은 그 자리에서 끊긴다. */

  /** @param {Array<{symbol,ko,bars,color}>} list */
  setCompare(list) {
    this.cmp = (list || []).map((c) => ({
      symbol: c.symbol,
      name: c.ko || c.symbol,
      color: c.color,
      bars: c.bars,
      values: alignTo(this.bars, c.bars),
    }));
    this.recompute();
    this.draw();
  }

  /** 지금 백분율 눈금인가 */
  get pctMode() { return this.cmp.length > 0 && !this.ratioMode; }

  /** 지금 비율 한 줄인가 — 견줄 것이 딱 하나일 때만 뜻이 있다 */
  get ratioMode() { return this.ratio && this.cmp.length === 1; }

  /** 값대별 거래량을 켜고 끈다 */
  setProfile(on) { this.profile = !!on; this.draw(); }

  /** 비율 눈금을 켜고 끈다 */
  setRatio(on) { this.ratio = !!on; this.draw(); }

  /** 지표 목록이 바뀌었을 때 — 봉은 그대로 두고 줄만 다시 셈한다 */
  setIndicators(list) {
    this.list = list;
    this.recompute();
    this.draw();
  }

  recompute() {
    // 지표는 늘 '전체' 봉으로 셈한다. 보이는 구간만으로 셈하면 창
    // 왼쪽 끝의 예순 날 평균이 틀린다 — 그 앞 예순 날이 없으니까.
    const full = computeAll(this.list || [], this.bars);

    const { from, to } = this.range();
    this.shown = this.bars.slice(from, to + 1);

    // 셈은 전체로 하고, 그린 줄에서 보이는 자리만 오려 낸다
    const cut = (vals) => (Array.isArray(vals) ? vals.slice(from, to + 1) : vals);
    this.inds = full.map((ind) => ({
      ...ind,
      out: {
        ...ind.out,
        lines: (ind.out.lines || []).map((l) => ({ ...l, values: cut(l.values) })),
        histogram: ind.out.histogram
          ? { ...ind.out.histogram, values: cut(ind.out.histogram.values) }
          : null,
        band: ind.out.band
          ? { upper: cut(ind.out.band.upper), lower: cut(ind.out.band.lower) }
          : null,
      },
      full: ind.out,          // 범례는 마지막 값을 전체에서 읽는다
    }));

    this.overlay = this.inds.filter((i) => i.pane === 'price');
    this.lower = this.inds.filter((i) => i.pane === 'lower');

    this.cmpShown = this.cmp.map((c) => ({ ...c, shown: c.values.slice(from, to + 1) }));
  }

  /** 지금 그려진 것들 — 범례를 만들 때 쓴다 */
  legend() {
    return this.inds.map((i) => ({
      name: i.name,
      color: this.#css(colorVar(i.ind.color), '#d0ab63'),
      pane: i.pane,
      last: lastOf((i.full || i.out).lines[0]?.values),
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
      if (!this.shown.length) return -1;
      const { x0, step } = this.#geom();
      const i = Math.round((x - x0) / step);
      return Math.max(0, Math.min(this.shown.length - 1, i));
    };

    /* ── 굴려서 당기고 밀기 ──

       손이 얹힌 자리를 붙들어 둔 채 창을 좁히거나 넓힌다. 그래야
       "보고 있던 그 자리" 가 손끝에 남는다. 가운데를 기준으로 하면
       들여다보려던 것이 자꾸 화면 밖으로 밀려난다.

       ctrl 을 누른 채 굴리는 것은 브라우저의 확대다. 그것까지
       가로채면 화면 전체를 키우려는 사람이 차트에 갇힌다. */
    this.cv.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return;
      if (this.bars.length < 3) return;
      e.preventDefault();

      const { from, to, count } = this.range();
      const { x0, step } = this.#geom();
      const rect = this.cv.getBoundingClientRect();

      // 손끝이 지금 몇 번째 봉 위에 있나 (전체 기준)
      const local = (e.clientX - rect.left - x0) / (step || 1);
      const at = from + Math.max(0, Math.min(count - 1, local));

      // 아래로 굴리면 넓어지고(멀어지고), 위로 굴리면 좁아진다(가까워진다)
      const dir = e.deltaY > 0 ? 1 : -1;
      const factor = dir > 0 ? 1.18 : 1 / 1.18;
      const want = Math.max(12, Math.round(count * factor));

      // 손끝의 자리를 창 안에서 그대로 붙들어 둔다
      const ratio = count > 1 ? (at - from) / (count - 1) : 0.5;
      const a = at - ratio * (want - 1);
      this.setRange(a, a + want - 1);
    }, { passive: false });

    /* ── 끌어서 옆으로 ──
       확대해 놓고 나면 옆을 보고 싶어진다. 손으로 종이를 미는 것과
       같게 두었다 — 오른쪽으로 끌면 왼쪽(옛날)이 나온다. */
    let drag = null;
    this.cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = this.range();
      drag = { x: e.clientX, from: r.from, to: r.to, moved: false };
      this.cv.setPointerCapture?.(e.pointerId);
    });

    const endDrag = () => {
      if (drag?.moved) this.cv.classList.remove('is-dragging');
      drag = null;
    };
    this.cv.addEventListener('pointerup', endDrag);
    this.cv.addEventListener('pointercancel', endDrag);

    this.cv.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { step } = this.#geom();
      const shift = Math.round((e.clientX - drag.x) / (step || 1));
      if (!shift) return;
      if (!drag.moved) { drag.moved = true; this.cv.classList.add('is-dragging'); this.cv.dataset.dragged = '1'; }
      this.setRange(drag.from - shift, drag.to - shift);
    });

    // 두 번 누르면 처음으로
    this.cv.addEventListener('dblclick', () => this.resetView());

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
      if (this.cv.dataset.dragged === '1') { this.cv.dataset.dragged = ''; return; }
      const i = at(e);
      if (i >= 0 && this.shown[i]) this.onPick(this.shown[i], i, this.shown);
    });
  }

  #showTip(e) {
    if (!this.tip || this.hover < 0) return;
    const b = this.shown[this.hover];
    if (!b) return;

    const prev = this.shown[this.hover - 1];
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
      <span class="hint">굴려서 확대 · 끌어서 이동</span>`;

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
    const n = this.shown.length;
    const w = this.w - PAD.left - PAD.right;
    const step = n > 1 ? w / (n - 1) : w;
    return { x0: PAD.left, step, w };
  }

  #scale() {
    let lo = Infinity, hi = -Infinity;
    for (const b of this.shown) { if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; }
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
    if (!this.shown.length) return;

    const s = this.#scale();
    if (!s) return;
    const { x0, step } = this.#geom();

    const cUp   = this.#css('--up', '#e2564a');
    const cDown = this.#css('--down', '#4f92e6');
    const cLine = this.#css('--line-soft', 'rgba(26,24,23,.08)');
    const cText = this.#css('--tx-600', '#4c4763');
    const cGold = this.#css('--key-500', '#2962ff');
    const cJade = this.#css('--ok', '#26a69a');

    if (this.ratioMode) { this.#drawRatio(g, x0, step, cLine, cText); return; }
    if (this.pctMode) { this.#drawPct(g, x0, step, cUp, cDown, cLine, cText); return; }

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
    this.#dates(g, x0, step, cText);

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

    /* ── 값대별 거래량 ── */
    if (this.profile) this.#volumeProfile(g, s);

    /* ── 십자선 ── */
    if (this.hover >= 0 && this.shown[this.hover]) {
      const b = this.shown[this.hover];
      const x = Math.round(x0 + this.hover * step) + 0.5;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.26)';
      g.setLineDash([3, 4]);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, PAD.top); g.lineTo(x, this.h - PAD.bottom); g.stroke();
      const y = Math.round(s.y(b.c)) + 0.5;
      g.beginPath(); g.moveTo(PAD.left, y); g.lineTo(this.w - PAD.right, y); g.stroke();
      g.restore();

      // 오른쪽에 지금 값을 못박아 둔다
      g.fillStyle = this.#css('--bg-400', '#2d3547');
      g.strokeStyle = 'rgba(255,255,255,.2)';
      g.lineWidth = 1;
      const label = px(b.c);
      g.font = '11px "IBM Plex Mono", monospace';
      const tw = g.measureText(label).width + 12;
      g.beginPath();
      g.rect(this.w - PAD.right + 3, y - 9, tw, 18);
      g.fill(); g.stroke();
      g.fillStyle = this.#css('--tx-100', '#e6ebf2');
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(label, this.w - PAD.right + 9, y);
    }
  }

  /* ═══════════════ 백분율 눈금 ═══════════════

     견줄 것이 걸리면 여기로 온다. 창 왼쪽 끝을 0%로 삼고, 거기서
     저마다 얼마나 움직였는지를 그린다. 창을 옮기면 기준도 함께
     옮겨 간다 — "지금 보고 있는 이 구간에서" 를 재는 것이므로.

     봉은 그리지 않는다. 여섯 개를 겹쳐 놓고 봉까지 그리면 아무것도
     안 보인다. 견줄 때 필요한 것은 시가·고가·저가가 아니라 결이다. */

  #drawPct(g, x0, step, cUp, cDown, cLine, cText) {
    const base = this.shown[0]?.c;
    if (!(base > 0)) return;

    // 그릴 줄 전부 — 본디 것을 맨 앞에
    const series = [
      { name: this.name || '기준', color: this.#css('--tx-100', '#e6ebf2'), main: true,
        vals: this.shown.map((b) => (b.c / base - 1) * 100) },
      ...this.cmpShown.map((c) => {
        const b0 = c.shown.find((v) => v != null);
        return {
          name: c.name,
          color: c.color,
          vals: b0 > 0 ? c.shown.map((v) => (v == null ? null : (v / b0 - 1) * 100)) : [],
        };
      }),
    ];

    let lo = Infinity, hi = -Infinity;
    for (const ser of series) {
      for (const v of ser.vals) {
        if (v == null || !Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo)) return;
    const pad = (hi - lo) * 0.1 || 2;
    lo -= pad; hi += pad;

    const top = PAD.top, bot = this.h - PAD.bottom;
    const y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);

    /* ── 눈금 ── */
    g.font = '11px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const v = lo + ((hi - lo) * i) / 5;
      const yy = Math.round(y(v)) + 0.5;
      g.strokeStyle = cLine;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD.left, yy); g.lineTo(this.w - PAD.right, yy); g.stroke();
      g.fillStyle = cText;
      g.textAlign = 'left';
      g.fillText(`${v > 0 ? '+' : ''}${v.toFixed(1)}%`, this.w - PAD.right + 8, yy);
    }

    // 0선 — 견줄 때 가장 중요한 줄이다. 그 위냐 아래냐가 전부다.
    if (lo < 0 && hi > 0) {
      const yz = Math.round(y(0)) + 0.5;
      g.strokeStyle = this.#css('--line-hard', 'rgba(255,255,255,.13)');
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD.left, yz); g.lineTo(this.w - PAD.right, yz); g.stroke();
    }

    this.#dates(g, x0, step, cText);

    /* ── 줄들 ── */
    for (const ser of series) {
      if (!ser.vals.length) continue;
      g.strokeStyle = ser.color;
      g.lineWidth = ser.main ? 1.9 : 1.3;
      g.globalAlpha = ser.main ? 1 : 0.86;
      g.beginPath();
      let pen = false;
      ser.vals.forEach((v, i) => {
        if (v == null || !Number.isFinite(v)) { pen = false; return; }
        const xx = x0 + i * step, yy = y(v);
        if (pen) g.lineTo(xx, yy); else { g.moveTo(xx, yy); pen = true; }
      });
      g.stroke();
      g.globalAlpha = 1;

      // 오른쪽 끝에 지금 값을 적는다. 줄이 여럿이면 어느 줄이
      // 어느 것인지 범례를 다시 보러 가지 않아도 되게.
      const last = [...ser.vals].reverse().find((v) => v != null);
      if (last == null) continue;
      const yy = Math.round(y(last));
      g.fillStyle = ser.color;
      g.textAlign = 'left';
      g.font = `${ser.main ? '600 ' : ''}11px "IBM Plex Mono", monospace`;
      g.fillText(`${last > 0 ? '+' : ''}${last.toFixed(1)}%`, this.w - PAD.right + 8, yy);
    }

    /* ── 십자선 ── */
    if (this.hover >= 0 && this.shown[this.hover]) {
      const x = Math.round(x0 + this.hover * step) + 0.5;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.26)';
      g.setLineDash([3, 4]);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, PAD.top); g.lineTo(x, bot); g.stroke();
      g.restore();
    }
  }

  /** 아래 날짜 — 두 눈금이 함께 쓴다 */
  #dates(g, x0, step, cText) {
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const marks = Math.min(6, this.shown.length);
    for (let i = 0; i < marks; i++) {
      const idx = Math.round((this.shown.length - 1) * (i / (marks - 1 || 1)));
      const b = this.shown[idx];
      if (!b) continue;
      const x = x0 + idx * step;
      const label = this.intraday
        ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' }).format(new Date(b.t))
        : new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: 'numeric' }).format(new Date(b.t));
      g.fillStyle = cText;
      g.fillText(label, Math.max(20, Math.min(this.w - PAD.right - 20, x)), this.h - PAD.bottom + 8);
    }
  }

  /* ═══════════════ 값대별 거래량 ═══════════════

     시간축 거래량은 "언제 많았나" 를 말한다. 이것은 "어느 값에서
     많았나" 를 말한다. 둘은 다른 물음이고, 뒤엣것이 대개 더 쓸모
     있다 — 사람들이 실제로 사고판 값은 다시 왔을 때 걸리는 자리가
     되기 때문이다.

     한 봉의 거래량을 종가 한 점에 몰아넣지 않고 그 봉의 고저 사이에
     고르게 편다. 하루에 값이 3% 움직였다면 그 3% 구간 어디에서든
     거래가 있었을 것이고, 종가에 다 몰아넣으면 없는 봉우리가 생긴다.

     가장 두꺼운 칸(POC, point of control)만 색을 달리해 짚어 준다. */

  #volumeProfile(g, s) {
    const bins = 48;
    const lo = s.lo, hi = s.hi;
    if (!(hi > lo)) return;

    const step = (hi - lo) / bins;
    const buckets = new Array(bins).fill(0);
    let any = false;

    for (const b of this.shown) {
      const v = b.v || 0;
      if (!v) continue;
      any = true;
      const top = Math.max(b.h, b.c, b.o);
      const bot = Math.min(b.l, b.c, b.o);
      const a = Math.max(0, Math.min(bins - 1, Math.floor((bot - lo) / step)));
      const z = Math.max(0, Math.min(bins - 1, Math.floor((top - lo) / step)));
      const share = v / (z - a + 1);
      for (let k = a; k <= z; k++) buckets[k] += share;
    }
    if (!any) return;

    const max = Math.max(...buckets);
    if (!(max > 0)) return;
    const poc = buckets.indexOf(max);

    // 오른쪽 값 눈금을 가리지 않게 왼쪽에서 자란다. 너비는 판의 1/4까지.
    const wide = (this.w - PAD.left - PAD.right) * 0.26;
    const base = PAD.left;

    g.save();
    for (let k = 0; k < bins; k++) {
      if (!buckets[k]) continue;
      const yTop = s.y(lo + step * (k + 1));
      const yBot = s.y(lo + step * k);
      const h = Math.max(1, yBot - yTop - 1);
      const w = (buckets[k] / max) * wide;
      g.fillStyle = k === poc
        ? this.#css('--key-500', '#2962ff')
        : this.#css('--tx-400', '#6b7688');
      g.globalAlpha = k === poc ? 0.5 : 0.22;
      g.fillRect(base, yTop, w, h);
    }
    g.restore();
  }

  /* ═══════════════ 비율 한 줄 ═══════════════

     견줄 것이 딱 하나일 때만 뜻이 있다. 두 값을 나눈 줄 하나를 그린다.

     "둘 다 올랐는데 무엇이 더 올랐나" 를 두 줄이 아니라 한 줄로 본다.
     두 줄을 겹쳐 놓으면 눈이 그 사이를 재야 하는데, 사람은 두 곡선
     사이의 간격을 잘 못 잰다. 나눠 놓으면 잴 필요가 없다 — 올라가면
     이쪽이 이기는 중이고 내려가면 지는 중이다.

     띠는 그 줄의 평균에서 표준편차만큼 떨어진 자리다. 밖으로 나가면
     둘 사이가 드물게 벌어진 것이고, 대개는 되돌아온다. 대개는. */

  #drawRatio(g, x0, step, cLine, cText) {
    const other = this.cmpShown[0];
    if (!other) return;

    const vals = this.shown.map((b, i) => {
      const o = other.shown[i];
      return (o == null || !(o > 0)) ? null : b.c / o;
    });

    const good = vals.filter((v) => v != null);
    if (good.length < 5) return;

    let lo = Math.min(...good), hi = Math.max(...good);
    const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.02 || 1;
    lo -= pad; hi += pad;

    const top = PAD.top, bot = this.h - PAD.bottom;
    const y = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);

    // 평균과 표준편차 — 지금 보이는 구간 안에서만 잰다
    const m = good.reduce((a, b) => a + b, 0) / good.length;
    const sd = Math.sqrt(good.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, good.length - 1));

    /* ── 눈금 ── */
    g.font = '11px "IBM Plex Mono", monospace';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const v = lo + ((hi - lo) * i) / 5;
      const yy = Math.round(y(v)) + 0.5;
      g.strokeStyle = cLine;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(PAD.left, yy); g.lineTo(this.w - PAD.right, yy); g.stroke();
      g.fillStyle = cText;
      g.textAlign = 'left';
      g.fillText(v < 1 ? v.toFixed(3) : v.toFixed(v < 100 ? 2 : 0), this.w - PAD.right + 8, yy);
    }

    /* ── 평균과 그 둘레 띠 ── */
    if (sd > 0) {
      const yUp = y(m + sd), yDn = y(m - sd);
      g.fillStyle = this.#css('--key-dim', 'rgba(41,98,255,.14)');
      g.fillRect(PAD.left, Math.min(yUp, yDn), this.w - PAD.left - PAD.right, Math.abs(yDn - yUp));

      g.strokeStyle = this.#css('--tx-500', '#4e586a');
      g.setLineDash([4, 4]);
      g.lineWidth = 1;
      const ym = Math.round(y(m)) + 0.5;
      g.beginPath(); g.moveTo(PAD.left, ym); g.lineTo(this.w - PAD.right, ym); g.stroke();
      g.setLineDash([]);
    }

    this.#dates(g, x0, step, cText);

    /* ── 줄 ── */
    g.strokeStyle = this.#css('--key-300', '#6b9bff');
    g.lineWidth = 1.8;
    g.lineJoin = 'round';
    g.beginPath();
    let pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      const xx = x0 + i * step, yy = y(v);
      if (pen) g.lineTo(xx, yy); else { g.moveTo(xx, yy); pen = true; }
    });
    g.stroke();

    /* ── 지금 몇 시그마인가 ──
       숫자 하나로 "얼마나 드문 자리인가" 를 말해 준다. */
    const last = [...vals].reverse().find((v) => v != null);
    if (last != null && sd > 0) {
      const z = (last - m) / sd;
      const label = `${last < 1 ? last.toFixed(3) : last.toFixed(2)}  ${z > 0 ? '+' : ''}${z.toFixed(1)}σ`;
      const yy = Math.round(y(last));
      g.font = '600 11px "IBM Plex Mono", monospace';
      g.fillStyle = Math.abs(z) > 2
        ? this.#css('--warn', '#e8a33d')
        : this.#css('--key-300', '#6b9bff');
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(label, this.w - PAD.right + 8, yy);
    }

    /* ── 십자선 ── */
    if (this.hover >= 0 && this.shown[this.hover]) {
      const x = Math.round(x0 + this.hover * step) + 0.5;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.26)';
      g.setLineDash([3, 4]);
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, PAD.top); g.lineTo(x, bot); g.stroke();
      g.restore();
    }
  }

  #candles(g, s, x0, step, bw, cUp, cDown) {
    for (let i = 0; i < this.shown.length; i++) {
      const b = this.shown[i];
      const prev = this.shown[i - 1];
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
    const first = this.shown[0].c;
    const last = this.shown[this.shown.length - 1].c;
    const col = last >= first ? cUp : cDown;

    g.beginPath();
    this.shown.forEach((b, i) => {
      const x = x0 + i * step, y = s.y(b.c);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });

    // 아래를 옅게 채운다
    const fill = g.createLinearGradient(0, s.top, 0, s.bot);
    fill.addColorStop(0, this.#alpha(col, 0.26));
    fill.addColorStop(1, this.#alpha(col, 0));
    g.save();
    g.lineTo(x0 + (this.shown.length - 1) * step, s.bot);
    g.lineTo(x0, s.bot);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.restore();

    g.beginPath();
    this.shown.forEach((b, i) => {
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
    const faint = css('--line-soft', 'rgba(26,24,23,.08)');
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

/* ═══════════════════ 날짜로 짝짓기 ═══════════════════

   기준 봉의 날짜마다 견줄 쪽의 그날 종가를 찾아 늘어놓는다. 없으면
   null 이다. 개수만 맞춰 붙이면 하루씩 밀린 그림이 나오는데, 그것은
   틀린 그림보다 나쁘다 — 틀린 줄은 알아보지만 하루 밀린 줄은
   알아보지 못하기 때문이다.

   30분봉은 날짜가 아니라 시각까지 맞춰야 하므로 시분까지 열쇠로 쓴다. */
function alignTo(base, other) {
  if (!base?.length || !other?.length) return [];
  const intraday = base.length > 1 && base[1].t - base[0].t < 20 * 3600e3;
  const key = (t) => (intraday
    ? new Date(t).toISOString().slice(0, 16)
    : new Date(t).toISOString().slice(0, 10));

  const map = new Map();
  for (const b of other) map.set(key(b.t), b.c);
  return base.map((b) => map.get(key(b.t)) ?? null);
}
