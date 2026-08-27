/* ═══════════════════════════════════════════════════════════════
   view.js — 시세판·띠·차트 판을 그리고, 숫자에 목소리를 붙인다

   여기가 8번 요구가 사는 곳이다. 화면에 뜬 숫자는 전부 누를 수
   있고, 누르면 자키람이 그 숫자를 읽는다. 값마다 .val 단추를 씌우고
   무엇을 읽어야 하는지 dataset 에 적어 둔다. 실제로 읽는 일은
   한곳(main.js 의 speak)에서 맡아, 어느 숫자를 눌러도 같은 방식으로
   말한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { px, num, pct, big, dir, arrow, stamp, sayNum } from '../core/fmt.js';
import { DEFAULT_WATCH, QUICK, RANGES, nameOf, MARKETS, isOpen, unitFor } from './symbols.js';
import { Chart, sparkline } from './chart.js';
import { ma, extremes } from './quotes.js';
import * as store from '../core/store.js';
import { clock } from '../core/fmt.js';

export class MarketView {
  /**
   * @param {{onSpeakValue, onSpeakQuote, onSpeakBar, onSymbol, onRange}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.board = $('#board');
    this.tape = $('#tapeTrack');
    this.stamp = $('#marketStamp');
    this.clocks = $('#clocks');

    this.symEl = $('#chartSym');
    this.nameEl = $('#chartName');
    this.priceEl = $('#chartPrice');
    this.rangeEl = $('#chartRanges');
    this.statsEl = $('#chartStats');
    this.pickerEl = $('#chartPicker');
    this.veil = $('#chartVeil');

    this.quotes = [];
    this.symbol = store.get('symbol') || '^KS11';
    this.range = store.get('range') || '6mo';

    this.chart = new Chart($('#chartCanvas'), {
      tip: $('#chartTip'),
      onPick: (bar, i, bars) => this.hooks.onSpeakBar?.(bar, i, bars, this.symbol),
    });

    this.#buildRanges();
    this.#buildPicker();
    this.#buildClocks();
    setInterval(() => this.#tickClocks(), 20_000);

    // 값 단추는 판 하나에서 한꺼번에 듣는다 (위임)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('.val');
      if (!b) return;
      e.stopPropagation();
      this.#saidFlash(b);
      this.hooks.onSpeakValue?.({
        label: b.dataset.label || '',
        value: b.dataset.value != null ? Number(b.dataset.value) : null,
        unit: b.dataset.unit || '',
        change: b.dataset.change != null ? Number(b.dataset.change) : null,
        changePct: b.dataset.pct != null ? Number(b.dataset.pct) : null,
        text: b.dataset.say || '',
      });
    });
  }

  #saidFlash(b) {
    b.classList.remove('is-said');
    void b.offsetWidth;
    b.classList.add('is-said');
    setTimeout(() => b.classList.remove('is-said'), 950);
  }

  /* ─────────────── 시계 ─────────────── */

  #buildClocks() {
    clear(this.clocks);
    this.clockNodes = MARKETS.map((m) => {
      const time = el('span.clock__time');
      const node = el('div.clock', [
        el('span.clock__dot'),
        el('span.clock__city', { text: m.label }),
        time,
      ]);
      this.clocks.appendChild(node);
      return { m, node, time };
    });
    this.#tickClocks();
  }

  #tickClocks() {
    const now = new Date();
    for (const c of this.clockNodes || []) {
      c.time.textContent = clock(now, c.m.tz);
      c.node.classList.toggle('is-open', isOpen(c.m, now));
    }
  }

  /* ─────────────── 시세판 ─────────────── */

  setQuotes(quotes, at) {
    this.quotes = quotes;
    this.#renderBoard();
    this.#renderTape();
    if (at) this.stamp.textContent = `${stamp(new Date(at))} 기준`;
  }

  #renderBoard() {
    clear(this.board);
    for (const q of this.quotes) {
      const d = dir(q.changePct);
      const card = el('div.card', {
        class: [
          q.symbol === this.symbol ? 'is-on' : '',
          q.ok ? '' : 'is-stale',
        ].filter(Boolean).join(' '),
        title: q.ok ? `${q.name} — 눌러서 차트로` : (q.why || '시세를 받지 못했습니다'),
        onclick: () => this.hooks.onSymbol?.(q.symbol),
      }, [
        el('div.card__name', [
          document.createTextNode(q.ko || q.name),
          el('span.card__sym', { text: q.symbol }),
        ]),
        el('div.card__px', [
          this.#val({
            text: q.price != null ? px(q.price) : '—',
            label: q.ko || q.name,
            value: q.price,
            change: q.change,
            pct: q.changePct,
            unit: unitFor(q),
          }),
        ]),
        el('div.card__ch', { class: d }, [
          document.createTextNode(arrow(q.changePct) + ' '),
          this.#val({
            text: q.change != null ? px(Math.abs(q.change)) : '—',
            label: `${q.ko || q.name} 등락폭`,
            value: q.change != null ? Math.abs(q.change) : null,
          }),
          this.#val({
            text: q.changePct != null ? pct(q.changePct) : '',
            label: `${q.ko || q.name} 등락률`,
            say: q.changePct != null
              ? `${q.ko || q.name}, ${sayNum(Math.abs(q.changePct), 'ko')} 퍼센트 ${q.changePct > 0 ? '상승' : q.changePct < 0 ? '하락' : '보합'}입니다`
              : '',
          }),
        ]),
        q.bars?.length > 1 ? el('canvas.card__spark') : null,
      ]);

      this.board.appendChild(card);

      const spark = card.querySelector('.card__spark');
      if (spark) {
        requestAnimationFrame(() => {
          const col = getComputedStyle(document.documentElement)
            .getPropertyValue(q.changePct >= 0 ? '--up' : '--down').trim();
          sparkline(spark, q.bars, col);
        });
      }
    }
  }

  /** 값 하나를 누를 수 있는 단추로 */
  #val({ text, label, value, change, pct: p, unit, say }) {
    if (text === '' || text == null) return document.createTextNode('');
    return el('button.val', {
      type: 'button',
      title: '눌러서 듣기',
      data: {
        label: label || '',
        value: value != null && Number.isFinite(value) ? String(value) : null,
        change: change != null && Number.isFinite(change) ? String(change) : null,
        pct: p != null && Number.isFinite(p) ? String(p) : null,
        unit: unit || null,
        say: say || null,
      },
    }, text);
  }

  #renderTape() {
    clear(this.tape);
    const make = () => {
      const frag = document.createDocumentFragment();
      for (const q of this.quotes) {
        if (!q.ok || q.price == null) continue;
        frag.appendChild(el('div.tick', [
          el('span.tick__sym', { text: q.ko || q.name }),
          el('span.tick__px', { text: px(q.price) }),
          el('span.tick__ch', { class: dir(q.changePct), text: `${arrow(q.changePct)} ${pct(q.changePct)}` }),
        ]));
      }
      return frag;
    };
    // 끊김 없이 흐르게 같은 줄을 두 번 잇는다
    this.tape.appendChild(make());
    this.tape.appendChild(make());
  }

  /* ─────────────── 차트 판 ─────────────── */

  #buildRanges() {
    clear(this.rangeEl);
    for (const r of RANGES) {
      this.rangeEl.appendChild(el('button', {
        type: 'button',
        class: r.id === this.range ? 'is-on' : '',
        text: r.label,
        onclick: () => {
          this.range = r.id;
          store.set('range', r.id);
          for (const b of this.rangeEl.children) b.classList.toggle('is-on', b.textContent === r.label);
          this.hooks.onRange?.(r.id);
        },
      }));
    }
  }

  #buildPicker() {
    clear(this.pickerEl);
    for (const s of QUICK) {
      this.pickerEl.appendChild(el('button.pick', {
        type: 'button',
        class: s === this.symbol ? 'is-on' : '',
        text: nameOf(s),
        data: { sym: s },
        onclick: () => this.hooks.onSymbol?.(s),
      }));
    }
  }

  setSymbol(sym) {
    this.symbol = sym;
    for (const b of this.pickerEl.children) b.classList.toggle('is-on', b.dataset.sym === sym);
    for (const c of this.board.children) {
      c.classList.toggle('is-on', c.querySelector('.card__sym')?.textContent === sym);
    }
  }

  chartLoading(on) {
    this.veil.hidden = !on;
    if (on) this.veil.textContent = '시세를 부르는 중…';
  }

  chartFailed(why) {
    this.veil.hidden = false;
    this.veil.textContent = why || '시세를 받지 못했습니다';
  }

  /** 차트를 새로 그린다 */
  setChart(q, range) {
    this.veil.hidden = true;
    this.symEl.textContent = q.symbol;
    this.nameEl.textContent = `${q.ko || ''}${q.ko && q.name && q.ko !== q.name ? ' · ' : ''}${q.name || ''}`;

    const d = dir(q.changePct);
    clear(this.priceEl);
    this.priceEl.appendChild(el('span.px', [
      this.#val({
        text: q.price != null ? px(q.price) : '—',
        label: q.ko || q.name,
        value: q.price,
        change: q.change,
        pct: q.changePct,
        unit: unitFor(q),
      }),
    ]));
    this.priceEl.appendChild(el('span.ch', { class: d }, [
      this.#val({
        text: `${arrow(q.changePct)} ${q.change != null ? px(Math.abs(q.change)) : '—'} (${pct(q.changePct)})`,
        label: `${q.ko || q.name} 등락`,
        value: q.change != null ? Math.abs(q.change) : null,
        change: q.change,
        pct: q.changePct,
      }),
    ]));

    const intraday = range === '5d';
    this.chart.set(q.bars, { intraday });

    this.#renderStats(q);
  }

  #renderStats(q) {
    clear(this.statsEl);
    const bars = q.bars || [];
    const { hi, lo } = bars.length ? extremes(bars) : { hi: { v: null }, lo: { v: null } };
    const m20 = ma(bars, 20), m60 = ma(bars, 60);

    const rows = [
      ['시가',   q.bars?.at(-1)?.o, null],
      ['고가',   q.dayHigh ?? q.bars?.at(-1)?.h, null],
      ['저가',   q.dayLow ?? q.bars?.at(-1)?.l, null],
      ['구간 고', hi.v, '이 구간에서 가장 높았던 값'],
      ['구간 저', lo.v, '이 구간에서 가장 낮았던 값'],
      ['20일선', m20, '스무 날 이동평균'],
      ['60일선', m60, '예순 날 이동평균'],
      ['52주 고', q.yearHigh, null],
      ['52주 저', q.yearLow, null],
    ];

    for (const [k, v, note] of rows) {
      if (v == null || !Number.isFinite(v)) continue;
      this.statsEl.appendChild(el('div.stat', [
        el('span.stat__k', { text: k }),
        el('span.stat__v', [
          this.#val({
            text: px(v),
            label: `${q.ko || q.name} ${note || k}`,
            value: v,
            unit: unitFor(q),
          }),
        ]),
      ]));
    }

    if (Number.isFinite(q.volume)) {
      this.statsEl.appendChild(el('div.stat', [
        el('span.stat__k', { text: '거래량' }),
        el('span.stat__v', [
          this.#val({
            text: big(q.volume),
            label: `${q.ko || q.name} 거래량`,
            say: `${q.ko || q.name} 거래량은 ${big(q.volume)}입니다`,
          }),
        ]),
      ]));
    }
  }

  /** 지금 화면에 걸린 차트를 말로 읽을 재료 */
  chartView(q) {
    const bars = q.bars || [];
    if (!bars.length) return null;
    const { hi, lo } = extremes(bars);
    return {
      symbol: q.symbol,
      name: q.ko || q.name,
      bars,
      range: this.range,
      first: bars[0].c,
      // 장중이면 오늘 봉이 아직 닫히지 않아 마지막 봉은 어제 것이다.
      // 화면 머리에 뜬 값과 어긋나지 않게 지금 값을 먼저 쓴다.
      last: Number.isFinite(q.price) ? q.price : bars.at(-1).c,
      hi, lo,
      ma20: ma(bars, 20),
      ma60: ma(bars, 60),
    };
  }
}

export { DEFAULT_WATCH };
