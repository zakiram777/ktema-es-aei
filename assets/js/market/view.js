/* ═══════════════════════════════════════════════════════════════
   view.js — 시세판·띠·차트 판을 그린다

   여기는 그리기만 한다. 값을 부르는 일은 main.js 가, 셈하는 일은
   quotes/indicators/analysis 가 맡는다. 그리는 자리가 부르는 일까지
   하면 화면을 고칠 때마다 부르는 길을 건드리게 된다.

   ── 무엇이 어디에 있나 ──
     머리띠      기간 단추 (#topRanges)
     시세 화면   판 (#board) · 흐르는 띠 (#tapeTrack)
     차트 화면   머리(값·등락) · 캔버스 · 아래 칸 · 범례 · 요약 숫자
     서랍 둘     지표 만들기 (#inds) · 견주어 보기 (#cmp)
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { px, num, pct, big, dir, arrow, stamp, clock } from '../core/fmt.js';
import { DEFAULT_WATCH, RANGES, nameOf, MARKETS, isOpen } from './symbols.js';
import { Chart, LowerChart, sparkline } from './chart.js';
import {
  KINDS, kindById, blank, sane, nameOf as indName, COLORS, colorVar,
  DEFAULT_INDICATORS,
} from './indicators.js';
import { check as checkFormula, HELP as FX_HELP } from './formula.js';
import { ma, extremes } from './quotes.js';
import { vol, drawdown, position } from './analysis.js';
import * as store from '../core/store.js';

/** 견줄 것에 돌려 가며 물리는 색 */
const CMP_COLORS = ['--key-300', '--ok', '--warn', '--tx-300', '--up', '--down'];

export class MarketView {
  /** @param {{onSymbol, onRange}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;

    this.board = $('#board');
    this.tape = $('#tapeTrack');
    this.stamp = $('#marketStamp');
    this.clocks = $('#clocks');

    this.symEl = $('#chartSym');
    this.nameEl = $('#chartName');
    this.priceEl = $('#chartPrice');
    this.statsEl = $('#chartStats');
    this.rangeEl = $('#topRanges');
    this.veil = $('#chartVeil');
    this.zoomEl = $('#chartZoom');
    this.legendEl = $('#chartLegend');

    this.quotes = [];
    this.symbol = store.get('symbol') || '^KS11';
    this.range = store.get('range') || '6mo';

    this.indicators = loadIndicators();
    this.compare = [];                       // [{symbol, ko, bars}]

    this.lowerHost = $('#chartLower');
    this.lower = new LowerChart($('#chartLowerCanvas'));

    this.chart = new Chart($('#chartCanvas'), { tip: $('#chartTip') });
    this.chart.onView = () => { this.#paintZoom(); this.#paintLower(); };

    this.#buildRanges();
    this.#buildClocks();
    setInterval(() => this.#tickClocks(), 20_000);
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
        el('div.card__px', { text: q.price != null ? px(q.price) : '—' }),
        el('div.card__ch', { class: d }, [
          el('span', { text: arrow(q.changePct) }),
          el('span', { text: q.change != null ? px(Math.abs(q.change)) : '—' }),
          el('span.card__pct', { text: q.changePct != null ? pct(q.changePct) : '' }),
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

  #renderTape() {
    clear(this.tape);
    const make = () => {
      const frag = document.createDocumentFragment();
      for (const q of this.quotes) {
        if (!q.ok || q.price == null) continue;
        frag.appendChild(el('div.tick', [
          el('span.tick__sym', { text: q.ko || q.name }),
          el('span.tick__px', { text: px(q.price) }),
          el('span.tick__ch', {
            class: dir(q.changePct),
            text: `${arrow(q.changePct)} ${pct(q.changePct)}`,
          }),
        ]));
      }
      return frag;
    };
    // 끊김 없이 흐르게 같은 줄을 두 번 잇는다
    this.tape.appendChild(make());
    this.tape.appendChild(make());
  }

  /* ─────────────── 기간 ─────────────── */

