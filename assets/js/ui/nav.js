/* ═══════════════════════════════════════════════════════════════
   nav.js — 화면을 갈아 끼우는 자리

   예전에는 소식과 시장이 한 쪽에 세로로 쌓여 있었다. 거기에 차트와
   일지와 시험까지 얹으면 아래로 끝없이 길어져, 무엇이 어디 있는지
   알 수 없게 된다. 그래서 메뉴로 갈랐다.

   ── 지킨 것 ──
   · 어느 화면에 있든 자키람은 곁에 그대로 있다. 그가 이 사이트다.
   · 고른 화면은 주소(#news, #chart …)에 남는다. 새로 고쳐도 그
     자리로 돌아오고, 뒤로 가기가 화면 사이를 오간다.
   · 화면이 바뀔 때 그 화면에게 알린다 (onShow). 숨어 있는 동안에는
     캔버스가 제 크기를 잴 수 없어, 보일 때 다시 그려야 한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { emit } from '../core/bus.js';
import * as store from '../core/store.js';

export const VIEWS = [
  { id: 'news', gr: 'Ἀγγελίαι', ko: '소식', ico: 'bolt' },
  { id: 'market', gr: 'Ἀγορά', ko: '시장', ico: 'chart' },
  { id: 'chart', gr: 'Γραφή', ko: '차트', ico: 'chart' },
  { id: 'journal', gr: 'Ἡμερολόγιον', ko: '일지', ico: 'book' },
  { id: 'backtest', gr: 'Δοκιμή', ko: '시험', ico: 'flask' },
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
    const first = fromHash() || store.get('view') || 'news';
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

      const dot = el('span.nav__dot', { hidden: true });
      this.dots.set(v.id, dot);

      this.host.appendChild(el('button.nav__item', {
        type: 'button',
        role: 'tab',
        id: 'nav-' + v.id,
        data: { view: v.id },
        onclick: () => this.show(v.id),
      }, [
        el('span.nav__gr', { text: v.gr }),
        el('span.nav__ko', { text: v.ko }),
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
      const on = b.dataset.view === id;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }

    this.mark(id, false);

    if (!opts.fromHash) {
      // 주소를 바꾸되 뒤로 가기 더미를 쌓지 않는다 (처음 켤 때)
      if (opts.quiet) history.replaceState(null, '', '#' + id);
      else history.pushState(null, '', '#' + id);
    }

    // 숨어 있던 화면은 제 크기를 몰랐다. 이제 알렸으니 다시 그리게 한다.
    requestAnimationFrame(() => {
      this.hooks.onShow?.(id);
      emit('view:shown', { view: id });
    });

    if (!opts.quiet) window.scrollTo({ top: 0, behavior: 'smooth' });
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
