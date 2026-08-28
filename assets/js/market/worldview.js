/* ═══════════════════════════════════════════════════════════════
   worldview.js — 세계 열지도 화면 (Κόσμος)

   칸 넓이는 시가총액, 칸 색은 등락, 묶음은 업종이다.

   ── 왜 캔버스가 아니라 DOM 인가 ──
   캔버스로 그리면 칸마다 마우스를 얹었을 때를 손으로 다 만들어야 하고,
   글자가 화면 밀도에 따라 흐려진다. 칸이 백 개쯤이면 DOM 이 감당하고,
   그러면 마우스·누르기·접근성이 공짜로 딸려 온다.

   ── 실시간 ──
   WebSocket 은 CORS 를 묻지 않는다(net/live.js). 열지도에 걸린 종목을
   그대로 신청해 두면 값이 오는 대로 칸 색이 바뀐다. 장이 닫혀 있으면
   아무것도 오지 않고, 그때는 마지막 종가로 칠해진 채 멈춘다 — 그
   사실을 화면 위에 적는다.

   ── 왜 등락을 세 갈래로 자르지 않나 ──
   빨강/회색/파랑 셋으로만 칠하면 +0.1% 와 +4% 가 같은 색이 된다.
   그러면 '오늘 무엇이 시장을 끌었나' 를 못 읽는다. 짙기를 이어지게 두되
   ±3% 에서 가장 짙어지게 한다 — 그보다 큰 것은 더 짙게 해 봐야 눈이
   구별하지 못한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, throttle } from '../core/dom.js';
import { pct, num } from '../core/fmt.js';
import { on } from '../core/bus.js';
import * as store from '../core/store.js';
import { MARKETS, SECTORS, marketById, itemsOf, layout } from './world.js';

/* 색이 가장 짙어지는 자리. 이보다 크게 움직여도 색은 더 안 짙어진다. */
const FULL = 3;

const SIZES = [
  { id: 'cap', ko: '시가총액' },
  { id: 'equal', ko: '모두 같게' },
];

export class WorldView {
  /** @param {{fetchQuotes:(syms)=>Promise, live?:object, onSymbol:(sym)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;

    this.host = $('#worldBody');
    this.tabsEl = $('#worldTabs');
    this.stampEl = $('#worldStamp');
    this.btn = $('#btnWorld');
    this.toolsEl = $('#worldTools');

    this.market = marketById(store.get('worldMarket') || 'us');
    this.size = store.get('worldSize') || 'cap';
    this.group = store.get('worldGroup') !== false;

    this.quotes = new Map();       // symbol → {changePct, price, cap}
    this.cells = new Map();        // symbol → {node, pctEl}
    this.busy = false;

    this.btn?.addEventListener('click', () => this.load({ fresh: true }));
    this.#buildTabs();
    this.#buildTools();

    on('view:shown', ({ view }) => { if (view === 'world') this.open(); });
    window.addEventListener('resize', throttle(() => this.paint(), 200));
    on('live:tick', ({ rows }) => { for (const t of rows || []) this.#tick(t); });
  }

  #buildTabs() {
    if (!this.tabsEl) return;
    clear(this.tabsEl);
    for (const m of MARKETS) {
      this.tabsEl.appendChild(el('button.tab', {
        class: m.id === this.market.id ? 'is-on' : '', type: 'button',
        onclick: () => {
          this.market = m;
          store.set('worldMarket', m.id);
          this.quotes.clear();
          this.#buildTabs();
          this.load();
        },
      }, [
        el('span.tab__gr', { text: m.gr }),
        el('span.tab__ko', { text: m.ko }),
      ]));
    }
  }

  #buildTools() {
    if (!this.toolsEl) return;
    clear(this.toolsEl);

    this.toolsEl.appendChild(el('div.wm__pills', SIZES.map((s) => el('button.chip', {
      class: s.id === this.size ? 'is-on' : '', type: 'button',
      title: s.id === 'cap' ? '칸 넓이를 시가총액에 비례해 나눕니다' : '칸을 모두 같은 크기로 둡니다',
      onclick: () => { this.size = s.id; store.set('worldSize', s.id); this.paint(); this.#buildTools(); },
    }, [s.ko]))));

    this.toolsEl.appendChild(el('button.chip', {
      class: this.group ? 'is-on' : '', type: 'button',
      title: '업종끼리 묶어 놓습니다',
      onclick: () => { this.group = !this.group; store.set('worldGroup', this.group); this.paint(); this.#buildTools(); },
    }, ['업종으로 묶기']));
  }

  async open() {
    if (this.quotes.size) { this.paint(); return; }
    await this.load();
  }

  async load({ fresh = false } = {}) {
    if (this.busy) return;
    this.busy = true;
    this.btn?.classList.add('is-busy');
    this.#say(this.market.ko + ' — 시세를 부르는 중…');

    const items = itemsOf(this.market);
    try {
      const got = await this.hooks.fetchQuotes?.(items.map((i) => i.symbol), { fresh });
      for (const q of got || []) {
        if (!q?.symbol) continue;
        this.quotes.set(q.symbol, q);
      }
      this.#stamp();
    } catch (err) {
      this.#say('시세를 받지 못했습니다 — ' + (err?.message || err));
    } finally {
      this.busy = false;
      this.btn?.classList.remove('is-busy');
      this.paint();
      // 흐르는 값도 함께 건다
      this.hooks.watch?.(items.map((i) => i.symbol));
    }
  }

  #stamp() {
    const live = [...this.quotes.values()].filter((q) => Number.isFinite(q.changePct));
    const up = live.filter((q) => q.changePct > 0).length;
    const dn = live.filter((q) => q.changePct < 0).length;
    const avg = live.length ? live.reduce((a, b) => a + b.changePct, 0) / live.length : null;

    this.#say(live.length
      ? `${live.length}종목 · 오른 것 ${up} · 내린 것 ${dn}`
        + (avg != null ? ` · 고르게 보면 ${pct(avg)}` : '')
      : '');
  }

  #say(t) { if (this.stampEl) this.stampEl.textContent = t; }

  /* ─────────────── 흐르는 값 ─────────────── */