  #buildRanges() {
    clear(this.rangeEl);
    for (const r of RANGES) {
      this.rangeEl.appendChild(el('button', {
        type: 'button',
        class: r.id === this.range ? 'is-on' : '',
        text: r.label,
        data: { range: r.id },
        onclick: () => {
          this.range = r.id;
          store.set('range', r.id);
          for (const b of this.rangeEl.children) b.classList.toggle('is-on', b.dataset.range === r.id);
          this.hooks.onRange?.(r.id);
        },
      }));
    }
  }

  setSymbol(sym) {
    this.symbol = sym;
    for (const c of this.board.children) {
      c.classList.toggle('is-on', c.querySelector('.card__sym')?.textContent === sym);
    }
  }

  /* ─────────────── 차트 ─────────────── */

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
    this.q = q;

    this.symEl.textContent = q.symbol;
    this.nameEl.textContent =
      `${q.ko || ''}${q.ko && q.name && q.ko !== q.name ? ' · ' : ''}${q.name || ''}`;

    clear(this.priceEl);
    this.priceEl.append(
      el('span.px', { text: q.price != null ? px(q.price) : '—' }),
      el('span.ch', { class: dir(q.changePct) }, [
        el('span', { text: arrow(q.changePct) }),
        el('span', { text: q.change != null ? px(Math.abs(q.change)) : '—' }),
        el('span', { text: `(${pct(q.changePct)})` }),
      ]),
    );

    const intraday = range === '5d';
    this.chart.set(q.bars, {
      intraday,
      indicators: this.indicators,
      name: q.ko || q.name || q.symbol,
    });
    this.#paintLower();
    this.#paintLegend();
    this.#renderStats(q);
  }

  /* ── 값대별 거래량과 비율 ──
     둘 다 차트를 읽는 방식을 바꾸는 것이라 머리에 둔다. 서랍에 넣으면
     켜 놓은 줄 모르고 다른 그림을 보게 된다. */

  toggleProfile() {
    this.chart.setProfile(!this.chart.profile);
    $('#btnProfile')?.classList.toggle('is-on', this.chart.profile);
  }

  toggleRatio() {
    this.chart.setRatio(!this.chart.ratio);
    $('#btnRatio')?.classList.toggle('is-on', this.chart.ratioMode);
    this.#paintLegend();
  }

  /** 비율은 견줄 것이 딱 하나일 때만 뜻이 있다 */
  #paintRatioBtn() {
    const btn = $('#btnRatio');
    if (!btn) return;
    btn.hidden = this.compare.length !== 1;
    btn.classList.toggle('is-on', this.chart.ratioMode);
  }

  /** 지금 며칠치를 보고 있는지 — 전부를 보고 있으면 아무 말도 하지 않는다 */
  #paintZoom() {
    if (!this.zoomEl) return;
    const r = this.chart.range();
    const all = this.chart.bars.length;

    if (!all || r.count >= all) { this.zoomEl.hidden = true; clear(this.zoomEl); return; }

    const a = this.chart.bars[r.from];
    const b = this.chart.bars[r.to];
    const day = (x) => (x
      ? new Date(x.t).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' })
      : '');

    clear(this.zoomEl);
    this.zoomEl.hidden = false;
    this.zoomEl.append(
      el('b', { text: r.count + '개' }),
      el('span', { text: day(a) + ' – ' + day(b) }),
      el('button', {
        type: 'button',
        title: '두 번 눌러도 됩니다',
        onclick: () => this.chart.resetView(),
      }, '전부'),
    );
  }

  /** 아래 칸 — 그릴 것이 없으면 칸 자체를 접는다 */
  #paintLower() {
    const list = this.chart.lower || [];
    this.lowerHost.hidden = !list.length;
    if (!list.length) return;
    // 여럿이면 칸을 늘린다. 셋을 132px 에 우겨 넣으면 아무것도 안 보인다.
    this.lowerHost.style.height = Math.min(340, 92 + list.length * 44) + 'px';
    requestAnimationFrame(() => {
      this.lower.fit?.();
      this.lower.set(this.chart.shown, list);
    });
  }

  #paintLegend() {
    clear(this.legendEl);

    if (this.chart.ratioMode) {
      const other = this.compare[0];
      this.legendEl.appendChild(el('b.legend--mode', { text: '비율 눈금' }));
      this.legendEl.appendChild(el('b', {
        text: `${this.q?.ko || this.symbol} ÷ ${other?.ko || ''}`,
      }));
      this.legendEl.appendChild(el('b', {
        class: 'legend--dim',
        text: '띠는 평균에서 표준편차만큼 · 밖으로 나가면 드물게 벌어진 것',
      }));
      return;
    }

    if (this.chart.pctMode) {
      this.legendEl.appendChild(el('b.legend--mode', { text: '백분율 눈금' }));
      this.legendEl.appendChild(el('b', [
        el('i', { style: { background: 'var(--tx-100)' } }),
        document.createTextNode(this.q?.ko || this.symbol),
      ]));
      this.chart.cmp.forEach((c) => {
        this.legendEl.appendChild(el('b', [
          el('i', { style: { background: c.color } }),
          document.createTextNode(c.name),
        ]));
      });
    }

    for (const l of this.chart.legend()) {
      // 백분율 눈금일 때는 값 칸에 겹치는 지표를 그리지 않는다(chart.js).
      // 그리지 않은 것을 범례에 적어 두면 사람은 그것을 찾다가 지친다.
      if (this.chart.pctMode && l.pane === 'price') continue;

      this.legendEl.appendChild(el('b', [
        el('i', { style: { background: l.color } }),
        document.createTextNode(l.name),
        l.last != null ? el('span.num', { text: ' ' + px(l.last) }) : null,
      ]));
    }
  }

  /** 차트 화면이 다시 보일 때 — 숨어 있는 동안에는 크기를 잴 수 없었다 */
  refresh() {
    this.chart.fit?.();
    this.chart.draw();
    this.#paintLower();
  }

  /* ─────────────── 요약 숫자 ───────────────

     차트 아래의 한 줄. 눈으로는 안 보이는 것만 적는다 — 얼마나
     흔들렸나, 꼭대기에서 얼마나 팠나, 한 해 폭 어디쯤인가. 시가·고가
     같은 것은 차트를 보면 알므로 뒤로 민다. */

  #renderStats(q) {
    if (!this.statsEl) return;
    clear(this.statsEl);

    const bars = q.bars || [];
    if (!bars.length) return;

    const { hi, lo } = extremes(bars);
    const r = RANGES.find((x) => x.id === this.range) || RANGES[3];
    const dd = drawdown(bars);
    const v = vol(bars, r.interval);
    const pos = position(bars, q.yearHigh, q.yearLow);

    const rows = [
      ['구간 고',  px(hi.v), null, '이 구간에서 가장 높았던 값'],
      ['구간 저',  px(lo.v), null, '이 구간에서 가장 낮았던 값'],
      ['20일선',  ma(bars, 20) != null ? px(ma(bars, 20)) : null, null, '스무 날 이동평균'],
      ['60일선',  ma(bars, 60) != null ? px(ma(bars, 60)) : null, null, '예순 날 이동평균'],
      ['흔들림',  v != null ? v.toFixed(1) + '%' : null, null,
        '한 해로 늘린 변동성. 지금까지 이 정도로 널뛰었다는 뜻입니다.'],
      ['최대 낙폭', dd.mdd ? pct(dd.mdd, 1) : null, dir(dd.mdd),
        '이 구간에서 꼭대기부터 가장 깊이 팠던 자리'],
      ['지금 낙폭', dd.now != null ? pct(dd.now, 1) : null, dir(dd.now),
        '꼭대기에서 지금 얼마나 내려와 있나'],
      ['폭 안 자리', pos != null ? Math.round(pos) + '%' : null, null,
        '한 해 폭에서 0은 바닥, 100은 꼭대기'],
      ['52주 고', q.yearHigh != null ? px(q.yearHigh) : null, null, null],
      ['52주 저', q.yearLow != null ? px(q.yearLow) : null, null, null],
      ['거래량',  Number.isFinite(q.volume) ? big(q.volume) : null, null, null],
    ];

    for (const [k, text, cls, note] of rows) {
      if (text == null) continue;
      this.statsEl.appendChild(el('div.stat', { title: note || '' }, [
        el('span.stat__k', { text: k }),
        el('span.stat__v', { class: cls || '', text }),
      ]));
    }
  }

  /* ═══════════════ 지표 서랍 ═══════════════ */

  buildIndicatorPanel() {
    const list = $('#indsList');
    const add = $('#indsAdd');
    clear(list);
    clear(add);

    for (const ind of this.indicators) list.appendChild(this.#indRow(ind));

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

  /* ── 수식 칸 ──
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

  #formulaHelp(box, done) {
    const put = (text) => { box.value = text; done(); };

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

  /* ═══════════════ 견주어 보기 서랍 ═══════════════ */

  /** @param {(sym:string)=>Promise<object>} fetchBars */
  buildComparePanel(fetchBars) {
    this.fetchBars = fetchBars;
    this.#paintCompare();
  }

  #paintCompare() {
    const list = $('#cmpList');
    const add = $('#cmpAdd');
    if (!list) return;
    clear(list);
    clear(add);

    if (!this.compare.length) {
      list.appendChild(el('p.inds__note', {
        text: '아직 견줄 것이 없습니다. 아래에서 골라 보십시오. 하나라도 걸면 '
            + '눈금이 값에서 백분율로 바뀝니다.',
      }));
    }

    this.compare.forEach((c, i) => {
      list.appendChild(el('div.cmp__row', [
        el('i.cmp__dot', { style: { background: `var(${CMP_COLORS[i % CMP_COLORS.length]})` } }),
        el('b', { text: c.ko }),
        el('code', { text: c.symbol }),
        el('span.ind__spacer'),
        el('button.iconbtn.iconbtn--sm', {
          type: 'button', 'aria-label': '빼기',
          onclick: () => {
            this.compare = this.compare.filter((x) => x !== c);
            this.#applyCompare();
            this.#paintCompare();
          },
        }, '×'),
      ]));
    });

    // 지켜보는 것들 중에서 고른다. 지금 보고 있는 것과 이미 건 것은 뺀다.
    const watch = store.get('watch') || DEFAULT_WATCH;
    const pool = watch.filter((w) =>
      w.symbol !== this.symbol && !this.compare.some((c) => c.symbol === w.symbol));

    for (const w of pool.slice(0, 14)) {
      add.appendChild(el('button.btn.btn--quiet.btn--tiny', {
        type: 'button',
        disabled: this.compare.length >= 5,
        onclick: (e) => this.#addCompare(w, e.currentTarget),
      }, [ico('plus'), el('span.btn__label', { text: w.ko || nameOf(w.symbol) })]));
    }

    if (this.compare.length >= 5) {
      add.appendChild(el('span.inds__note', { text: '다섯이면 넉넉합니다. 더 얹으면 결이 안 보입니다.' }));
    }
  }

  async #addCompare(w, btn) {
    if (!this.fetchBars) return;
    btn?.classList.add('is-busy');
    try {
      const q = await this.fetchBars(w.symbol);
      this.compare.push({ symbol: w.symbol, ko: w.ko || nameOf(w.symbol), bars: q.bars || [] });
      this.#applyCompare();
      this.#paintCompare();
    } catch {
      btn?.classList.remove('is-busy');
      btn?.classList.add('is-bad');
      setTimeout(() => btn?.classList.remove('is-bad'), 1400);
    }
  }

  #applyCompare() {
    const css = getComputedStyle(document.documentElement);
    this.chart.setCompare(this.compare.map((c, i) => ({
      ...c,
      color: css.getPropertyValue(CMP_COLORS[i % CMP_COLORS.length]).trim() || '#6b9bff',
    })));
    this.#paintRatioBtn();
    this.#paintLegend();
  }

  /** 종목이 갈리면 견주던 것은 물린다 — 다른 것에 붙어 있으면 헷갈린다 */
  clearCompare() {
    if (!this.compare.length) return;
    this.compare = [];
    this.chart.setCompare([]);
    this.chart.setRatio(false);
    this.#paintCompare();
    this.#paintRatioBtn();
    this.#paintLegend();
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
