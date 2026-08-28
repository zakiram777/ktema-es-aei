/* ═══════════════════════════════════════════════════════════════
   extras2.js — 나쁠 때만 드러나는 판들과 배당, 그리고 규칙

     무너지는 상관   분산이 필요한 순간에 분산이 사라지는 것을 보인다
     스트레스 재생   실제로 있었던 구간을 지금 조합에 대어 본다
     배당            오래 든 사람의 본 숫자
     규칙 감시       내가 내 규칙을 지켰나

   앞의 둘을 한 판에 묶은 까닭은 묻는 것이 같아서다 — "평소 말고
   나쁠 때는 어떤가". 평소와 나쁠 때가 다르다는 것이 요점이고,
   대개 아주 다르다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { px, pct, num, dir, big, dayStamp } from '../core/fmt.js';
import * as store from '../core/store.js';
import { stressMatrix, replay, EPISODES, episodeById } from '../market/analysis.js';
import * as dividends from '../market/dividends.js';
import * as rules from '../journal/rules.js';
import * as book from '../portfolio/book.js';
import { nameOf } from '../market/symbols.js';

/* ═══════════════════ 나쁠 때 ═══════════════════ */

export class StressPanel {
  /**
   * @param {{onSymbol, series, marketSym, value, fetchLong}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#ana2');
    this.ep = store.get('stressEp') || 'covid';
    this.long = null;      // 스무 해치 — 되짚으려면 그때 값이 있어야 한다
  }

  /* 되짚을 구간은 2008·2011·2018·2020·2022 다. 분석이 받아 둔 두 해치로는
     그 구간에 값이 하나도 없다. 그래서 여기만 따로 길게 받는다.

     묶음 부름 한 번이면 되고 (다섯 종목 스무 해치가 0.5초쯤), 스트레스
     판을 열 때만 나가므로 평소에는 아무 값도 안 든다. */
  async loadLong() {
    if (this.long || this.busy) return;
    const series = this.hooks.series() || [];
    if (!series.length) return;

    this.busy = true;
    try {
      const syms = [...new Set([
        this.hooks.marketSym?.() || '^KS11',
        ...book.positions().rows.filter((p) => p.open).map((p) => p.symbol),
        ...series.slice(0, 10).map((s) => s.symbol),
      ])].slice(0, 14);

      this.long = await this.hooks.fetchLong(syms);
      this.paint();
    } catch (err) {
      console.warn('[stress]', err);
      this.longFailed = err.message;
    } finally {
      this.busy = false;
    }
  }

