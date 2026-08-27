/* ═══════════════════════════════════════════════════════════════
   watch.js — 오른쪽에 늘 떠 있는 목록

   차트를 들여다보는 동안에도 다른 것이 움직이면 곁눈으로 알아채야
   한다. 그래서 이 칸은 화면을 갈아 끼워도 사라지지 않는다.

   ── 값이 바뀌면 한 번 번쩍인다 ──
   숫자만 조용히 갈리면 아무도 못 본다. 바뀐 줄에 0.7초짜리 빛을 한
   번 넣는다. 오르면 붉게, 내리면 푸르게. 그 이상은 하지 않는다 —
   깜빡이는 화면은 곧 보지 않게 되는 화면이다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { px, pct, dir, stamp } from '../core/fmt.js';
import { DEFAULT_WATCH, nameOf } from '../market/symbols.js';
import * as store from '../core/store.js';

export class WatchList {
  /** @param {{onPick:(sym)=>void, onChanged:()=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#watchList');
    this.stampEl = $('#sideStamp');
    this.rows = new Map();      // symbol → { node, px, ch, last }
    this.symbol = store.get('symbol');
  }

  /** 지금 지켜보는 것들 */
  get list() { return store.get('watch') || DEFAULT_WATCH; }

  /** 값이 왔다 */
  set(quotes, at) {
    this.quotes = quotes;
    if (at) this.stampEl.textContent = stamp(new Date(at));

    // 줄이 그대로면 값만 갈아 끼운다. 통째로 다시 그리면 번쩍임도
    // 스크롤 자리도 다 날아간다.
    const same = quotes.length === this.rows.size
      && quotes.every((q) => this.rows.has(q.symbol));

    if (!same) { this.#build(quotes); return; }
    for (const q of quotes) this.#update(q);
  }

  #build(quotes) {
    clear(this.host);
    this.rows.clear();

    for (const q of quotes) {
      const pxEl = el('span.wrow__px');
      const chEl = el('span.wrow__ch');

      const node = el('button.wrow', {
        type: 'button',
        class: [
          q.symbol === this.symbol ? 'is-on' : '',
          q.ok ? '' : 'is-stale',
        ].filter(Boolean).join(' '),
        title: q.ok ? `${q.symbol} — 눌러서 차트로` : (q.why || '시세를 받지 못했습니다'),
        onclick: (e) => {
          if (e.target.closest('.wrow__x')) return;
          this.hooks.onPick?.(q.symbol);
        },
      }, [
        el('span.wrow__id', [
          el('span.wrow__name', { text: q.ko || nameOf(q.symbol) }),
          el('span.wrow__sym', { text: q.symbol }),
        ]),
        el('span.wrow__num', [pxEl, chEl]),
        el('span.wrow__x', {
          role: 'button',
          title: '목록에서 빼기',
          onclick: (e) => { e.stopPropagation(); this.remove(q.symbol); },
        }, '×'),
      ]);

      this.host.appendChild(node);
      this.rows.set(q.symbol, { node, px: pxEl, ch: chEl, last: null });
      this.#update(q);
    }
  }

  #update(q) {
    const r = this.rows.get(q.symbol);
    if (!r) return;

    r.px.textContent = q.price != null ? px(q.price) : '—';
    r.ch.textContent = q.changePct != null ? pct(q.changePct) : '—';
    r.ch.className = 'wrow__ch ' + (q.changePct != null ? dir(q.changePct) : '');
    r.node.classList.toggle('is-stale', !q.ok);

    // 바뀐 줄에 한 번만 빛을 넣는다
    if (r.last != null && q.price != null && q.price !== r.last) {
      const up = q.price > r.last;
      r.node.classList.remove('is-tick-up', 'is-tick-down');
      void r.node.offsetWidth;                     // 다시 트기 위해
      r.node.classList.add(up ? 'is-tick-up' : 'is-tick-down');
    }
    r.last = q.price;
  }

  /* 지금 보고 있는 것의 값은 차트 쪽이 더 새것이다.

     목록은 묶음 부름(spark)으로 채우는데 거기서 오는 것은 마지막 종가다.
     차트는 하나만 따로 물으므로 장중 값이 온다. 그래서 같은 코스피가
     화면 두 곳에서 다른 숫자로 뜬다. 사람은 그것을 버그로 읽는다 —
     실제로도 버그다. 새것으로 맞춘다. */
  live(q) {
    if (!q || !this.rows.has(q.symbol)) return;
    const i = this.quotes?.findIndex((x) => x.symbol === q.symbol);
    if (i >= 0) {
      this.quotes[i] = { ...this.quotes[i], price: q.price, change: q.change, changePct: q.changePct };
      this.#update(this.quotes[i]);
    }
  }

  /** 지금 보고 있는 것을 짚어 준다 */
  mark(symbol) {
    this.symbol = symbol;
    for (const [sym, r] of this.rows) r.node.classList.toggle('is-on', sym === symbol);
  }

  /* ─────────────── 넣고 빼기 ─────────────── */

  add(symbol, meta = {}) {
    const list = [...this.list];
    if (list.some((w) => w.symbol === symbol)) return false;

    list.push({
      symbol,
      ko: meta.ko || nameOf(symbol),
      name: meta.name || meta.ko || symbol,
      kind: meta.kind || 'stock',
      tz: meta.tz || '',
    });
    store.set('watch', list);
    this.hooks.onChanged?.();
    return true;
  }

  remove(symbol) {
    const list = this.list.filter((w) => w.symbol !== symbol);
    // 하나도 안 남으면 다음에 켤 때 기본 목록이 되살아난다. 그편이
    // 텅 빈 칸을 보여 주는 것보다 낫다.
    store.set('watch', list.length ? list : null);
    this.hooks.onChanged?.();
  }

  reset() {
    store.set('watch', null);
    this.hooks.onChanged?.();
  }
}
