/* ═══════════════════════════════════════════════════════════════
   view.js — 시세판·띠·차트 판을 그리고, 숫자에 목소리를 붙인다

   여기가 8번 요구가 사는 곳이다. 화면에 뜬 숫자는 전부 누를 수
   있고, 누르면 유리아가 그 숫자를 읽는다. 값마다 .val 단추를 씌우고
   무엇을 읽어야 하는지 dataset 에 적어 둔다. 실제로 읽는 일은
   한곳(main.js 의 speak)에서 맡아, 어느 숫자를 눌러도 같은 방식으로
   말한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { px, num, pct, big, dir, arrow, stamp, sayNum } from '../core/fmt.js';
import { DEFAULT_WATCH, QUICK, RANGES, nameOf, MARKETS, isOpen, unitFor } from './symbols.js';
import { Chart, LowerChart, sparkline } from './chart.js';
import {
  KINDS, kindById, blank, sane, nameOf as indName, COLORS, colorVar,
  DEFAULT_INDICATORS,
} from './indicators.js';
import { check as checkFormula, HELP as FX_HELP } from './formula.js';
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

    this.indicators = loadIndicators();
    this.lowerHost = $('#chartLower');
    this.lower = new LowerChart($('#chartLowerCanvas'));
    this.legendEl = $('#chartLegend');

    this.zoomEl = $('#chartZoom');
    this.chart = new Chart($('#chartCanvas'), {
      tip: $('#chartTip'),
      onPick: (bar, i, bars) => this.hooks.onSpeakBar?.(bar, i, bars, this.symbol),
    });
    // 굴려서 들여다본 만큼을 머리에 적고, 아래 칸도 같이 따라가게 한다
    this.chart.onView = () => { this.#paintZoom(); this.#paintLower(); };

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
    this.chart.set(q.bars, { intraday, indicators: this.indicators });
    this.#paintLower();
    this.#paintLegend();

    this.#renderStats(q);
  }

  /** 지금 며칠치를 보고 있는지 — 전부를 보고 있으면 아무 말도 하지 않는다 */
  #paintZoom() {
    if (!this.zoomEl) return;
    const r = this.chart.range();
    const all = this.chart.bars.length;

    if (!all || r.count >= all) { this.zoomEl.hidden = true; clear(this.zoomEl); return; }

    const a = this.chart.bars[r.from];
    const b = this.chart.bars[r.to];
    const day = (x) => (x ? new Date(x.t).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '');

    clear(this.zoomEl);
    this.zoomEl.hidden = false;
    this.zoomEl.append(
      el('b', { text: r.count + '개' }),
      el('span', { text: day(a) + ' – ' + day(b) }),
      el('button', {
        type: 'button',
        title: '두 번 눌러도 됩니다',
        onclick: () => this.chart.resetView(),
      }, '전부 보기'),
    );
  }

  /* ─────────────── 지표 ─────────────── */

  /** 아래 칸 — 그릴 것이 없으면 칸 자체를 접는다 */
  #paintLower() {
    const list = this.chart.lower || [];
    this.lowerHost.hidden = !list.length;
    if (!list.length) return;
    // 여럿이면 칸을 늘린다. 셋을 132px 에 우겨 넣으면 아무것도 안 보인다.
    this.lowerHost.style.height = Math.min(360, 96 + list.length * 46) + 'px';
    requestAnimationFrame(() => {
      this.lower.fit?.();
      this.lower.set(this.chart.shown, list);
    });
  }

  #paintLegend() {
    clear(this.legendEl);
    for (const l of this.chart.legend()) {
      this.legendEl.appendChild(el('b', [
        el('i', { style: { background: l.color } }),
        document.createTextNode(l.name),
        l.last != null ? el('span.num', { text: ' ' + px(l.last) }) : null,
      ]));
    }
  }

  /** 지표 만드는 서랍을 짓는다 (차트 화면의 '지표' 단추가 편다) */
  buildIndicatorPanel() {
    const list = $('#indsList');
    const add = $('#indsAdd');
    clear(list);
    clear(add);

    for (const ind of this.indicators) {
      list.appendChild(this.#indRow(ind));
    }

    if (!this.indicators.length) {
      list.appendChild(el('p.inds__note', { text: '지표가 하나도 없습니다. 아래에서 더해 보십시오.' }));
    }

    for (const k of KINDS) {
      add.appendChild(el('button.btn.btn--quiet.btn--tiny', {
        type: 'button',
        title: k.note,
        onclick: () => {
          this.indicators.push(blank(k.id));
          this.#saveIndicators();
          this.buildIndicatorPanel();
          this.#refreshIndicators();
        },
      }, [ico('plus'), el('span.btn__label', { text: k.ko })]));
    }
  }

  #indRow(ind) {
    const k = kindById(ind.kind) || KINDS[0];

    const swatch = el('span.ind__swatch', {
      style: { background: 'var(' + colorVar(ind.color) + ')' },
    });

    const fields = k.fields.map((f) => el('label.bt__num', [
      el('span', { text: f.label }),
      el('input', {
        type: 'number', min: f.min, max: f.max, step: f.step || 1,
        value: String(ind.cfg[f.key] ?? f.def),
        oninput: (e) => {
          ind.cfg[f.key] = Number(e.target.value);
          this.#saveIndicators();
          this.#refreshIndicators();
          row.querySelector('.ind__name').textContent = indName(sane(ind) || ind);
        },
      }),
    ]));

    // 수식 틀은 값이 아니라 글을 받는다
    const fxBox = k.free ? this.#formulaBox(ind, () => {
      row.querySelector('.ind__name').textContent = indName(sane(ind) || ind);
    }) : null;

    const colorSel = el('select.sel.sel--sm', {
      onchange: () => {
        ind.color = colorSel.value;
        swatch.style.background = 'var(' + colorVar(ind.color) + ')';
        this.#saveIndicators();
        this.#refreshIndicators();
      },
    }, COLORS.map((c) => el('option', { value: c.id, text: c.ko, selected: c.id === ind.color })));

    const onBox = el('input', { type: 'checkbox' });
    onBox.checked = ind.on !== false;
    onBox.addEventListener('change', () => {
      ind.on = onBox.checked;
      row.classList.toggle('is-off', !ind.on);
      this.#saveIndicators();
      this.#refreshIndicators();
    });

    const row = el('div.ind', { class: ind.on === false ? 'is-off' : '' }, [
      el('label.switch.switch--bare', [
        onBox,
        el('span.switch__track', [el('span.switch__dot')]),
      ]),
      swatch,
      el('span.ind__name', { text: indName(sane(ind) || ind) }),
      ...fields,
      colorSel,
      el('span.ind__spacer'),
      el('button.iconbtn.iconbtn--sm', {
        type: 'button', 'aria-label': '지우기',
        onclick: () => {
          this.indicators = this.indicators.filter((x) => x !== ind);
          this.#saveIndicators();
          this.buildIndicatorPanel();
          this.#refreshIndicators();
        },
      }, '×'),
      fxBox,
      fxBox ? null : el('span.ind__note', { text: k.note }),
    ]);
    return row;
  }

  /* ─────────────── 수식 칸 ───────────────

     적는 대로 곧바로 읽어 본다. 틀렸으면 왜 틀렸는지 그 자리에서
     말해 주고 차트는 건드리지 않는다 — 반쯤 적다 만 수식 때문에
     보고 있던 줄이 사라지면 성가시다. */

  #formulaBox(ind, onName) {
    const say = el('p.fx__say');

    const name = el('input.fx__label', {
      type: 'text',
      placeholder: '이름 (예: 20일선 이격도)',
      value: ind.cfg.label || '',
      maxlength: '40',
      oninput: (e) => {
        ind.cfg.label = e.target.value;
        this.#saveIndicators();
        onName?.();
      },
    });

    const box = el('textarea.fx__input', {
      rows: '2',
      spellcheck: 'false',
      placeholder: '(close - ma(close, 20)) / ma(close, 20) * 100',
    });
    // textarea 는 value 를 속성으로 주면 비어 있는 채로 뜬다.
    // 안에 든 글은 프로퍼티로 넣어야 한다.
    box.value = ind.cfg.expr || '';

    const paint = (apply) => {
      const src = box.value.trim();
      if (!src) {
        say.textContent = '수식을 적어 주십시오.';
        say.className = 'fx__say';
        return;
      }
      const got = checkFormula(src);
      if (got.ok) {
        say.textContent = '읽었습니다.';
        say.className = 'fx__say is-ok';
        box.classList.remove('is-bad');
        if (apply) {
          ind.cfg.expr = src;
          this.#saveIndicators();
          this.#refreshIndicators();
          // 셈해 보고 값이 하나도 안 나오면 그것도 알려 준다
          const hit = (this.chart.inds || []).find((x) => x.ind.id === ind.id);
          if (hit?.out?.error) {
            say.textContent = hit.out.error;
            say.className = 'fx__say is-bad';
          }
        }
      } else {
        box.classList.add('is-bad');
        say.className = 'fx__say is-bad';
        say.textContent = got.why + (got.at != null ? ' (' + (got.at + 1) + '번째 글자)' : '');
      }
    };

    box.addEventListener('input', () => paint(false));
    box.addEventListener('change', () => paint(true));
    box.addEventListener('blur', () => paint(true));
    paint(false);

    const zero = el('input', { type: 'checkbox' });
    zero.checked = !!ind.cfg.zero;
    zero.addEventListener('change', () => {
      ind.cfg.zero = zero.checked;
      this.#saveIndicators();
      this.#refreshIndicators();
    });

    return el('div.fx', [
      el('div.fx__row', [
        name,
        el('label.switch.switch--tiny', [
          zero,
          el('span.switch__track', [el('span.switch__dot')]),
          el('span.switch__label', { text: '0선' }),
        ]),
        el('button.btn.btn--quiet.btn--tiny', {
          type: 'button',
          onclick: (e) => {
            const help = e.target.closest('.fx').querySelector('.fx__help');
            help.hidden = !help.hidden;
          },
        }, el('span.btn__label', { text: '무엇을 쓸 수 있나' })),
      ]),
      box,
      say,
      this.#formulaHelp(box, () => paint(true)),
    ]);
  }

  /** 쓸 수 있는 이름과 함수, 그리고 흔히 쓰는 수식 몇 */
  #formulaHelp(box, done) {
    const put = (text) => {
      box.value = text;
      done();
    };

    return el('div.fx__help', { hidden: true }, [
      el('div.fx__cols', [
        el('div', [
          el('h5', { text: '값' }),
          el('ul', FX_HELP.refs.map(([a, b]) => el('li', [
            el('code', { text: a }), document.createTextNode(' ' + b),
          ]))),
        ]),
        el('div', [
          el('h5', { text: '함수' }),
          el('ul', FX_HELP.funcs.map(([a, b]) => el('li', [
            el('code', { text: a }), document.createTextNode(' ' + b),
          ]))),
        ]),
      ]),
      el('h5', { text: '눌러서 넣어 보기' }),
      el('div.fx__samples', FX_HELP.samples.map(([expr, why]) => el('button.fx__sample', {
        type: 'button',
        title: expr,
        onclick: () => put(expr),
      }, [
        el('b', { text: why }),
        el('code', { text: expr }),
      ]))),
      el('p.fx__warn', {
        text: '여기서는 숫자와 위의 이름·함수만 읽습니다. 그 밖의 것은 읽지 않고 '
            + '어디가 잘못됐는지 알려 줍니다 — 남이 준 설정 파일이 이 페이지에서 '
            + '아무 코드나 돌리지 못하게 하려는 것입니다.',
      }),
    ]);
  }

  #saveIndicators() {
    store.set('indicators', JSON.parse(JSON.stringify(this.indicators)));
  }

  #refreshIndicators() {
    this.chart.setIndicators(this.indicators);
    this.#paintLower();
    this.#paintLegend();
  }

  /** 차트 화면이 다시 보일 때 — 숨어 있는 동안에는 크기를 잴 수 없었다 */
  refresh() {
    this.chart.fit?.();
    this.chart.draw();
    this.#paintLower();
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

/* 설정에 남겨 둔 지표를 되살린다. 낡거나 깨진 것은 조용히 버린다 —
   설정 파일이 예전 것일 수 있고, 그것 때문에 차트가 통째로 멎으면 안 된다. */
function loadIndicators() {
  const saved = store.get('indicators');
  if (!Array.isArray(saved)) return JSON.parse(JSON.stringify(DEFAULT_INDICATORS));
  const clean = saved.map(sane).filter(Boolean);
  return clean.length ? clean : JSON.parse(JSON.stringify(DEFAULT_INDICATORS));
}
