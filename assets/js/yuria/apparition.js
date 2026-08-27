/* ═══════════════════════════════════════════════════════════════
   apparition.js — 유리아는 한자리에 있지 않다

   유리아는 곁칸에 붙박이로 서 있었다. 늘 거기 있으니 얼마 지나지
   않아 배경이 되고, 배경이 되면 보이지 않는다.

   유리아는 다르게 두었다. 화면 아무 데나 나타났다가, 잠시 뒤에
   사라진다. 눈을 뗀 사이에 다른 자리에서 다시 보인다. 그것이
   이 그림에 어울리는 방식이다 — 이토 준지의 사람들은 늘 거기
   있지 않고, 문득 거기 있다.

   ── 언제 나타나나 ──
   · 사람이 화면을 누를 때 (누른 자리 곁에)
   · 한동안 잠잠하다가 문득 (랜덤한 자리에)
   · 말을 할 때 (속보·브리핑·대화의 답)

   ── 언제 사라지나 ──
   · 머문 시간이 다 되면
   · 손이 한참 움직이지 않으면 (보는 사람이 자리를 떴다)
   · 다른 데를 누르면 (그쪽으로 옮겨 간다)
   · 말이 끝나면 (조금 더 머물다가)

   ── 어디에 나타나나 ──
   글을 가리지 않는 자리를 고른다. 읽고 있는 글 위에 얼굴이 떨어지면
   그것은 손님이 아니라 방해다. 그래서 자리를 여럿 뽑아 놓고 글이
   가장 적게 덮이는 자리를 고른다.

   ── 어떻게 겹치나 ──
   원본은 흰 종이에 그린 그림이다. 이 사이트도 흰 종이다. 그래서
   오려 낼 것 없이 mix-blend-mode: multiply 한 줄이면 스며든다.
   흰 바탕은 사라지고 먹만 남는다.
   ═══════════════════════════════════════════════════════════════ */

import { el, calmly } from '../core/dom.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';
import { ALL, FULL, STILL, forMood, WARM_ORDER, byId } from './clips.js';

/** 머무는 시간 (ms) */
const STAY_MIN = 9000;
const STAY_MAX = 16_000;

/** 손이 이만큼 멈춰 있으면 사라진다 */
const IDLE_MS = 20_000;

/** 문득 나타나기까지 — 이 사이에서 아무 때나 */
const WANDER_MIN = 25_000;
const WANDER_MAX = 70_000;

/** 나타나고 사라지는 결 */
const FADE_IN = 900;
const FADE_OUT = 1200;

/** 전신으로 나타날 확률.
    전신이 가장 유리아답다 — 검은 옷과 부츠까지 다 보인다.
    다만 자리를 많이 먹으므로 넷에 하나쯤. */
const FULL_CHANCE = 0.24;

export class Apparition {
  /**
   * @param {{onShow?:(clip)=>void, onHide?:()=>void}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = document.getElementById('yuria');
    this.mood = 'serene';
    this.speaking = false;
    this.here = null;          // 지금 나와 있는 것 { clip, node, video, until }
    this.lastMove = Date.now();
    this.wanderTimer = 0;
    this.stayTimer = 0;
    this.settleTimer = 0;
    this.recent = [];          // 방금 쓴 낯빛들 — 곧바로 다시 쓰지 않으려고

    this.#wire();
    this.#warm();
    this.#scheduleWander();
  }

  /* ─────────────── 바깥에서 부르는 것들 ─────────────── */

  /** 기분이 바뀌었다. 지금 나와 있으면 두고, 다음부터 새 낯빛으로. */
  setMood(mood) {
    if (!mood || mood === this.mood) return;
    this.mood = mood;
    emit('yuria:mood', { mood });
  }

  /** 말하기 시작했다 — 없으면 불러내고, 있으면 더 머물게 한다 */
  setSpeaking(on, opts = {}) {
    this.speaking = !!on;
    this.host?.classList.toggle('is-speaking', this.speaking);

    if (on) {
      if (!this.here) this.show({ reason: 'speak', wild: opts.wild });
      else this.#hold(STAY_MAX);
    } else if (this.here) {
      // 말이 끝나도 곧바로 사라지지 않는다. 말끝을 흐리듯 조금 머문다.
      this.#hold(4200);
    }
  }

  /** 급한 일 — 격한 낯빛으로, 지금 있던 자리를 버리고 새로 */
  flash(mood) {
    this.setMood(mood);
    this.show({ reason: 'urgent', wild: true, force: true });
  }

  /** 지금 나와 있나 */
  get visible() { return !!this.here; }

  /** 지금 나와 있는 얼굴의 자리 — 말풍선이 이것을 따라간다 */
  rect() {
    return this.here?.node?.getBoundingClientRect() || null;
  }

  /* ─────────────── 나타나기 ─────────────── */