  paint() {
    if (!this.host) return;
    clear(this.host);

    const series = this.hooks.series() || [];
    if (series.length < 3) {
      this.host.appendChild(el('p.ana__wait', { text: '분석을 한 번 부르면 여기도 채워집니다.' }));
      return;
    }

    this.later = [];
    this.host.append(this.#collapse(series), this.#replay(series));
    for (const fn of this.later) fn();
    this.later = null;
  }

  /* ── 무너지는 상관 ── */

  #collapse(series) {
    const mktSym = this.hooks.marketSym?.() || '^KS11';
    const mkt = series.find((s) => s.symbol === mktSym) || series[0];
    const others = series.filter((s) => s.symbol !== mkt.symbol).slice(0, 10);

    const rows = stressMatrix(others, mkt.bars, { drop: -2 });

    if (!rows.length) {
      return el('section.ana__block', [
        el('div.ana__h', [el('span', { text: '무너지는 상관' })]),
        el('p.ana__why', { text: '겹치는 날이 모자라 셈하지 못했습니다.' }),
      ]);
    }

    const top = rows.slice(0, 10);
    const worst = top[0];

    return el('section.ana__block', [
      el('div.ana__h', [
        el('span', { text: '무너지는 상관' }),
        el('small', { text: `${mkt.ko || mkt.symbol} 가 2% 넘게 내린 날만 골라 다시 잼` }),
      ]),
      el('p.ana__why', {
        text: '열지도는 평균을 보여 줍니다. 그런데 상관은 폭락할 때 1로 '
            + '수렴합니다 — 분산이 필요한 바로 그 순간에. 아래는 평소와 '
            + '나쁠 때가 가장 크게 벌어진 짝들입니다.',
      }),

      worst && Number.isFinite(worst.collapse) ? el('div.mix__verdict', {
        class: worst.collapse > 0.3 ? 'is-bad' : worst.collapse > 0.15 ? '' : 'is-good',
      }, [
        el('b', {
          text: `${worst.a} 와 ${worst.b} — 평소 ${worst.calm.toFixed(2)}, `
              + `내리는 날 ${worst.bad.toFixed(2)}`,
        }),
        el('span', {
          text: worst.collapse > 0.3
            ? '평소에는 따로 움직이는 것처럼 보이지만 나쁜 날에는 함께 내립니다. '
              + '나눠 담았다는 믿음이 가장 필요한 순간에 배신하는 짝입니다.'
            : worst.collapse > 0.15
              ? '나쁜 날에 조금 더 붙습니다. 흔한 정도입니다.'
              : '나쁜 날에도 관계가 크게 달라지지 않습니다. 드문 일입니다.',
        }),
      ]) : null,

      el('div.cc', [
        el('div.cc__head', [
          el('span', { text: '짝' }),
          el('span', { text: '평소' }),
          el('span', { text: '내리는 날' }),
          el('span', { text: '벌어짐' }),
          el('span', { text: '표본' }),
        ]),
        ...top.map((r) => el('div.cc__row', {
          title: `${r.a} · ${r.b} — 전체 ${r.n}일 중 내린 날 ${r.nBad}일`,
          onclick: () => this.hooks.onSymbol?.(r.aSym),
        }, [
          el('span.cc__pair', { text: `${r.a} · ${r.b}` }),
          el('span.cc__n', { text: r.calm.toFixed(2) }),
          el('span.cc__n', { class: r.bad > 0.7 ? 'up' : '', text: r.bad.toFixed(2) }),
          el('span.cc__bar', [
            el('i', {
              class: r.collapse > 0.3 ? 'is-bad' : '',
              style: { width: Math.min(100, Math.abs(r.collapse) * 140) + '%' },
            }),
            el('b', { text: (r.collapse > 0 ? '+' : '') + r.collapse.toFixed(2) }),
          ]),
          el('span.cc__n', { class: r.thin ? 'is-thin' : '', text: r.nBad + '일' }),
        ])),
      ]),
    ]);
  }

  /* ── 스트레스 재생 ── */

  #replay(short) {
    // 되짚기에는 긴 이력을 쓴다. 아직 없으면 받아 오고 그동안은 그렇게 말한다.
    const series = this.long || null;
    const mktSym = this.hooks.marketSym?.() || '^KS11';

    if (!series) {
      const box = el('section.ana__block', [
        el('div.ana__h', [
          el('span', { text: '그때를 지금 조합으로' }),
          el('small', { text: '실제로 있었던 구간을 그대로 대어 본다' }),
        ]),
        el('p.ana__wait', {
          text: this.longFailed
            ? '긴 이력을 받지 못했습니다: ' + this.longFailed
            : '스무 해치를 부르는 중… (2008년까지 되짚으려면 필요합니다)',
        }),
      ]);
      this.later.push(() => this.loadLong());
      return box;
    }

    const mkt = series.find((s) => s.symbol === mktSym) || series[0];

    /* 장부가 있으면 내 비중으로, 없으면 고르게.

       무게는 반드시 한 돈으로 모아야 한다. 취득가를 그대로 쓰면
       원화 420만과 달러 8천이 나란히 놓여 원화 쪽이 다 먹는다 —
       실제로 그렇게 되어 삼성전자 100%, 나머지 0% 가 나왔었다.
       환율을 못 받으면 고르게 담은 것으로 본다. */
    const rateOf = this.hooks.rateOf || (() => null);
    const pos = book.positions().rows.filter((p) => p.open);

    let mixed = false;
    const weights = pos.map((p) => {
      const r = p.currency === 'KRW' ? 1 : rateOf(p.currency);
      if (r == null) mixed = true;
      return p.cost * (r ?? 1);
    });

