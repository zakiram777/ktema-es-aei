/* ═══════════════════════════════════════════════════════════════
   view.js — 전략을 짜고 시험하는 화면

   왼쪽에서 규칙을 짜고, 누르면 오른쪽에 성적이 나온다. 성적에는
   반드시 '그냥 사서 들고 있었다면' 이 나란히 붙는다 — 그것을 이기지
   못하는 전략은 아무것도 아니기 때문이다.

   자산 곡선은 캔버스에 직접 그린다. 라이브러리를 들이지 않는 것이
   이 사이트의 방침이고, 줄 두 개 그리는 데 그럴 까닭도 없다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import * as store from '../core/store.js';
import { KINDS, kindById, blank, nameOf } from '../market/indicators.js';
import { run, SAMPLE, OPS, normalize } from './engine.js';
import { QUICK, nameOf as symName, RANGES } from '../market/symbols.js';

const STORE_KEY = 'strategy';

export class BacktestView {
  /** @param {{fetchBars:(symbol, range)=>Promise<object>}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.root = $('#backtest');
    this.strategy = load();
    this.symbol = store.get('btSymbol') || '^KS11';
    this.range = store.get('btRange') || '5y';
    this.result = null;
    this.busy = false;

    this.canvas = $('#btCanvas');
    this.#build();
  }

  /* ─────────────── 짓기 ─────────────── */

  #build() {
    this.#buildWhat();
    this.#buildIndicators();
    this.#buildRules();
    this.#buildGuards();
    $('#btRun').addEventListener('click', () => this.execute());
    // '보기 전략' 단추는 '짜 놓은 전략' 고르개로 바뀌었다 (ui/extras3.js).
    // 거기서 고른 것이 load() 로 들어온다.
  }

  /** 무엇을, 얼마나 긴 기간에 대고 볼 것인가 */
  #buildWhat() {
    const host = $('#btWhat');
    clear(host);

    const symSel = el('select.sel', {
      onchange: () => { this.symbol = symSel.value; store.set('btSymbol', this.symbol); },
    }, QUICK.map((s) => el('option', {
      value: s, text: symName(s) + ' (' + s + ')', selected: s === this.symbol,
    })));

    const own = el('input.sel__free', {
      type: 'text', placeholder: '다른 기호 (예: AAPL)', value: '',
      onchange: () => {
        const v = own.value.trim();
        if (v) { this.symbol = v; store.set('btSymbol', v); }
      },
    });

    // 시험은 길게 보아야 뜻이 있다. 짧은 구간은 뺀다.
    const longRanges = RANGES.filter((r) => ['1y', '5y'].includes(r.id));
    const rangeRow = el('div.seg', longRanges.map((r) => el('button', {
      type: 'button',
      class: r.id === this.range ? 'is-on' : '',
      text: r.label,
      onclick: () => {
        this.range = r.id;
        store.set('btRange', r.id);
        for (const b of rangeRow.children) b.classList.toggle('is-on', b.textContent === r.label);
      },
    })));

    host.append(
      el('div.bt__field', [el('label', { text: '무엇을' }), symSel]),
      el('div.bt__field', [el('label', { text: '또는 직접' }), own]),
      el('div.bt__field', [el('label', { text: '얼마 동안' }), rangeRow]),
    );
  }

  /** 이 전략이 쓸 지표들 */
  #buildIndicators() {
    const host = $('#btIndicators');
    clear(host);

    for (const ind of this.strategy.indicators) {
      host.appendChild(this.#indRow(ind));
    }

    host.appendChild(el('button.btn.btn--quiet.btn--tiny', {
      type: 'button',
      onclick: () => {
        const made = blank('sma');
        made.id = 'i' + Date.now().toString(36);
        this.strategy.indicators.push(made);
        save(this.strategy);
        this.#buildIndicators();
        this.#buildRules();
      },
    }, [ico('plus'), el('span.btn__label', { text: '지표 더하기' })]));
  }

  #indRow(ind) {
    const kindSel = el('select.sel.sel--sm', {
      onchange: () => {
        const made = blank(kindSel.value);
        ind.kind = made.kind;
        ind.cfg = made.cfg;
        save(this.strategy);
        this.#buildIndicators();
        this.#buildRules();
      },
    }, KINDS.map((k) => el('option', { value: k.id, text: k.ko, selected: k.id === ind.kind })));

    const k = kindById(ind.kind) || KINDS[0];
    const fields = k.fields.map((f) => el('label.bt__num', [
      el('span', { text: f.label }),
      el('input', {
        type: 'number', min: f.min, max: f.max, step: f.step || 1,
        value: String(ind.cfg[f.key] ?? f.def),
        oninput: (e) => {
          ind.cfg[f.key] = Number(e.target.value);
          save(this.strategy);
        },
      }),
    ]));

    return el('div.bt__ind', [
      el('code.bt__indid', { text: ind.id }),
      kindSel,
      ...fields,
      el('button.iconbtn.iconbtn--sm', {
        type: 'button', 'aria-label': '지우기',
        onclick: () => {
          this.strategy.indicators = this.strategy.indicators.filter((x) => x !== ind);
          save(this.strategy);
          this.#buildIndicators();
          this.#buildRules();
        },
      }, '×'),
    ]);
  }

  /** 언제 사고 언제 파는가 */
  #buildRules() {
    for (const side of ['entry', 'exit']) {
      const host = $(side === 'entry' ? '#btEntry' : '#btExit');
      clear(host);

      const modeKey = side + 'Mode';
      const mode = el('div.seg.seg--sm', [
        ['and', '모두 참일 때'], ['or', '하나라도 참일 때'],
      ].map(([id, label]) => el('button', {
        type: 'button',
        class: this.strategy[modeKey] === id ? 'is-on' : '',
        text: label,
        onclick: () => {
          this.strategy[modeKey] = id;
          save(this.strategy);
          for (const b of mode.children) b.classList.toggle('is-on', b.textContent === label);
        },
      })));
      host.appendChild(mode);

      for (const rule of this.strategy[side]) {
        host.appendChild(this.#ruleRow(rule, side));
      }

      host.appendChild(el('button.btn.btn--quiet.btn--tiny', {
        type: 'button',
        onclick: () => {
          const first = this.strategy.indicators[0];
          this.strategy[side].push({
            a: first ? { src: 'ind', ind: first.id, line: firstLine(first) } : { src: 'price' },
            op: side === 'entry' ? 'cross_up' : 'cross_dn',
            b: { src: 'const', value: 0 },
          });
          save(this.strategy);
          this.#buildRules();
        },
      }, [ico('plus'), el('span.btn__label', { text: '규칙 더하기' })]));
    }
  }

  #ruleRow(rule, side) {
    const mkSide = (which) => {
      const cur = rule[which] || { src: 'price' };
      const wrap = el('span.bt__side');

      const srcSel = el('select.sel.sel--sm', {
        onchange: () => {
          const v = srcSel.value;
          if (v === 'price') rule[which] = { src: 'price' };
          else if (v === 'const') rule[which] = { src: 'const', value: 0 };
          else {
            const first = this.strategy.indicators[0];
            rule[which] = { src: 'ind', ind: first?.id, line: firstLine(first) };
          }
          save(this.strategy);
          this.#buildRules();
        },
      }, [
        el('option', { value: 'price', text: '종가', selected: cur.src === 'price' }),
        el('option', { value: 'ind', text: '지표', selected: cur.src === 'ind' }),
        el('option', { value: 'const', text: '숫자', selected: cur.src === 'const' }),
      ]);
      wrap.appendChild(srcSel);

      if (cur.src === 'const') {
        wrap.appendChild(el('input.bt__constval', {
          type: 'number', step: 'any', value: String(cur.value ?? 0),
          oninput: (e) => { cur.value = Number(e.target.value); save(this.strategy); },
        }));
      }

      if (cur.src === 'ind') {
        const indSel = el('select.sel.sel--sm', {
          onchange: () => {
            cur.ind = indSel.value;
            const ind = this.strategy.indicators.find((i) => i.id === cur.ind);
            cur.line = firstLine(ind);
            save(this.strategy);
            this.#buildRules();
          },
        }, this.strategy.indicators.map((i) => el('option', {
          value: i.id, text: nameOf(i), selected: i.id === cur.ind,
        })));
        wrap.appendChild(indSel);

        const ind = this.strategy.indicators.find((i) => i.id === cur.ind);
        const lines = linesOf(ind);
        if (lines.length > 1) {
          wrap.appendChild(el('select.sel.sel--sm', {
            onchange: (e) => { cur.line = e.target.value; save(this.strategy); },
          }, lines.map((l) => el('option', { value: l.key, text: l.label, selected: l.key === cur.line }))));
        }
      }

      return wrap;
    };

    return el('div.bt__rule', [
      mkSide('a'),
      el('select.sel.sel--sm.sel--op', {
        onchange: (e) => { rule.op = e.target.value; save(this.strategy); },
      }, OPS.map((o) => el('option', { value: o.id, text: o.sym + ' ' + o.ko, selected: o.id === rule.op }))),
      mkSide('b'),
      el('button.iconbtn.iconbtn--sm', {
        type: 'button', 'aria-label': '지우기',
        onclick: () => {
          this.strategy[side] = this.strategy[side].filter((x) => x !== rule);
          save(this.strategy);
          this.#buildRules();
        },
      }, '×'),
    ]);
  }

  /** 손절·익절·수수료·밑천 */
  #buildGuards() {
    const host = $('#btGuards');
    clear(host);

    const num = (key, label, note, step = 1) => el('label.bt__num.bt__num--wide', [
      el('span', { text: label }),
      el('input', {
        type: 'number', step: String(step), min: '0',
        value: String(this.strategy[key] ?? 0),
        oninput: (e) => { this.strategy[key] = Number(e.target.value); save(this.strategy); },
      }),
      note ? el('small', { text: note }) : null,
    ]);

    host.append(
      num('stopPct', '손절 (%)', '이만큼 내리면 바로 판다. 0 이면 쓰지 않는다', 0.5),
      num('takePct', '익절 (%)', '이만큼 오르면 바로 판다. 0 이면 쓰지 않는다', 0.5),
      num('feeBps', '수수료 (bp)', '한 번 사고팔 때. 25 = 0.25%', 1),
      num('cash', '밑천 (원)', '', 100000),
    );
  }

  /* ─────────────── 시험 ─────────────── */

  /** 짜 놓은 전략 하나를 그대로 건다 (backtest/playbook.js) */
  load(strategy, name) {
    this.strategy = JSON.parse(JSON.stringify(strategy));
    if (name) this.strategy.name = name;
    save(this.strategy);
    this.#buildIndicators();
    this.#buildRules();
    this.#buildGuards();
  }

  async execute() {
    if (this.busy) return;
    this.busy = true;
    const btn = $('#btRun');
    btn.classList.add('is-busy');
    this.#say('시세를 부르는 중…');

    try {
      const q = await this.hooks.fetchBars(this.symbol, this.range);
      const bars = q?.bars || [];
      if (bars.length < 30) throw new Error('봉이 너무 적습니다 (' + bars.length + '개).');

      this.#say('셈하는 중…');
      const res = run(this.strategy, bars);
      if (!res.ok) throw new Error(res.why);

      // 지도 갈래가 이 봉을 그대로 쓴다. 백스물한 번 돌리자고 백스물한 번
      // 부를 까닭이 없다.
      this.bars = bars;
      this.result = { ...res, bars, name: q.ko || q.name || this.symbol };
      this.#paintResult();
    } catch (err) {
      this.#say('시험하지 못했습니다 — ' + (err?.message || err));
      clear($('#btTrades'));
      clear($('#btStats'));
    } finally {
      btn.classList.remove('is-busy');
      this.busy = false;
    }
  }

  #say(text) {
    const el0 = $('#btNote');
    if (el0) el0.textContent = text;
  }

  #paintResult() {
    const { stats, bars } = this.result;
    this.#say(this.result.name + ' · 봉 ' + bars.length + '개 · '
      + new Date(bars[0].t).toLocaleDateString('ko-KR') + ' 부터');

    /* ── 숫자 ── */
    const host = $('#btStats');
    clear(host);

    const card = (label, value, tone, note) => el('div.bt__stat', { data: { tone: tone || '' } }, [
      el('span.bt__statlabel', { text: label }),
      el('b.bt__statval', { text: value }),
      note ? el('small.bt__statnote', { text: note }) : null,
    ]);

    const pct = (v) => (v > 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
    const tone = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');

    host.append(
      card('총수익', pct(stats.totalRet), tone(stats.totalRet),
        Math.round(stats.end).toLocaleString('ko-KR') + '원'),
      card('연평균', pct(stats.cagr), tone(stats.cagr), stats.years.toFixed(1) + '년'),
      card('최대낙폭', pct(stats.mdd), 'down', '꼭대기에서 여기까지 내려갔었다'),
      card('사서 보유', pct(stats.holdRet), tone(stats.holdRet),
        '낙폭 ' + pct(stats.holdMdd)),
      card('초과', (stats.edge > 0 ? '+' : '') + (stats.edge * 100).toFixed(1) + '%p',
        tone(stats.edge), stats.edge > 0 ? '그냥 들고 있는 것보다 낫다' : '그냥 들고 있는 편이 나았다'),
      card('매매', stats.trades + '건',
        '', '이긴 것 ' + (stats.winRate * 100).toFixed(0) + '%'),
      card('손익비', stats.payoff ? stats.payoff.toFixed(2) : '—', '',
        '이겼을 때 / 졌을 때'),
      card('시장 체류', (stats.exposure * 100).toFixed(0) + '%', '',
        '나머지 기간은 쉬었다'),
    );

    this.#drawCurve();
    this.#paintTrades();
  }

  /** 자산 곡선 — 전략과 '사서 보유'를 겹쳐 그린다 */
  #drawCurve() {
    const c = this.canvas;
    if (!c || !this.result) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = c.getBoundingClientRect();
    const w = rect.width || 640;
    const h = rect.height || 260;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const { equity, holdCurve, bars, marks } = this.result;
    const pad = { l: 8, r: 58, t: 12, b: 20 };
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;

    const vals = [...equity, ...holdCurve].filter((v) => v != null);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi === lo) { hi += 1; lo -= 1; }
    const padv = (hi - lo) * 0.06;
    lo -= padv; hi += padv;

    const css = getComputedStyle(document.documentElement);
    const gold = css.getPropertyValue('--gold-400').trim() || '#d0ab63';
    const dim = css.getPropertyValue('--tx-600').trim() || '#4c4763';
    const line = css.getPropertyValue('--line').trim() || 'rgba(224,196,137,.14)';
    const up = css.getPropertyValue('--up').trim() || '#e2564a';
    const down = css.getPropertyValue('--down').trim() || '#4f92e6';

    const X = (i) => pad.l + (i / Math.max(1, bars.length - 1)) * iw;
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * ih;

    // 가로 눈금 넷
    g.strokeStyle = line;
    g.lineWidth = 1;
    g.font = '10px ui-monospace, monospace';
    g.fillStyle = dim;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4;
      const y = Math.round(Y(v)) + 0.5;
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + iw, y); g.stroke();
      const pctv = (v / this.result.stats.start - 1) * 100;
      g.fillText((pctv > 0 ? '+' : '') + pctv.toFixed(0) + '%', pad.l + iw + 6, y);
    }

    const stroke = (series, color, width, dash) => {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      let started = false;
      series.forEach((v, i) => {
        if (v == null) return;
        const x = X(i), y = Y(v);
        if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; }
      });
      g.stroke();
      g.restore();
    };

    stroke(holdCurve, dim, 1.2, [4, 3]);
    stroke(equity, gold, 1.8);

    // 사고판 자리
    for (const m of marks || []) {
      const v = equity[m.i];
      if (v == null) continue;
      g.fillStyle = m.kind === 'buy' ? up : down;
      g.beginPath();
      g.arc(X(m.i), Y(v), 2.6, 0, Math.PI * 2);
      g.fill();
    }

    // 범례
    g.textAlign = 'left';
    g.fillStyle = gold;
    g.fillText('전략', pad.l + 4, pad.t + 6);
    g.fillStyle = dim;
    g.fillText('사서 보유', pad.l + 40, pad.t + 6);
  }

  #paintTrades() {
    const host = $('#btTrades');
    clear(host);
    const { trades, bars } = this.result;

    if (!trades.length) {
      host.appendChild(el('p.bt__empty', {
        text: '이 규칙으로는 한 번도 사지 않았습니다. 규칙이 너무 좁은지 보십시오.',
      }));
      return;
    }

    const table = el('table.bt__table', [
      el('thead', el('tr', [
        el('th', '들어간 날'), el('th', '나온 날'), el('th', '든 날'),
        el('th', '산 값'), el('th', '판 값'), el('th', '결과'), el('th', '왜'),
      ])),
      el('tbody', trades.slice(-60).reverse().map((t) => el('tr', {
        class: t.open ? 'is-open' : '',
      }, [
        el('td', day(bars[t.from])),
        el('td', t.open ? '보유 중' : day(bars[t.to])),
        el('td', t.days + '일'),
        el('td.num', fmt(t.inPx)),
        el('td.num', fmt(t.outPx)),
        el('td.num', {
          class: t.ret > 0 ? 'up' : t.ret < 0 ? 'down' : '',
          text: (t.ret > 0 ? '+' : '') + (t.ret * 100).toFixed(2) + '%',
        }),
        el('td', { text: t.why || '규칙' }),
      ]))),
    ]);
    host.appendChild(table);
  }

  /** 화면이 다시 보일 때 곡선을 다시 그린다 (숨어 있는 동안 크기를 못 잰다) */
  refresh() {
    if (this.result) this.#drawCurve();
  }
}

/* ─────────────── 거들기 ─────────────── */

function linesOf(ind) {
  if (!ind) return [];
  const k = kindById(ind.kind);
  if (!k) return [];
  const out = k.calc([{ c: 1, o: 1, h: 1, l: 1, t: 0, v: 1 }], ind.cfg || {});
  const lines = (out.lines || []).map((l) => ({ key: l.key, label: l.label }));
  if (out.histogram) lines.push({ key: out.histogram.key, label: out.histogram.label });
  return lines;
}

const firstLine = (ind) => linesOf(ind)[0]?.key || 'ma';
const day = (b) => (b ? new Date(b.t).toLocaleDateString('ko-KR', { year: '2-digit', month: 'numeric', day: 'numeric' }) : '—');
const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—');

function load() {
  const saved = store.get(STORE_KEY);
  if (saved && Array.isArray(saved.indicators)) return normalize({ ...saved, indicators: saved.indicators, entry: saved.entry, exit: saved.exit });
  return JSON.parse(JSON.stringify(SAMPLE));
}

function save(s) {
  store.set(STORE_KEY, JSON.parse(JSON.stringify(s)));
}
