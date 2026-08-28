/* ═══════════════════════════════════════════════════════════════
   ambience.js — 바탕

   ── 무엇을 버렸나 ──
   전에는 이 파일이 종이 위에 소용돌이를 그렸다. 그때는 그림이 주인공
   이었으니 그래도 됐다. 지금 주인공은 숫자다. 그림이 눈에 띄면 그만큼
   숫자를 못 읽는다.

   ── 그래도 왜 남겼나 ──
   도구는 도구인데, 아무 도구나 되고 싶지는 않다. 이토 준지의 그림을
   아주 옅게 깔아 둔다. 무엇인지 알아보기 직전에서 멈추는 짙기다 —
   알아보게 되면 그때부터 그것만 보이므로.

   세 겹이다.
     1. 필름   ink 폴더의 영상 하나가 아주 느리게 돈다. 흐리고 어둡다.
               한참에 한 번씩 다른 것으로 갈린다.
     2. 격자   시세 화면의 눈금. 아주 천천히 흐른다. 필름이 무엇이든
               이 격자가 위에 있으면 화면은 도구로 읽힌다.
     3. 티끌   느리게 떠다니는 점 몇. 화면이 죽어 있지 않게.

   ── 왜 캔버스에 격자를 그리나 ──
   CSS 로 그으면 고정된 그림이다. 캔버스면 흐르게 할 수 있고, 무엇보다
   필름이 밝은 쪽으로 갈 때 격자를 같이 눌러 줄 수 있다. 배경이 밝아지는
   순간에 격자만 남아 도드라지면 그때 사람 눈이 배경으로 간다.
   ═══════════════════════════════════════════════════════════════ */

import { calmly, throttle } from '../core/dom.js';

/* ink 폴더에 있는 것들. calm 은 잔잔하고 wild 는 격하다.

   ── 전에는 잔잔한 쪽만 바탕에 썼다 ──
   그때는 필름을 26px 로 흐려 형체를 지웠으므로, 격한 그림을 쓰면
   얼룩만 커졌다. 지금은 종이를 오려 내어 형체만 남기므로 사정이
   다르다 — 표정이 보이는 편이 낫고, 표정이 보이려면 스물넷을 다
   써야 한다. 잔잔한 것과 격한 것이 번갈아 오면 그것이 표정 변화다. */
const CALM = Array.from({ length: 12 }, (_, i) => `calm-${String(i + 1).padStart(2, '0')}`);
const WILD = Array.from({ length: 12 }, (_, i) => `wild-${String(i + 1).padStart(2, '0')}`);

const MEDIA = 'assets/media/ink/';
const clip = (id) => `${MEDIA}${id}.mp4`;
const poster = (id) => `${MEDIA}poster/${id}.jpg`;

const ALL = [...CALM, ...WILD];

/* 무작위로 고르면 같은 것이 잇달아 나오는 일이 잦다. 스물넷을 섞어
   한 바퀴 다 돌린 뒤에 다시 섞는다 — 그래야 '같은 표정만 나온다' 는
   느낌이 없다. */
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 한 바퀴를 다 돌고 다시 섞는 차례표 */
function deck(arr) {
  let rest = shuffled(arr);
  return () => {
    if (!rest.length) rest = shuffled(arr);
    return rest.pop();
  };
}

/* 한 조각을 얼마나 오래 두는가. 짧으면 갈리는 것이 보이고, 보이면
   그때부터 사람이 배경을 본다. 40초쯤이면 알아채지 못한다. */
const SWAP_MS = 42_000;

/* ═══════════════════ 필름 + 격자 ═══════════════════ */

export class Veil {
  /**
   * @param {{films:HTMLVideoElement[], grid:HTMLCanvasElement}} nodes
   */
  constructor({ films, grid }) {
    this.films = (films || []).filter(Boolean);
    this.film = this.films[0] || null;      // 지금 보이는 쪽
    this.at = 0;
    this.next = deck(ALL);
    this.cv = grid;
    this.g = grid?.getContext('2d', { alpha: true }) || null;

    this.t = 0;
    this.raf = 0;
    this.on = false;
    this.motes = [];
    this.swap = 0;

    this.fit = throttle(() => this.#fit(), 180);
    window.addEventListener('resize', this.fit);
    this.#fit();
  }

  #fit() {
    if (!this.cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth || this.cv.clientWidth || 1280;
    const h = window.innerHeight || this.cv.clientHeight || 800;
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.g?.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 티끌은 넓이에 비례해서 — 큰 화면에 열 개면 허전하다
    const want = Math.min(60, Math.round((w * h) / 42_000));
    this.motes = Array.from({ length: want }, () => this.#mote());
  }

  #mote() {
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      r: 0.6 + Math.random() * 1.5,
      v: 0.06 + Math.random() * 0.22,
      a: 0.04 + Math.random() * 0.09,
      p: Math.random() * Math.PI * 2,
    };
  }

  /* ── 필름 ──

     ── 왜 둘을 번갈아 쓰나 ──
     하나뿐일 때는 저물었다가 다시 밝아졌다. 그 사이 900ms 동안 배경이
     통째로 비었고, 그것이 '표정이 바뀌었다' 가 아니라 '무언가 꺼졌다'
     로 읽혔다. 둘을 겹쳐 두고 한쪽을 올리면서 다른 쪽을 내리면 빈 틈이
     없다. 사람의 표정이 바뀌는 것도 그렇게 바뀐다. */

