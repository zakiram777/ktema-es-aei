/* ═══════════════════════════════════════════════════════════════
   view.js — 발산 화면 (Ἀπόκρισις)

   위에서 하나를 깊이 보고, 아래에서 조건에 맞는 것을 찾는다.

     차트     찾아서 고르고, 지표를 얹는다
     투자주체 개인·기관·외국인이 무엇을 하고 있나
     신호     이평선이 모였나 · 골든/데드크로스 · 체결 강도
     조건     무엇을 켜고 무엇을 끌 것인가
     걸린 것  조건에 맞는 종목

   ── 왜 이 순서인가 ──
   조건을 먼저 두면 사람은 조건부터 만지작거리게 되고, 그러면 무엇을
   찾고 있었는지를 잊는다. 종목 하나를 눈으로 본 다음에 "이런 것을 더
   찾고 싶다" 가 되는 것이 자연스럽다.

   ── 걸린 것을 왜 맨 아래에 두나 ──
   조건을 바꾸면 결과가 바뀐다. 둘이 붙어 있어야 바꾼 것과 바뀐 것이
   한눈에 이어진다. 결과를 위에 두면 조건을 만질 때마다 위로 올라가야
   한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, throttle } from '../core/dom.js';
import { px, pct, num, big, dir, arrow } from '../core/fmt.js';
import { on, emit } from '../core/bus.js';
import * as store from '../core/store.js';
import { Chart } from '../market/chart.js';
import { KINDS, blank } from '../market/indicators.js';
import { DEFAULT_WATCH, RANGES, nameOf as symName } from '../market/symbols.js';
import * as flows from '../market/flows.js';
import { RULES, ruleById, measure, screen } from './rules.js';

const MODES = [
  { id: 'all', ko: '모두 맞을 때' },
  { id: 'any', ko: '하나라도 맞을 때' },
];

/* 어디서 찾을 것인가. 무엇을 훑을지 정하지 않으면 '전 종목' 이 되는데,
   전 종목은 남의 프록시로 훑을 수 있는 것이 아니다. */
const POOLS = [
  { id: 'watch', ko: '관심 종목' },
  { id: 'kr', ko: '국내 대형주' },
  { id: 'us', ko: '미국 대형주' },
];

export class ScreenView {
  /**
   * @param {{fetchBars, fetchMany, poolOf, onSymbol}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;

    this.host = $('#scrBody');
    this.stampEl = $('#scrStamp');
    this.btn = $('#btnScr');

    this.symbol = store.get('scrSymbol') || store.get('symbol') || '005930.KS';
    this.range = store.get('scrRange') || '1y';
    this.pool = store.get('scrPool') || 'watch';
    this.mode = store.get('scrMode') || 'all';
    this.picked = store.get('scrRules') || [
      { id: 'squeeze', on: true, cfg: {} },
      { id: 'volBurst', on: true, cfg: {} },
    ];
    this.inds = store.get('scrInds') || [
      { ...blank('sma'), id: 'm5', cfg: { period: 5 }, color: 'gold', on: true },
      { ...blank('sma'), id: 'm20', cfg: { period: 20 }, color: 'jade', on: true },
      { ...blank('sma'), id: 'm60', cfg: { period: 60 }, color: 'rose', on: true },
    ];

    this.bars = [];
    this.m = null;
    this.flow = null;
    this.found = null;
    this.busy = false;
    this.scanning = false;

    this.btn?.addEventListener('click', () => this.scan());

    on('view:shown', ({ view }) => { if (view === 'screen') this.open(); });
    window.addEventListener('resize', throttle(() => this.chart?.draw?.(), 200));
  }

  async open() {
    if (!this.bars.length) await this.load();
    else this.chart?.draw?.();
  }

  /* ─────────────── 하나를 깊이 ─────────────── */