    const holdings = pos.length
      ? pos.map((p, i) => {
        const s = series.find((x) => x.symbol === p.symbol);
        return s ? { symbol: p.symbol, ko: p.ko, bars: s.bars, weight: mixed ? 1 : weights[i] } : null;
      }).filter(Boolean)
      : series.slice(0, 10).map((s) => ({ symbol: s.symbol, ko: s.ko || s.symbol, bars: s.bars, weight: 1 }));

    this.weightMixed = mixed && pos.length > 0;

    const value = this.hooks.value?.() || null;
    const out = el('div.sr__out');

    const draw = () => {
      clear(out);
      const ep = episodeById(this.ep);
      const got = replay(holdings, mkt.bars, ep, { value });

      if (!got || !got.ok) {
        out.appendChild(el('p.ana__why', { text: got?.why || '되짚지 못했습니다.' }));
        return;
      }

      const tone = got.total < -25 ? 'is-bad' : got.total < -10 ? '' : 'is-good';

      out.append(
        el('p.ana__why', { text: ep.note }),
        el('div.mix__verdict', { class: tone }, [
          el('b', {
            text: `${ep.ko} 를 지금 조합으로 겪었다면 ${pct(got.total, 1)}`
                + (got.amount != null ? ` — ${big(got.amount)}` : ''),
          }),
          el('span', {
            text: `${got.days}일 동안입니다. 같은 기간 ${mkt.ko || mkt.symbol} 는 `
                + `${pct(got.mktRet, 1)} 였습니다.`
                + (!pos.length ? ' 고르게 담았다고 보았습니다.'
                  : this.weightMixed
                    ? ' 환율을 못 받아 고르게 담은 것으로 셈했습니다 — 실제 비중과 다릅니다.'
                    : ' 장부의 비중으로 셈했습니다.'),
          }),
        ]),

        el('div.sr__rows', got.rows.map((r) => el('div.sr__row', {
          onclick: () => this.hooks.onSymbol?.(r.symbol),
          title: r.how === 'beta'
            ? `그때 없던 것이라 베타 ${r.beta.toFixed(2)} 로 갈음했습니다 (설명력 ${(r.r2 * 100).toFixed(0)}%)`
            : '실제로 있었던 값입니다',
        }, [
          el('span.sr__ko', [
            el('b', { text: r.ko }),
            r.how === 'beta' ? el('span.sr__est', { text: '갈음' }) : null,
          ]),
          el('span.sr__w', { text: (r.w * 100).toFixed(0) + '%' }),
          el('span.sr__bar', [
            el('i', { style: { width: Math.min(100, Math.abs(r.ret) * 1.4) + '%' } }),
          ]),
          el('span.sr__n', { class: dir(r.ret), text: pct(r.ret, 1) }),
          el('span.sr__n', { class: 'down', title: '그 구간 가장 나빴던 하루', text: pct(r.worst, 1) }),
        ]))),

        got.estimatedCount ? el('p.ana__why', {
          class: got.estimatedWeight > 50 ? 'is-warn' : '',
          text: `${got.estimatedCount}가지(비중 ${got.estimatedWeight.toFixed(0)}%)는 그때 값이 없어 `
              + '지수에 대한 베타로 갈음했습니다. '
              + (got.estimatedWeight > 50
                ? '절반을 넘으므로 이 숫자는 재생이라기보다 짐작입니다.'
                : '갈음한 것에는 표를 달아 두었습니다.'),
        }) : null,

        el('p.ana__why', {
          text: '이것은 예측이 아니라 재생입니다 — "그때가 다시 오면" 이 아니라 '
              + '"그때를 지금 조합으로 겪었다면". 다음 하락이 이 모양일 까닭은 '
              + '없습니다. 다만 이 정도가 있었던 일이라는 것은 사실입니다.',
        }),
      );
    };

    const picker = el('div.sr__eps', EPISODES.map((e) => el('button', {
      type: 'button',
      class: e.id === this.ep ? 'is-on' : '',
      title: e.note,
      onclick: (ev) => {
        this.ep = e.id;
        store.set('stressEp', e.id);
        for (const b of picker.children) b.classList.toggle('is-on', b === ev.currentTarget);
        draw();
      },
    }, [
      el('span.tab__gr', { text: e.gr }),
      el('span.tab__ko', { text: e.ko }),
    ])));

