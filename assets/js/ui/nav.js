/* ═══════════════════════════════════════════════════════════════
   nav.js — 화면을 갈아 끼우는 자리

   여섯 화면이 가운데 칸 하나를 나누어 쓴다. 왼쪽의 좁은 띠가 그것을
   갈아 끼운다.

   ── 왜 왼쪽에 좁게 두나 ──
   화면을 갈아 끼우는 일은 자주 하는 일이 아니다. 자주 하는 일(종목
   고르기·기간 바꾸기)은 머리띠에, 늘 보아야 하는 것(관심종목)은
   오른쪽에 두었다. 자리는 쓰는 횟수에 비례해 준다.

   ── 지킨 것 ──
   · 고른 화면은 주소(#chart, #news …)에 남는다. 새로 고쳐도 그
     자리로 돌아오고, 뒤로 가기가 화면 사이를 오간다.
   · 화면이 바뀔 때 그 화면에게 알린다 (onShow). 숨어 있는 동안에는
     캔버스가 제 크기를 잴 수 없어, 보일 때 다시 그려야 한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';

export const VIEWS = [
  { id: 'chart',    gr: 'Γραφή',        ko: '차트', ico: 'candle' },
  { id: 'market',   gr: 'Ἀγορά',        ko: '시세', ico: 'grid' },
  { id: 'analysis', gr: 'Ἀνάλυσις',     ko: '분석', ico: 'sigma' },
  { id: 'news',     gr: 'Ἀγγελίαι',     ko: '소식', ico: 'bolt' },
  { id: 'journal',  gr: 'Ἡμερολόγιον',  ko: '일지', ico: 'book' },
  { id: 'backtest', gr: 'Δοκιμή',       ko: '시험', ico: 'flask' },
];

export const viewById = (id) => VIEWS.find((v) => v.id === id) || VIEWS[0];

export class Nav {
  /** @param {{onShow:(id)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#nav');
    this.panes = new Map();
    this.dots = new Map();

    for (const v of VIEWS) {
      const pane = document.querySelector('[data-view="' + v.id + '"]');
      if (pane) this.panes.set(v.id, pane);
    }

    this.#build();

    // 주소에 적힌 자리로 간다. 없으면 지난번에 보던 자리.
    const first = fromHash() || store.get('view') || 'chart';
    this.show(first, { quiet: true });

    window.addEventListener('hashchange', () => {
      const id = fromHash();
      if (id && id !== this.current) this.show(id, { fromHash: true });
    });
  }

  #build() {
    clear(this.host);
    for (const v of VIEWS) {
      if (!this.panes.has(v.id)) continue;

      const dot = el('span.rail__dot', { hidden: true });
      this.dots.set(v.id, dot);

      this.host.appendChild(el('button.rail__item', {
        type: 'button',
        role: 'tab',
        id: 'nav-' + v.id,
        title: v.gr + ' · ' + v.ko,
        data: { goto: v.id },   /* 판의 data-view 와 겹치지 않게 */
        onclick: () => this.show(v.id),
      }, [
        el('span.ico', { data: { ico: v.ico } }),
        el('span.rail__ko', { text: v.ko }),
        dot,
      ]));
    }
  }

  /**
   * 화면을 바꾼다.
   * @param {string} id
   * @param {{quiet?:boolean, fromHash?:boolean}} opts
   */
  show(id, opts = {}) {
    if (!this.panes.has(id)) id = VIEWS[0].id;
    if (id === this.current) return;

    this.current = id;
    store.set('view', id);

    for (const [key, pane] of this.panes) {
      pane.hidden = key !== id;
    }
    for (const b of this.host.children) {
      const on = b.dataset.goto === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }

    this.mark(id, false);

    if (!opts.fromHash) {
      // 주소를 바꾸되 뒤로 가기 더미를 쌓지 않는다 (처음 켤 때)
      if (opts.quiet) history.replaceState(null, '', '#' + id);
      else history.pushState(null, '', '#' + id);
    }

    /* 숨어 있던 화면은 제 크기를 몰랐다. 이제 알렸으니 다시 그리게 한다.

       예전에는 이 알림을 다음 그림 프레임에 미뤘다. 그런데 창이 뒤에
       있거나 최소화되어 있으면 그림 프레임이 오지 않는다 — 그 사이에
       화면을 갈아 끼우면 알림이 영영 가지 않고, 돌아왔을 때 빈 화면이
       남는다. 숨김을 걷는 일은 이미 끝났으니 지금 알려도 된다. */
    this.hooks.onShow?.(id);
    emit('view:shown', { view: id });

    // 구르는 것은 창이 아니라 가운데 칸이다
    if (!opts.quiet) document.querySelector('#main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** 무언가 새로 온 자리에 점을 찍는다 */
  mark(id, on = true) {
    if (id === this.current && on) return;      // 보고 있는 자리에는 안 찍는다
    const dot = this.dots.get(id);
    if (dot) dot.hidden = !on;
  }
}

function fromHash() {
  const h = location.hash.replace('#', '').trim();
  return VIEWS.some((v) => v.id === h) ? h : null;
}
