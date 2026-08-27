/* ═══════════════════════════════════════════════════════════════
   view.js — 소식 목록을 그린다
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { ago, stamp } from '../core/fmt.js';
import * as store from '../core/store.js';
import { CATEGORIES, URGENT_AT } from './sources.js';

const PAGE = 25;

export class NewsView {
  /**
   * @param {{onOpen:(item)=>void, onRefresh:()=>void, onTab:(cat)=>void}} hooks
   */
  constructor(hooks) {
    this.hooks = hooks;
    this.list = $('#feed');
    this.tabs = $('#newsTabs');
    this.stamp = $('#newsStamp');
    this.count = $('#newsCount');
    this.more = $('#btnMore');
    this.moreWrap = $('.feed__more');

    this.items = [];
    this.shown = PAGE;
    this.cat = store.get('tab') || 'all';

    this.#buildTabs();
    this.more.addEventListener('click', () => {
      this.shown += PAGE;
      this.render();
    });

    // 몇 분 전 표시를 살아 있게
    setInterval(() => this.#retime(), 30_000);
  }

  #buildTabs() {
    clear(this.tabs);
    for (const c of CATEGORIES) {
      const b = el('button.tab', {
        type: 'button',
        role: 'tab',
        class: c.id === this.cat ? 'is-on' : '',
        'aria-selected': c.id === this.cat ? 'true' : 'false',
        data: { cat: c.id },
        onclick: () => this.setTab(c.id),
      }, [
        el('span.tab__gr', { text: c.gr }),
        document.createTextNode(c.ko),
      ]);
      this.tabs.appendChild(b);
    }
  }

  setTab(cat) {
    if (cat === this.cat) return;
    this.cat = cat;
    store.set('tab', cat);
    for (const b of this.tabs.children) {
      const on = b.dataset.cat === cat;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    this.shown = PAGE;
    this.hooks.onTab?.(cat);
  }

  /* ─────────────── 상태 ─────────────── */

  loading() {
    clear(this.list);
    for (let i = 0; i < 7; i++) {
      this.list.appendChild(el('li.skel', [el('i'), el('div', [el('i'), el('i')])]));
    }
    this.moreWrap.hidden = true;
    this.count.textContent = '';
  }

  failed(err) {
    clear(this.list);
    const why = err?.errors?.length
      ? `${err.errors.length}곳이 응답하지 않습니다`
      : (err?.message || '알 수 없는 까닭');
    this.list.appendChild(el('li.feed__state', [
      el('p', { text: '소식을 가져오지 못했습니다.' }),
      el('code', { text: why }),
      el('button.btn.btn--gold', {
        type: 'button',
        onclick: () => this.hooks.onRefresh?.(),
      }, [ico('refresh'), el('span.btn__label', { text: '다시' })]),
    ]));
    this.moreWrap.hidden = true;
  }

  /* ─────────────── 목록 ─────────────── */

  set(items, at) {
    this.items = items || [];
    this.at = at;
    this.shown = PAGE;
    this.render();
    if (at) this.stamp.textContent = `${stamp(new Date(at))} 기준`;
  }

  render() {
    const list = this.items;
    clear(this.list);

    if (!list.length) {
      this.list.appendChild(el('li.feed__state', [
        el('p', { text: '이 갈래에는 아직 온 것이 없습니다.' }),
      ]));
      this.moreWrap.hidden = true;
      this.count.textContent = '';
      return;
    }

    const slice = list.slice(0, this.shown);
    slice.forEach((it, i) => this.list.appendChild(this.#row(it, i)));

    this.moreWrap.hidden = this.shown >= list.length;
    const fresh = list.filter((x) => x.isNew).length;
    this.count.textContent = fresh
      ? `${list.length}건 · 새 소식 ${fresh}`
      : `${list.length}건`;
  }

  #row(it, i) {
    const li = el('li.item', {
      class: [
        it.isNew ? 'is-new' : '',
        it.isRead ? 'is-read' : '',
        it.urgency >= URGENT_AT ? 'is-urgent' : '',
      ].filter(Boolean).join(' '),
      style: { animationDelay: `${Math.min(i, 14) * 22}ms` },
      tabindex: '0',
      role: 'button',
      data: { id: it.id },
      onclick: () => this.hooks.onOpen?.(it),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.hooks.onOpen?.(it); }
      },
    }, [
      el('span.item__src', { text: it.srcName }),
      el('div.item__main', [
        el('h3.item__title', [
          it.flag ? el('span.item__flag', { text: it.flag }) : null,
          document.createTextNode(it.title),
        ]),
        it.summary ? el('p.item__dek', { text: it.summary.slice(0, 160) }) : null,
      ]),
      el('time.item__time', {
        text: it.time ? ago(it.time) : '',
        datetime: it.time ? new Date(it.time).toISOString() : '',
        data: { t: it.time || '' },
      }),
    ]);
    return li;
  }

  /** 목록을 다시 그리지 않고 시각만 새로 적는다 */
  #retime() {
    for (const t of this.list.querySelectorAll('.item__time')) {
      const when = Number(t.dataset.t);
      if (when) t.textContent = ago(when);
    }
  }

  /** 하나를 읽은 것으로 표시 */
  markRead(id) {
    const row = this.list.querySelector(`[data-id="${id}"]`);
    row?.classList.add('is-read');
    row?.classList.remove('is-new');
    const it = this.items.find((x) => x.id === id);
    if (it) { it.isRead = true; it.isNew = false; }
  }
}