    this.later.push(draw);

    return el('section.ana__block', [
      el('div.ana__h', [
        el('span', { text: '그때를 지금 조합으로' }),
        el('small', { text: '실제로 있었던 구간을 그대로 대어 본다' }),
      ]),
      picker,
      out,
    ]);
  }
}

/* ═══════════════════ 배당 ═══════════════════ */

export class DivPanel {
  constructor() {
    this.host = $('#divsBody');
    this.box = $('#divs');
    this.symbol = null;
  }

  toggle(symbol) {
    if (!this.box) return;
    this.box.hidden = !this.box.hidden;
    if (!this.box.hidden) {
      this.box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.load(symbol);
    }
  }

  async load(symbol) {
    if (!this.host || symbol === this.symbol) return;
    this.symbol = symbol;

    clear(this.host);
    this.host.appendChild(el('p.ana__wait', { text: symbol + ' 의 배당 이력을 부르는 중…' }));

    try {
      const h = await dividends.history(symbol, { years: 10 });
      clear(this.host);
      if (!h.count) {
        this.host.appendChild(el('p.ana__wait', {
          text: '배당을 준 적이 없습니다 (또는 이력이 남아 있지 않습니다).',
        }));
        return;
      }
      this.#paint(h);
    } catch (err) {
      clear(this.host);
      this.host.appendChild(el('p.ana__wait.is-bad', { text: '받지 못했습니다: ' + err.message }));
      this.symbol = null;
    }
  }

  #paint(h) {
    // 장부에 있으면 내 것으로도 낸다
    const pos = book.positions().rows.find((p) => p.symbol === h.symbol && p.open);
    const mine = pos ? dividends.mine(h, pos) : null;
    const re = dividends.reinvested(h, { qty: 1 });

    const maxYear = Math.max(...h.byYear.map(([, v]) => v));

    clear(this.host);
    this.host.append(
      el('div.bt__stats', [
        stat('최근 열두 달', px(h.ttm), ''),
        stat('지금 값 대비', h.yield != null ? h.yield.toFixed(2) + '%' : '—', ''),
        mine ? stat('취득가 대비', mine.onCost != null ? mine.onCost.toFixed(2) + '%' : '—', 'up') : null,
        mine ? stat('내 연 배당', big(mine.annual), 'up') : null,
        stat('연평균 성장', h.growth != null ? pct(h.growth, 1) : '—', h.growth != null ? dir(h.growth) : ''),
        stat('한 해에', h.perYear ? h.perYear + '번' : '—', ''),
      ].filter(Boolean)),

      mine ? el('div.mix__verdict.is-good', [
        el('b', {
          text: `취득가 대비 ${mine.onCost.toFixed(2)}% — 지금 값 대비 ${h.yield.toFixed(2)}% 보다 `
              + (mine.onCost > h.yield ? '높습니다' : '낮습니다'),
        }),
        el('span', {
          text: mine.onCost > h.yield
            ? '싸게 산 만큼 나에게는 더 높은 배당률입니다. 새로 사는 사람의 숫자와 '
              + '내 숫자가 다른 까닭이고, 나에게 맞는 쪽은 이쪽입니다.'
            : '취득가가 지금 값보다 높습니다. 물려 있다는 뜻이지만, 배당은 그와 '
              + '상관없이 계속 들어옵니다.',
        }),
      ]) : null,

      el('div.ana__sub', [
        el('h4', [el('span', { text: '해마다 준 것' }),
          el('small', {
            text: '분할을 되짚어 지금 주식 기준으로 맞춤'
                + (h.growthFrom ? ` · 성장률은 ${h.growthFrom}–${h.growthTo}년으로 잼` : ''),
          })]),
        el('div.dv', h.byYear.map(([y, v]) => el('div.dv__row', {
          // 반쪽인 해는 옅게 — 받아 온 구간이 해 가운데서 시작하거나
          // 올해가 아직 안 끝난 경우다. 성장률에서도 빼 두었다.
          class: (h.partial || []).includes(y) ? 'is-partial' : '',
          title: `${y}년 ${px(v)}`
            + ((h.partial || []).includes(y) ? ` — ${h.perYearUsual}번 중 일부만 있어 성장률에서 뺐습니다` : ''),
        }, [
          el('span.dv__y', { text: String(y).slice(2) + '년' }),
          el('span.dv__bar', [el('i', { style: { width: (v / maxYear) * 100 + '%' } })]),
          el('span.dv__v', { text: px(v) }),
        ]))),
      ]),

      h.gaps.length ? el('p.ana__why', {
        class: 'is-warn',
        text: '배당이 크게 줄었던 해가 있습니다 — '
            + h.gaps.map((g) => `${g.year}년(${px(g.from)} → ${px(g.to)})`).join(', ')
            + '. 배당은 약속이 아니라 그때그때의 결정입니다.',
      }) : el('p.ana__why', { text: '받은 뒤로 크게 줄인 적은 없습니다.' }),

      re ? el('div.ana__sub', [
        el('h4', [el('span', { text: '배당을 다시 사들였다면' }),
          el('small', { text: '한 주로 시작해 배당락일마다 되사기' })]),
        el('div.bt__stats', [
          stat('값만 오른 몫', pct(re.priceRet, 1), dir(re.priceRet)),
          stat('배당까지 넣으면', pct(re.totalRet, 1), dir(re.totalRet)),
          stat('배당이 보탠 몫', pct(re.divShare, 1), 'up'),
          stat('늘어난 주식', re.added.toFixed(3) + '주', 'up'),
        ]),
        el('p.ana__why', {
          text: '긴 시간에서는 이 차이가 수익의 절반쯤을 냅니다. 그런데 대부분의 '
              + '차트는 배당을 아예 안 그립니다 — 값만 그리므로. 여기서는 세금을 '
              + '빼지 않았으니 실제로는 조금 낮습니다.',
        }),
      ]) : null,
    );
  }
}