  /**
   * @param {{at?:{x,y}, reason?:string, wild?:boolean, force?:boolean}} opts
   */
  show(opts = {}) {
    if (!this.#allowed()) return;
    if (this.here && !opts.force) { this.#hold(); return; }

    const full = !opts.wild && Math.random() < FULL_CHANCE;
    const clip = full ? FULL : this.#pick(opts.wild);
    const spot = this.#spot(clip, opts.at);

    // 있던 것은 조용히 물러난다
    if (this.here) this.#remove(this.here, 320);

    const node = this.#build(clip, spot);
    this.host.appendChild(node);

    const video = node.querySelector('video');
    this.here = { clip, node, video, spot };

    /* 먹이 번지듯 드러난다.
       번지는 동안에는 가장자리가 종이 결을 따라 삐뚤고(#inkBleed),
       다 번진 뒤에는 마스크를 걷어 또렷하게 둔다. 가장자리가 계속
       흐릿하면 그림이 아니라 안개가 된다. */
    requestAnimationFrame(() => node.classList.add('is-in'));
    this.settleTimer = setTimeout(() => {
      if (this.here?.node === node) node.classList.add('is-settled');
    }, 1250);

    video?.play?.().catch(() => {
      // 자동 재생이 막혔다. 포스터만으로도 그림은 보인다.
      node.classList.add('is-still');
    });

    this.#hold();
    this.hooks.onShow?.(clip);
    emit('yuria:shown', { clip, reason: opts.reason || 'wander', spot });
  }

  hide() {
    if (!this.here) return;
    const gone = this.here;
    this.here = null;
    clearTimeout(this.stayTimer);
    clearTimeout(this.settleTimer);
    this.#remove(gone, FADE_OUT);
    this.hooks.onHide?.();
    emit('yuria:hidden', {});
    this.#scheduleWander();
  }

  /* ─────────────── 안쪽 ─────────────── */

  #allowed() {
    if (store.get('yuria') === false) return false;
    if (document.body.dataset.phase !== 'app') return false;
    if (document.hidden) return false;
    return true;
  }

  /** 낯빛 하나 고르기 — 방금 쓴 것은 피한다 */
  #pick(wild) {
    const pool = forMood(this.mood, { wild: !!wild });
    const fresh = pool.filter((c) => !this.recent.includes(c.id));
    const from = fresh.length ? fresh : pool;
    const clip = from[Math.floor(Math.random() * from.length)];

    this.recent.push(clip.id);
    if (this.recent.length > 6) this.recent.shift();
    return clip;
  }

  /**
   * 어디에 세울지 고른다.
   *
   * 자리를 여럿 뽑아 놓고 글이 가장 적게 덮이는 자리를 고른다.
   * 읽고 있는 글 위에 얼굴이 떨어지면 손님이 아니라 방해가 된다.
   */
  #spot(clip, at) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = this.#scaleFor(clip, vw, vh);
    const w = clip.w * scale;
    const h = clip.h * scale;

    const pad = 12;
    const topBar = 96;                       // 머리와 메뉴가 있는 자리