  async load() {
    if (this.busy) return;
    this.busy = true;
    this.#say('부르는 중…');
    try {
      const r = RANGES.find((x) => x.id === this.range) || RANGES[5];
      this.bars = await this.hooks.fetchBars(this.symbol, r.id, r.interval) || [];
      this.flow = await flows.history(this.symbol, { days: 60 }).catch(() => null);
      this.m = measure(this.bars, { flow: this.flow?.ok === false ? null : this.flow });
      this.#say('');
    } catch (err) {
      this.bars = [];
      this.m = null;
      this.#say('받지 못했습니다 — ' + (err?.message || err));
    } finally {
      this.busy = false;
      this.render();
    }
  }

  #say(t) { if (this.stampEl) this.stampEl.textContent = t; }

  pick(symbol) {
    this.symbol = symbol;
    store.set('scrSymbol', symbol);
    this.load();
  }

  /* ─────────────── 걸러 내기 ─────────────── */

  async scan() {
    if (this.scanning) return;
    this.scanning = true;
    this.btn?.classList.add('is-busy');
    this.found = null;
    this.render();

    const syms = this.hooks.poolOf(this.pool);
    const r = RANGES.find((x) => x.id === '1y') || RANGES[5];
    const list = [];

    try {
      let done = 0;
      for (const symbol of syms) {
        this.#say(`훑는 중… ${++done}/${syms.length}`);
        let bars = null;
        try { bars = await this.hooks.fetchBars(symbol, r.id, r.interval); } catch { bars = null; }
        if (!bars?.length) continue;

        // 국내 종목이면 투자주체도 함께 — 조건에 그것이 켜져 있을 때만
        let fl = null;
        const needFlow = this.picked.some((p) => p.on !== false && ruleById(p.id)?.kr);
        if (needFlow) {
          try { fl = await flows.history(symbol, { days: 20 }); } catch { fl = null; }
          if (fl?.ok === false) fl = null;
        }

        const m = measure(bars, { flow: fl });
        if (m) list.push({ symbol, ko: symName(symbol) || symbol, m });
      }

      this.found = screen(list, this.picked, { mode: this.mode });
      this.scanned = list.length;
      this.#say(`${list.length}종목을 보고 ${this.found.length}종목이 걸렸습니다`);
    } catch (err) {
      this.#say('훑다가 멈췄습니다 — ' + (err?.message || err));
    } finally {
      this.scanning = false;
      this.btn?.classList.remove('is-busy');
      this.render();
    }
  }

  /* ─────────────── 그리기 ─────────────── */

  render() {
    if (!this.host) return;
    clear(this.host);

    this.#renderPick();
    this.#renderChart();
    this.#renderSignals();
    this.#renderFlows();
    this.#renderRules();
    this.#renderFound();
  }

  /* ═══ 찾기 ═══ */