/* ═══════════════════ 규칙 감시 ═══════════════════ */

export class RulePanel {
  /** @param {{barsOf:(sym)=>Array, symbols:()=>Array, onSymbol, notice}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#jrules');
  }

  paint() {
    if (!this.host) return;
    clear(this.host);

    const got = rules.checkAll((sym) => this.hooks.barsOf(sym) || []);

    this.host.append(
      el('div.jscore__head', [
        el('span', { text: '내가 내 규칙을 지켰나' }),
        el('small', {
          text: got.total
            ? `${got.total}개 · 살아 있는 것 ${got.live}개 · 걸린 것 ${got.hits}개`
            : '아직 건 규칙이 없습니다',
        }),
      ]),

      el('p.ana__why', {
        text: '일지 성적표가 "판단이 맞았나" 를 채점한다면, 이것은 "내가 적어 둔 '
            + '대로 했나" 를 채점합니다. 대부분의 손실은 규칙이 틀려서가 아니라 '
            + '안 지켜서 납니다.',
      }),

      this.#form(),
      got.total ? this.#list(got) : null,
      got.hits ? el('div.jscore__verdict', { class: 'is-' + got.verdict.tone }, [
        el('span', { text: got.verdict.text }),
      ]) : null,
    );
  }

  #form() {
    const state = {
      symbol: this.hooks.symbols?.()[0]?.symbol || '',
      what: 'fromBuy', op: 'lte', value: -10, action: 'sell', note: '',
    };

    const symSel = el('select.sel.sel--sm', {
      onchange: (e) => { state.symbol = e.target.value; },
    }, (this.hooks.symbols?.() || []).map((w) => el('option', {
      value: w.symbol, text: w.ko || nameOf(w.symbol), selected: w.symbol === state.symbol,
    })));

    const whatSel = el('select.sel.sel--sm', {
      onchange: (e) => { state.what = e.target.value; },
    }, rules.WHATS.map((w) => el('option', { value: w.id, text: w.ko, selected: w.id === state.what })));

    const opSel = el('select.sel.sel--sm', {
      onchange: (e) => { state.op = e.target.value; },
    }, rules.OPS.map((o) => el('option', { value: o.id, text: o.ko, selected: o.id === state.op })));

    const valIn = el('input.jr__val', {
      type: 'number', step: 'any', value: String(state.value),
      oninput: (e) => { state.value = Number(e.target.value); },
    });

    const actSel = el('select.sel.sel--sm', {
      onchange: (e) => { state.action = e.target.value; },
    }, rules.ACTIONS.map((a) => el('option', { value: a.id, text: a.ko, selected: a.id === state.action })));

    return el('div.jrules__form', [
      symSel, whatSel, valIn, opSel, actSel,
      el('input.jr__note', {
        type: 'text', placeholder: '왜 이렇게 정했는지 한 줄', maxlength: '200',
        oninput: (e) => { state.note = e.target.value; },
      }),
      el('button.btn.btn--key.btn--tiny', {
        type: 'button',
        onclick: () => {
          const bars = this.hooks.barsOf(state.symbol);
          const at0 = bars?.length ? bars[bars.length - 1].c : null;

          // '산 값에서' 는 장부의 평균단가를 기준으로 삼는다
          const pos = book.positions().rows.find((p) => p.symbol === state.symbol && p.open);
          const base = state.what === 'fromBuy' ? (pos?.avg ?? at0) : null;

          const saved = rules.save({ ...state, at0, base });
          if (!saved) { this.hooks.notice?.('종목과 숫자는 있어야 합니다.'); return; }
          this.paint();
        },
      }, [ico('plus'), el('span.btn__label', { text: '건다' })]),
    ]);
  }

  #list(got) {
    return el('div.jrules__list', got.rows.map(({ rule, got: g }) => {
      const tone = g.state === 'hit'
        ? (g.missed == null ? '' : g.missed > 0 ? 'is-bad' : 'is-good')
        : g.state === 'off' ? 'is-off' : '';

      return el('div.jrule', { class: tone }, [
        el('div.jrule__top', [
          el('b', { text: rules.text(rule) }),
          el('span.jrule__when', { text: dayStamp(new Date(rule.at)) + ' 부터' }),
          el('button.jrule__x', {
            type: 'button', title: rule.done ? '다시 켠다' : '끈다',
            onclick: () => { rules.toggle(rule.id); this.paint(); },
          }, rule.done ? '켜기' : '끄기'),
          el('button.jrule__x', {
            type: 'button', title: '지운다',
            onclick: () => { rules.remove(rule.id); this.paint(); },
          }, '×'),
        ]),

        rule.note ? el('p.jrule__note', { text: rule.note }) : null,
        el('p.jrule__say', { text: sayOf(g, rule) }),
      ]);
    }));
  }
}

/* 규칙 하나의 상태를 사람의 말로 */
function sayOf(g, rule) {
  if (g.state === 'off') return '꺼 두었습니다.';
  if (g.state === 'nodata') return '시세가 없어 아직 볼 수 없습니다.';
  if (g.state === 'young') return '건 지 얼마 안 됐습니다.';

  if (g.state === 'holding') {
    const gap = g.gap;
    return gap == null
      ? '아직 걸리지 않았습니다.'
      : `아직 걸리지 않았습니다 — 문턱까지 ${Math.abs(gap).toFixed(1)}${g.unit || ''} 남았습니다.`;
  }

  const when = dayStamp(new Date(g.firstAt));
  const head = `${when} 에 걸렸습니다 (${px(g.firstPx)}). 그 뒤로 ${pct(g.since, 1)}.`;

  if (g.missed == null) return head + ' 들여다보기로 한 규칙이라 견줄 것은 없습니다.';
  if (g.missed > 0.5) {
    return head + ` 그대로 했다면 지금보다 ${g.missed.toFixed(1)}% 나았습니다.`;
  }
  if (g.missed < -0.5) {
    return head + ` 안 지킨 편이 ${Math.abs(g.missed).toFixed(1)}% 나았습니다.`;
  }
  return head + ' 지켰든 안 지켰든 거의 같았습니다.';
}

const stat = (k, v, tone) => el('div.bt__stat', { data: { tone: tone || '' } }, [
  el('span.bt__statk', { text: k }),
  el('span.bt__statval', { text: v }),
]);