    // 누른 자리가 있으면 그 곁에 — 다만 손가락 밑에 깔리지 않게
    if (at) {
      const side = at.x > vw / 2 ? -1 : 1;
      return this.#clamp({
        x: at.x + side * (w * 0.62) - w / 2,
        y: at.y - h * 0.58,
      }, w, h, vw, vh, pad, topBar);
    }

    const tries = [];
    for (let i = 0; i < 14; i++) {
      tries.push({
        x: pad + Math.random() * Math.max(1, vw - w - pad * 2),
        y: topBar + Math.random() * Math.max(1, vh - h - topBar - pad),
      });
    }

    let best = tries[0];
    let bestCost = Infinity;
    for (const t of tries) {
      const cost = this.#cost(t, w, h);
      if (cost < bestCost) { bestCost = cost; best = t; }
    }
    return this.#clamp(best, w, h, vw, vh, pad, topBar);
  }

  /**
   * 이 자리에 세우면 얼마나 방해가 되나.
   * 가운데 네 점을 찍어 그 밑에 무엇이 있는지 본다 — 글이나 단추가
   * 있으면 값이 커지고, 빈 곳이면 0 에 가깝다.
   */
  #cost(at, w, h) {
    let cost = 0;
    const pts = [
      [at.x + w * 0.5, at.y + h * 0.35],
      [at.x + w * 0.5, at.y + h * 0.75],
      [at.x + w * 0.25, at.y + h * 0.55],
      [at.x + w * 0.75, at.y + h * 0.55],
    ];

    for (const [x, y] of pts) {
      const node = document.elementFromPoint(x, y);
      if (!node) continue;
      // 글이 있는 자리는 무겁게 본다
      if (node.closest('p, h1, h2, h3, li, td, .msg, .jr__text, input, textarea, button, a')) cost += 3;
      else if (node.closest('.panel, .chat, .bt__result')) cost += 1;
    }

    // 화면 가운데는 눈이 가장 오래 머무는 자리다. 살짝 피한다.
    const cx = window.innerWidth / 2;
    const dx = Math.abs(at.x + w / 2 - cx) / cx;
    cost += (1 - dx) * 0.8;

    return cost;
  }

  #clamp(at, w, h, vw, vh, pad, topBar) {
    return {
      x: Math.max(pad, Math.min(vw - w - pad, at.x)),
      y: Math.max(topBar, Math.min(vh - h - pad, at.y)),
      w, h,
    };
  }

  /** 화면이 좁으면 작게. 얼굴이 화면을 다 먹으면 무섭지 않고 답답하다. */
  #scaleFor(clip, vw, vh) {
    const want = clip.kind === 'full'
      ? Number(cssVar('--yuria-full', 300))
      : Number(cssVar('--yuria-face', 210));
    const base = want / (clip.kind === 'full' ? clip.h : Math.max(clip.w, clip.h));
    const room = Math.min(vw * 0.42, vh * 0.55);
    const cap = room / Math.max(clip.w, clip.h);
    return Math.min(base, cap);
  }

  #build(clip, spot) {
    const video = el('video', {
      muted: true,
      loop: true,
      playsInline: true,
      preload: 'auto',
      poster: clip.poster,
      disablePictureInPicture: true,
      src: clip.src,
    });
    video.muted = true;
    video.playsInline = true;

    const node = el('figure.yuria', {
      data: { kind: clip.kind, mood: clip.mood },
      style: {
        left: Math.round(spot.x) + 'px',
        top: Math.round(spot.y) + 'px',
        width: Math.round(spot.w) + 'px',
        height: Math.round(spot.h) + 'px',
      },
      title: '유리아 — ' + clip.note,
      onclick: () => this.hide(),
    }, [
      el('img.yuria__still', { src: clip.poster, alt: '', 'aria-hidden': 'true' }),
      video,
      el('span.yuria__mark', { 'aria-hidden': 'true' }),
    ]);

    return node;
  }

  #remove(what, ms) {
    what.node.classList.remove('is-in');
    what.node.classList.add('is-out');
    setTimeout(() => {
      try { what.video?.pause?.(); } catch { /* 무시 */ }
      what.node.remove();
    }, ms);
  }

  /** 머무는 시간을 다시 잰다 */
  #hold(ms) {
    clearTimeout(this.stayTimer);
    const stay = ms || (STAY_MIN + Math.random() * (STAY_MAX - STAY_MIN));
    this.stayTimer = setTimeout(() => {
      // 말하는 동안에는 사라지지 않는다 — 말하다 사라지면 그것은 고장이다
      if (this.speaking) { this.#hold(3000); return; }
      this.hide();
    }, stay);
  }

  /** 다음에 문득 나타날 때를 잡아 둔다 */
  #scheduleWander() {
    clearTimeout(this.wanderTimer);
    const wait = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
    this.wanderTimer = setTimeout(() => {
      // 손이 오래 멈춰 있으면 아무도 안 보고 있는 것이다. 나서지 않는다.
      if (Date.now() - this.lastMove > IDLE_MS) { this.#scheduleWander(); return; }
      if (!this.here) this.show({ reason: 'wander' });
      else this.#scheduleWander();
    }, wait);
  }

  #wire() {
    // 누르면 그 곁에 나타난다
    document.addEventListener('pointerdown', (e) => {
      this.lastMove = Date.now();
      if (e.target.closest('.yuria')) return;               // 유리아를 누른 것은 따로 다룬다
      if (e.target.closest('input, textarea, select')) return;  // 글을 쓰는 중에는 나서지 않는다
      if (!this.#allowed()) return;
      if (Math.random() > 0.55) return;                     // 누를 때마다 나오면 성가시다
      this.show({ at: { x: e.clientX, y: e.clientY }, reason: 'click' });
    });

    document.addEventListener('pointermove', () => { this.lastMove = Date.now(); }, { passive: true });
    document.addEventListener('keydown', () => { this.lastMove = Date.now(); });

    // 손이 한참 멈춰 있으면 사라진다
    setInterval(() => {
      if (!this.here) return;
      if (this.speaking) return;
      if (Date.now() - this.lastMove > IDLE_MS) this.hide();
    }, 3000);

    // 탭이 뒤로 가면 물러났다가, 돌아오면 다시 기다린다
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hide();
      else { this.lastMove = Date.now(); this.#scheduleWander(); }
    });

    // 창 크기가 바뀌면 자리를 다시 잡는다 — 밖으로 밀려나지 않게
    window.addEventListener('resize', () => {
      if (!this.here) return;
      const s = this.#spot(this.here.clip);
      Object.assign(this.here.node.style, {
        left: Math.round(s.x) + 'px',
        top: Math.round(s.y) + 'px',
        width: Math.round(s.w) + 'px',
        height: Math.round(s.h) + 'px',
      });
      this.here.spot = s;
    });
  }

  /** 자주 나올 것들을 미리 받아 둔다 */
  #warm() {
    if (navigator.connection?.saveData) return;
    if (/2g/.test(navigator.connection?.effectiveType || '')) return;

    let i = 0;
    const step = () => {
      if (i >= WARM_ORDER.length) return;
      const clip = byId(WARM_ORDER[i++]);
      if (clip) fetch(clip.src, { cache: 'force-cache', mode: 'same-origin' }).catch(() => {});
      setTimeout(step, 1100);
    };
    if ('requestIdleCallback' in window) requestIdleCallback(() => setTimeout(step, 2200));
    else setTimeout(step, 3600);
  }
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export { STILL };