  /** 다음 표정을 건다. 앞의 것과 겹쳐 넘어간다. */
  async play(id = this.next()) {
    if (!this.films.length) return;

    // 쓸 쪽은 지금 안 보이는 쪽
    const to = this.films[(this.at + 1) % this.films.length];
    const from = this.films[this.at];
    if (this.films.length > 1) this.at = (this.at + 1) % this.films.length;
    this.film = to;

    to.poster = poster(id);
    to.src = clip(id);
    to.load();
    try { await to.play(); } catch { /* 자동 재생을 막는 브라우저 — 포스터만 남는다 */ }

    /* 다음 그림 프레임이 아니라 시간으로 켠다. 창이 뒤에 있거나
       최소화되어 있으면 그림 프레임이 오지 않는데, 그러면 필름이
       영영 어두운 채로 남는다. setTimeout 은 창이 안 보여도 돈다. */
    setTimeout(() => {
      to.classList.add('is-lit');
      if (from && from !== to) from.classList.remove('is-lit');
    }, 0);

    // 다 저문 쪽은 내려 둔다 — 안 보이는 영상을 계속 돌릴 까닭이 없다
    if (from && from !== to) {
      setTimeout(() => { if (!from.classList.contains('is-lit')) from.pause(); }, 2600);
    }
  }

  #scheduleSwap() {
    clearTimeout(this.swap);
    this.swap = setTimeout(() => {
      if (this.on && !document.hidden) this.play();
      this.#scheduleSwap();
    }, SWAP_MS + Math.random() * 12_000);
  }

  /* ── 켜고 끄기 ── */

  start() {
    if (this.on) return;
    this.on = true;
    this.play();
    this.#scheduleSwap();
    if (!calmly()) this.#loop();
    else this.#draw();      // 움직임을 싫어하는 사람에게는 한 장만
  }

  pause() {
    this.on = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.swap);
    for (const v of this.films) { v.pause(); v.classList.remove('is-lit'); }
  }

  #loop = () => {
    if (!this.on) return;
    this.t += 1;
    this.#draw();
    this.raf = requestAnimationFrame(this.#loop);
  };

  /* ── 격자 ──
     세로줄은 시간, 가로줄은 값. 둘 다 아주 느리게 흘러간다.
     흐르는 쪽을 세로로만 두면 시세가 흐르는 것처럼 보인다. */

  #draw() {
    const g = this.g;
    if (!g) return;
    const { w, h, t } = this;
    if (!w || !h) return;

    g.clearRect(0, 0, w, h);

    const step = 74;
    const drift = (t * 0.09) % step;

    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,.028)';
    g.beginPath();
    for (let x = -drift; x < w + step; x += step) {
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = 0; y < h + step; y += step) {
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(w, Math.round(y) + 0.5);
    }
    g.stroke();

    // 굵은 줄 하나씩 — 격자에 결이 생겨 눈이 덜 지친다
    g.strokeStyle = 'rgba(255,255,255,.045)';
    g.beginPath();
    for (let x = -drift; x < w + step * 4; x += step * 4) {
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, h);
    }
    g.stroke();

    // 티끌
    for (const m of this.motes) {
      m.y -= m.v;
      m.x += Math.sin((t + m.p * 60) * 0.004) * 0.18;
      if (m.y < -4) { m.y = h + 4; m.x = Math.random() * w; }
      g.globalAlpha = m.a * (0.6 + 0.4 * Math.sin(t * 0.01 + m.p));
      g.fillStyle = '#9fb4d8';
      g.beginPath();
      g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

/* ═══════════════════ 관문의 그림 ═══════════════════

   여기서는 격한 쪽(wild)을 쓴다. 관문은 한 번만 보는 화면이고, 한 번
   보는 화면은 세게 때려도 된다. 들어오고 나면 이 그림은 다시 없다. */

export function gateFilm(videos) {
  const films = [].concat(videos).filter(Boolean);
  if (!films.length) return () => {};

  const next = deck(WILD);
  let at = -1;

  const show = () => {
    const id = next();
    const to = films[(at + 1) % films.length];
    const from = at >= 0 ? films[at] : null;
    at = (at + 1) % films.length;

    to.poster = poster(id);
    to.src = clip(id);
    to.load();
    to.play().catch(() => { /* 포스터만 남아도 된다 */ });

    setTimeout(() => {
      /* ── 첫 장은 전이 없이 켠다 ──
         숨어 있는 문서에서는 전이가 나아가지 않는다. 뒤쪽 탭으로 열어
         두었다가 나중에 보면, 그 사이 시작된 전이가 0에 멈춰 있어
         관문이 텅 빈 채로 뜬다. 첫 장만은 곧바로 켜서 그 자리를 막는다.
         두 번째부터는 사람이 보고 있는 중이므로 전이가 돈다. */
      if (from) {
        to.classList.add('is-lit');
        from.classList.remove('is-lit');
      } else {
        to.classList.add('is-instant', 'is-lit');
        setTimeout(() => to.classList.remove('is-instant'), 60);
      }
    }, 0);
  };

  show();

  /* ── 왜 여기서는 자주 바꾸나 ──
     바탕은 40초에 한 번 갈린다. 알아채면 안 되기 때문이다.
     관문은 반대다. 알아채라고 두는 자리이고, 넉 자를 넣는 동안만
     머무르므로 그 사이에 두어 번은 바뀌어야 '표정이 변한다' 가 된다. */
  const timer = setInterval(() => {
    if (!document.hidden) show();
  }, 5200);

  return () => clearInterval(timer);
}