  #tick(t) {
    if (!t?.symbol) return;
    const q = this.quotes.get(t.symbol);
    if (!q) return;
    if (Number.isFinite(t.changePct)) q.changePct = t.changePct;
    if (Number.isFinite(t.price)) q.price = t.price;

    const c = this.cells.get(t.symbol);
    if (!c) return;
    this.#paintCell(c, q);
    // 방금 바뀐 칸을 잠깐 밝힌다 — 어디가 움직였는지 곁눈에 걸리게
    c.node.classList.remove('is-hit');
    void c.node.offsetWidth;
    c.node.classList.add('is-hit');
  }

  /* ─────────────── 그리기 ─────────────── */

  paint() {
    if (!this.host) return;
    clear(this.host);
    this.cells.clear();

    const items = itemsOf(this.market);
    const rows = items.map((it) => {
      const q = this.quotes.get(it.symbol) || {};
      return {
        ...it,
        changePct: Number.isFinite(q.changePct) ? q.changePct : null,
        price: q.price,
        // 야후가 시가총액을 주면 그것을 쓰고, 없으면 적어 둔 어림값
        value: this.size === 'equal' ? 1 : (q.marketCap ? q.marketCap / 1e9 : it.cap),
      };
    });

    const box = el('div.wm__board');
    this.host.appendChild(box);

    const w = box.clientWidth || this.host.clientWidth || 900;
    const h = Math.max(360, Math.min(720, Math.round(w * 0.62)));
    box.style.height = h + 'px';

    const cells = layout(rows, w, h, { group: this.group });
    if (!cells.length) {
      this.host.appendChild(note('시세를 아직 받지 못했습니다. 위의 「다시 부른다」를 누르십시오.'));
      return;
    }

    for (const c of cells) {
      if (c.kind === 'group') {
        box.appendChild(el('div.wm__group', {
          style: { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px' },
        }, [
          c.w > 56 ? el('span.wm__gname', { text: SECTORS[c.sector] || c.sector }) : null,
        ].filter(Boolean)));
        continue;
      }

      const pctEl = el('span.wm__pct');
      const node = el('button.wm__cell', {
        type: 'button',
        title: `${c.ko} (${c.symbol})`,
        style: { left: c.x + 'px', top: c.y + 'px', width: Math.max(0, c.w - 2) + 'px', height: Math.max(0, c.h - 2) + 'px' },
        onclick: () => this.hooks.onSymbol?.(c.symbol),
      }, [
        el('span.wm__name', { text: c.ko }),
        pctEl,
      ]);

      // 칸이 작으면 글자를 지운다 — 넘쳐 나온 글자는 이웃 칸을 덮는다
      if (c.w < 52 || c.h < 30) node.classList.add('is-tiny');
      else if (c.w < 84 || c.h < 44) node.classList.add('is-small');

      box.appendChild(node);
      const cell = { node, pctEl };
      this.cells.set(c.symbol, cell);
      this.#paintCell(cell, c);
    }

    this.host.appendChild(el('p.wm__note', {
      text: `${this.market.note}입니다. 지수를 다 담지 않았으므로 여기 보이는 것이 `
          + `${this.market.indexKo} 전체는 아닙니다 — 다만 지수를 움직이는 무게의 대부분은 여기 있습니다.`,
    }));
    this.host.appendChild(el('p.wm__note', {
      text: '칸 넓이는 시가총액, 색은 오늘 등락입니다. 장이 열려 있으면 값이 오는 대로 칸이 바뀝니다.',
    }));
  }

  #paintCell(cell, q) {
    const v = q.changePct;
    const { node, pctEl } = cell;

    if (!Number.isFinite(v)) {
      node.style.background = 'var(--bg-200)';
      node.style.color = 'var(--tx-500)';
      pctEl.textContent = '—';
      return;
    }

    /* ── 짙기 ──
       ±3% 에서 가장 짙다. 제곱근으로 늘려 작은 움직임도 눈에 걸리게 한다 —
       그냥 비례로 두면 0.3% 짜리는 회색과 구별되지 않는다. */
    const t = Math.min(1, Math.sqrt(Math.abs(v) / FULL));
    const a = 0.12 + t * 0.76;

    node.style.background = v > 0
      ? `rgba(240, 85, 77, ${a})`
      : v < 0 ? `rgba(63, 138, 224, ${a})`
        : 'var(--bg-300)';
    node.style.color = t > 0.42 ? '#fff' : 'var(--tx-200)';
    pctEl.textContent = pct(v, Math.abs(v) >= 10 ? 1 : 2);
  }
}

const note = (text) => el('p.wm__note', { text });