  #renderPick() {
    const input = el('input.scr__search', {
      type: 'search',
      placeholder: '기호나 이름 (예: 005930.KS, AAPL, ^KS11)',
      value: this.symbol,
      autocomplete: 'off', spellcheck: 'false',
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const v = input.value.trim();
        if (v) this.pick(v);
      },
    });

    this.host.appendChild(el('div.scr__bar', [
      input,
      el('button.btn.btn--key.btn--tiny', {
        type: 'button', onclick: () => { const v = input.value.trim(); if (v) this.pick(v); },
      }, [el('span.btn__label', { text: '본다' })]),

      el('div.scr__ranges', RANGES.filter((r) => !r.intraday).map((r) => el('button.chip', {
        class: r.id === this.range ? 'is-on' : '', type: 'button',
        onclick: () => { this.range = r.id; store.set('scrRange', r.id); this.load(); },
      }, [r.ko]))),
    ]));
  }

  /* ═══ 차트 ═══ */

  #renderChart() {
    if (!this.bars.length) {
      this.host.appendChild(el('p.scr__note', { text: '봉을 받지 못했습니다.' }));
      return;
    }

    const cv = el('canvas');
    const stage = el('div.scr__stage', [cv, el('div.chart__tip', { id: 'scrTip' })]);
    this.host.appendChild(stage);

    // 지표 고르기
    this.host.appendChild(el('div.scr__inds', [
      el('span.scr__indsh', { text: '지표' }),
      el('div.scr__chips', KINDS.filter((k) => k.pane === 'price').map((k) => this.#indChip(k))),
      el('div.scr__chips', KINDS.filter((k) => k.pane === 'lower').map((k) => this.#indChip(k))),
    ]));

    // 캔버스는 붙인 뒤에 크기를 잰다 — 붙기 전에는 폭이 0이다
    setTimeout(() => {
      try {
        this.chart = new Chart(cv, { tip: $('#scrTip') });
        // set() 이 지표까지 함께 받는다. setIndicators 는 봉을 그대로 두고
        // 줄만 갈아 끼울 때 쓴다.
        this.chart.set(this.bars, {
          indicators: this.inds.filter((i) => i.on !== false),
          name: symName(this.symbol) || this.symbol,
        });
      } catch (e) { /* 그림 하나가 화면 전체를 막지 않는다 */ }
    }, 0);
  }

  #indChip(kind) {
    const mine = this.inds.filter((i) => i.kind === kind.id && i.on !== false);
    return el('button.chip', {
      class: mine.length ? 'is-on' : '', type: 'button',
      title: kind.ko,
      onclick: () => {
        const has = this.inds.filter((i) => i.kind === kind.id);
        if (has.length && has.some((i) => i.on !== false)) {
          for (const i of has) i.on = false;
        } else if (has.length) {
          for (const i of has) i.on = true;
        } else {
          this.inds.push({ ...blank(kind.id), id: kind.id + Date.now(), on: true });
        }
        store.set('scrInds', this.inds);
        this.render();
      },
    }, [kind.ko + (mine.length > 1 ? ` ×${mine.length}` : '')]);
  }

  /* ═══ 신호 ═══ */

  #renderSignals() {
    const m = this.m;
    if (!m) return;

    const crossSay = m.cross == null ? '최근 40일 안에는 없습니다'
      : m.cross > 0 ? `${m.cross}일 전 골든크로스`
        : `${-m.cross}일 전 데드크로스`;

    this.host.appendChild(el('h3.scr__h', { text: '지금 이 종목의 상태' }));
    this.host.appendChild(el('div.scr__stats', [
      stat('값', px(m.px), m.chg != null ? pct(m.chg) : '', dir(m.chg)),
      stat('5·20·60 벌어짐', m.spread != null ? m.spread.toFixed(2) + '%' : '—',
        m.spread != null && m.spread <= 2 ? '모여 있습니다' : '벌어져 있습니다'),
      stat('줄 선 차례', { up: '정배열', down: '역배열', mix: '섞임' }[m.align] || '—',
        '5 · 20 · 60'),
      stat('교차', m.cross == null ? '없음' : (m.cross > 0 ? '골든' : '데드'), crossSay,
        m.cross == null ? '' : (m.cross > 0 ? 'up' : 'down')),
      stat('체결 강도', m.press != null ? m.press.toFixed(0) : '—',
        m.press == null ? '' : m.press > 0 ? '위쪽에 붙어 끝납니다' : '아래쪽에 붙어 끝납니다',
        m.press == null ? '' : m.press > 0 ? 'up' : 'down'),
      stat('상대강도', m.rsi != null ? m.rsi.toFixed(0) : '—',
        m.rsi == null ? '' : m.rsi >= 70 ? '높습니다' : m.rsi <= 30 ? '낮습니다' : '가운데'),
      stat('20일선에서', m.gap20 != null ? (m.gap20 > 0 ? '+' : '') + m.gap20.toFixed(1) + '%' : '—', '이격도'),
      stat('한 해 폭에서', m.pos != null ? m.pos.toFixed(0) : '—', '0이 바닥 100이 꼭대기'),
      stat('거래량', m.volMul != null ? m.volMul.toFixed(1) + '배' : '—', '스무 날 평균 대비'),
    ]));

    if (m.spread != null && m.spread <= 2) {
      this.host.appendChild(el('div.scr__alarm', [
        el('b', { text: '이평선이 모여 있습니다' }),
        el('span', {
          text: ' — 값이 한자리에 오래 머물렀다는 뜻입니다. 다만 어느 쪽으로 터질지는 '
              + '이 숫자가 말해 주지 않습니다. 모였다는 것만 보고 사는 것은 동전 던지기입니다.',
        }),
      ]));
    }
    if (m.cross != null && Math.abs(m.cross) <= 3) {
      this.host.appendChild(el('div.scr__alarm', {
        class: m.cross > 0 ? 'is-up' : 'is-down',
      }, [
        el('b', { text: m.cross > 0 ? '방금 골든크로스' : '방금 데드크로스' }),
        el('span', { text: ' — ' + crossSay + '.' }),
      ]));
    }
  }

  /* ═══ 투자주체 ═══ */

  #renderFlows() {
    const f = this.flow;
    this.host.appendChild(el('h3.scr__h', { text: '누가 사고 있나' }));

    if (!f || f.ok === false || !f.rows?.length) {
      this.host.appendChild(el('p.scr__note', {
        text: f?.why || '국내 종목과 지수에만 있는 자료입니다.',
      }));
      return;
    }

    const five = f.rows.slice(-5);
    const sum = (k) => five.reduce((a, b) => a + (b[k] || 0), 0);
    const unit = f.kind === 'index' ? '억 원' : '주';

    this.host.appendChild(el('div.scr__flows', flows.ACTORS.map((a) => {
      const v = sum(a.id);
      return el('div.scr__flow', { class: v > 0 ? 'is-up' : v < 0 ? 'is-down' : '' }, [
        el('span.scr__flowko', { text: a.ko }),
        el('b.scr__flowv', { text: (v > 0 ? '+' : '') + big(v) }),
        el('span.scr__flowu', { text: five.length + '일 합 · ' + unit }),
      ]);
    })));

    if (f.kind === 'index') {
      this.host.appendChild(el('p.scr__note', {
        text: '지수는 네이버가 최근 하루치만 줍니다. 여러 날을 쌓아 보려면 종목으로 보십시오.',
      }));
    }
  }

  /* ═══ 조건 ═══ */

  #renderRules() {
    this.host.appendChild(el('h3.scr__h', { text: '조건' }));

    this.host.appendChild(el('div.scr__bar', [
      el('label.scr__pick', [
        el('span', { text: '어디서' }),
        select(POOLS.map((p) => [p.id, p.ko]), this.pool, (v) => {
          this.pool = v; store.set('scrPool', v); this.render();
        }),
      ]),
      el('div.scr__chips', MODES.map((m) => el('button.chip', {
        class: m.id === this.mode ? 'is-on' : '', type: 'button',
        onclick: () => { this.mode = m.id; store.set('scrMode', m.id); this.render(); },
      }, [m.ko]))),
      el('span.scr__note', {
        text: this.hooks.poolOf(this.pool).length + '종목을 훑습니다',
      }),
    ]));

    this.host.appendChild(el('div.scr__rules', RULES.map((r) => {
      const mine = this.picked.find((p) => p.id === r.id);
      const isOn = !!mine && mine.on !== false;
      const cfg = { ...r.cfg, ...(mine?.cfg || {}) };

      return el('div.scr__rule', { class: isOn ? 'is-on' : '' }, [
        el('button.scr__ruleh', {
          type: 'button',
          onclick: () => {
            if (mine) this.picked = this.picked.filter((p) => p.id !== r.id);
            else this.picked.push({ id: r.id, on: true, cfg: {} });
            store.set('scrRules', this.picked);
            this.render();
          },
        }, [
          el('span.scr__mark', { text: isOn ? '✓' : '' }),
          el('span.scr__rulegr', { text: r.gr }),
          el('span.scr__ruleko', { text: r.ko }),
          r.kr ? el('span.scr__kr', { text: '국내' }) : null,
        ].filter(Boolean)),

        el('p.scr__why', { text: r.why }),

        // 켜 둔 것만 숫자를 만질 수 있게 — 안 켠 조건의 숫자는 뜻이 없다
        isOn && r.fields.length
          ? el('div.scr__fields', r.fields.map((f) => el('label.scr__field', [
            el('span', { text: f.ko }),
            el('input', {
              type: 'number', value: cfg[f.k], min: f.min, max: f.max, step: f.step,
              oninput: (e) => {
                const v = Number(e.target.value);
                if (!isFinite(v)) return;
                mine.cfg = { ...mine.cfg, [f.k]: v };
                store.set('scrRules', this.picked);
              },
            }),
          ])))
          : null,

        isOn ? el('p.scr__belief', [
          el('b', { text: '믿는 것 — ' }), r.belief,
          el('br'),
          el('b', { text: '깨지는 곳 — ' }), r.breaks,
        ]) : null,
      ].filter(Boolean));
    })));
  }

  /* ═══ 걸린 것 ═══ */

  #renderFound() {
    this.host.appendChild(el('h3.scr__h', { text: '걸린 것' }));

    if (this.scanning) {
      return this.host.appendChild(el('p.scr__note', { text: '훑는 중입니다…' }));
    }
    if (!this.found) {
      return this.host.appendChild(el('p.scr__note', {
        text: '위의 「찾는다」를 누르면 고른 곳을 하나씩 훑어 조건에 맞는 것을 찾습니다. '
            + '종목마다 한 해치 봉을 받아야 하므로 서른 종목이면 한참 걸립니다.',
      }));
    }
    if (!this.found.length) {
      return this.host.appendChild(el('div.scr__empty', [
        el('b', { text: '맞는 것이 없습니다' }),
        el('p', {
          text: this.mode === 'all'
            ? `${this.scanned}종목을 보았지만 켜 둔 조건을 모두 만족하는 것이 없습니다. `
              + '「하나라도 맞을 때」로 바꾸면 넓게 볼 수 있습니다.'
            : `${this.scanned}종목을 보았지만 하나도 걸리지 않았습니다. 숫자를 느슨하게 해 보십시오.`,
        }),
      ]));
    }

    this.host.appendChild(el('div.scr__hits', this.found.map((f) => el('button.scr__hit', {
      type: 'button',
      onclick: () => this.pick(f.symbol),
    }, [
      el('div.scr__hithead', [
        el('b.scr__hitko', { text: f.ko }),
        el('span.scr__hitsym', { text: f.symbol }),
        el('span.scr__hitpx', { text: px(f.m.px) }),
        el('span.scr__hitchg', {
          class: dir(f.m.chg),
          text: f.m.chg != null ? arrow(f.m.chg) + ' ' + pct(f.m.chg) : '',
        }),
      ]),
      el('div.scr__tags', f.hits.map((h) => el('span.scr__tag', {
        title: h.rule.why,
      }, [h.rule.ko + (h.say ? ' · ' + h.say : '')]))),
    ]))));

    this.host.appendChild(el('p.scr__note', {
      text: '걸렸다는 것은 "지금 이 조건에 맞는다" 는 뜻이지 "오른다" 는 뜻이 아닙니다. '
          + '조건마다 무엇을 믿고 있고 그 믿음이 언제 깨지는지를 위에 적어 두었습니다.',
    }));
  }
}

/* ═══════════════════ 조각들 ═══════════════════ */

function stat(label, value, why, tone = '') {
  return el('div.scr__stat', { class: tone ? 'is-' + tone : '' }, [
    el('span.scr__statl', { text: label }),
    el('b.scr__statv', { text: value }),
    why ? el('span.scr__statw', { text: why }) : null,
  ].filter(Boolean));
}

function select(pairs, value, onPick) {
  const s = el('select.dv__select', { onchange: (e) => onPick(e.target.value) },
    pairs.map(([v, ko]) => el('option', { value: v, selected: v === value }, [ko])));
  s.value = value;
  return s;
}
