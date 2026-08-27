/* ═══════════════════════════════════════════════════════════════
   labview.js — 시험 화면의 나머지 두 갈래

   규칙 갈래(view.js)는 "언제 사고 언제 파나" 를 묻는다. 여기 둘은
   다른 것을 묻는다.

     비중   무엇을 얼마나 담고, 얼마 만에 원래대로 되돌리나
     지도   그 좋아 보이는 숫자가 우연인가

   두 갈래를 한 파일에 둔 까닭은 둘 다 규칙 갈래에 얹혀 사는
   곁가지라서다. 비중은 봉을 여럿 부르고, 지도는 규칙 갈래가 짜 둔
   전략을 그대로 가져다 쓴다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico, wait } from '../core/dom.js';
import { pct, num, dir, big } from '../core/fmt.js';
import { on } from '../core/bus.js';
import * as store from '../core/store.js';
import { DEFAULT_WATCH, RANGES, nameOf } from '../market/symbols.js';
import { rebalance, dcaVsLump, PERIODS } from './portfolio.js';
import { knobs, steps, grid, walkForward, SCORES, scoreById } from './sweep.js';

/* ═══════════════════ 비중 ═══════════════════ */

export class MixView {
  /** @param {{fetchSeries:(syms, range)=>Promise<Array>, fetchBars:(sym, range)=>Promise<object>}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#mix');
    this.cfg = load();
    this.result = null;
    this.dca = null;
    this.busy = false;
    this.#build();

    /* 담을 것은 관심종목에서 고른다. 그러니 관심종목이 바뀌면 이 목록도
       따라와야 한다 — 안 그러면 방금 더한 것이 여기에는 없다. */
    on('settings:changed', ({ key }) => {
      if (key === 'watch') this.#build();
    });
  }

  #build() {
    clear(this.host);
    this.host.append(this.#form(), this.#out());
    // 이미 돌려 본 것이 있으면 그대로 다시 걸어 준다. 목록 하나 바뀌었다고
    // 방금 본 성적이 사라지면 성가시다.
    if (this.result) this.#paint(this.result, this.dca, this.lastSeries || []);
  }

  #form() {
    const watch = store.get('watch') || DEFAULT_WATCH;

    // 담을 것 고르기 — 비중은 슬라이더가 아니라 숫자로 받는다.
    // 슬라이더는 합이 100이 되게 서로 밀어야 하는데, 그러면 손을 댈
    // 때마다 다른 것들이 움직여서 무엇을 정했는지 알 수 없어진다.
    const rows = el('div.mix__rows');
    const paintRows = () => {
      clear(rows);
      for (const w of watch) {
        const picked = this.cfg.picks[w.symbol] != null;
        const box = el('input', { type: 'checkbox' });
        box.checked = picked;
        box.addEventListener('change', () => {
          if (box.checked) this.cfg.picks[w.symbol] = 10;
          else delete this.cfg.picks[w.symbol];
          save(this.cfg);
          paintRows();
          paintSum();
        });

        // 이름을 num 으로 두면 fmt 의 num() 을 가린다. 한 번 데었다.
        const wIn = el('input.mix__w', {
          type: 'number', min: '0', max: '100', step: '1',
          value: String(this.cfg.picks[w.symbol] ?? ''),
          disabled: !picked,
          oninput: (e) => {
            this.cfg.picks[w.symbol] = Number(e.target.value) || 0;
            save(this.cfg);
            paintSum();
          },
        });

        rows.appendChild(el('label.mix__row', { class: picked ? 'is-on' : '' }, [
          el('span.switch.switch--bare', [box, el('span.switch__track', [el('span.switch__dot')])]),
          el('span.mix__ko', { text: w.ko || nameOf(w.symbol) }),
          el('code', { text: w.symbol }),
          wIn,
          el('span.mix__pctsign', { text: '%' }),
        ]));
      }
    };

    const sum = el('span.mix__sum');
    const paintSum = () => {
      const vals = Object.values(this.cfg.picks);
      const total = vals.reduce((a, b) => a + (Number(b) || 0), 0);
      sum.textContent = vals.length
        ? `${vals.length}가지 · 합 ${total}%` + (total !== 100 ? ' → 100%로 고쳐 셈합니다' : '')
        : '아직 고른 것이 없습니다';
      sum.className = 'mix__sum' + (vals.length && total !== 100 ? ' is-warn' : '');
    };

    paintRows();
    paintSum();

    const periodSel = el('select.sel', {
      onchange: (e) => { this.cfg.period = e.target.value; save(this.cfg); },
    }, PERIODS.map((p) => el('option', {
      value: p.id, text: p.ko, title: p.note || '', selected: p.id === this.cfg.period,
    })));

    const rangeSel = el('select.sel', {
      onchange: (e) => { this.cfg.range = e.target.value; save(this.cfg); },
    }, RANGES.filter((r) => r.interval !== '30m').map((r) => el('option', {
      value: r.id, text: r.label, selected: r.id === this.cfg.range,
    })));

    return el('div.mix__form', [
      el('div.mix__block', [
        el('h3.bt__h', { text: '무엇을 얼마나' }),
        rows,
        sum,
      ]),
      el('div.mix__block', [
        el('h3.bt__h', { text: '어떻게' }),
        el('div.bt__field', [el('label', { text: '되돌리기' }), periodSel]),
        el('div.bt__field', [el('label', { text: '얼마 동안' }), rangeSel]),
        el('label.bt__num', [
          el('span', { text: '어긋남 밴드 %' }),
          el('input', {
            type: 'number', min: '1', max: '30', step: '1',
            value: String(this.cfg.bandPct),
            oninput: (e) => { this.cfg.bandPct = Number(e.target.value) || 5; save(this.cfg); },
          }),
          el('small', { text: '“어긋나면” 을 골랐을 때만 씁니다' }),
        ]),
        el('label.bt__num', [
          el('span', { text: '수수료 (만분율)' }),
          el('input', {
            type: 'number', min: '0', max: '200', step: '1',
            value: String(this.cfg.feeBps),
            oninput: (e) => { this.cfg.feeBps = Number(e.target.value) || 0; save(this.cfg); },
          }),
          el('small', { text: '25 = 0.25%. 옮기는 금액에만 뭅니다' }),
        ]),
        el('label.bt__num', [
          el('span', { text: '적립식 — 달마다' }),
          el('input', {
            type: 'number', min: '0', step: '100000',
            value: String(this.cfg.monthly),
            oninput: (e) => { this.cfg.monthly = Number(e.target.value) || 0; save(this.cfg); },
          }),
          el('small', { text: '첫 번째로 고른 것으로 적립식과 일시납을 견줍니다' }),
        ]),
        el('button.btn.btn--key', {
          type: 'button',
          onclick: (e) => this.run(e.currentTarget),
        }, [ico('flask'), el('span.btn__label', { text: '돌려 본다' })]),
      ]),
    ]);
  }

  #out() {
    this.outEl = el('div.mix__out', [
      el('p.bt__note', { text: '담을 것을 고르고 “돌려 본다”를 누르십시오.' }),
    ]);
    return this.outEl;
  }

  async run(btn) {
    if (this.busy) return;
    const syms = Object.keys(this.cfg.picks);
    if (syms.length < 1) {
      clear(this.outEl);
      this.outEl.appendChild(el('p.bt__note.is-bad', { text: '적어도 하나는 골라야 합니다.' }));
      return;
    }

    this.busy = true;
    btn?.classList.add('is-busy');
    clear(this.outEl);
    this.outEl.appendChild(el('p.bt__note', { text: '시세를 부르는 중…' }));

    try {
      const series = await this.hooks.fetchSeries(syms, this.cfg.range);
      const weights = series.map((s) => this.cfg.picks[s.symbol] ?? 0);

      const got = rebalance(series, {
        weights,
        period: this.cfg.period,
        bandPct: this.cfg.bandPct,
        feeBps: this.cfg.feeBps,
        cash: 10_000_000,
      });

      const dca = this.cfg.monthly > 0 && series[0]?.bars?.length
        ? dcaVsLump(series[0].bars, { monthly: this.cfg.monthly, feeBps: this.cfg.feeBps })
        : null;

      this.result = got;
      this.dca = dca;
      this.lastSeries = series;
      this.#paint(got, dca, series);
    } catch (err) {
      clear(this.outEl);
      this.outEl.appendChild(el('p.bt__note.is-bad', { text: '시세를 받지 못했습니다: ' + err.message }));
    } finally {
      this.busy = false;
      btn?.classList.remove('is-busy');
    }
  }

  #paint(r, dca, series) {
    clear(this.outEl);
    if (!r.ok) {
      this.outEl.appendChild(el('p.bt__note.is-bad', { text: r.why }));
      return;
    }

    const period = PERIODS.find((p) => p.id === this.cfg.period);
    const edge = r.ret - r.holdScore.ret;

    this.outEl.append(
      el('div.bt__stats', [
        stat('전체 수익', pct(r.ret, 1), dir(r.ret)),
        stat('연평균', pct(r.cagr, 1), dir(r.cagr)),
        stat('최대 낙폭', pct(r.mdd, 1), 'down'),
        stat('흔들림', r.vol.toFixed(1) + '%', ''),
        stat('되돌린 횟수', String(r.events.length), ''),
        stat('옮긴 금액', big(r.turnover), ''),
      ]),

      // 되돌리기가 실제로 값을 했나 — 이것이 이 판의 물음이다
      el('div.mix__verdict', { class: edge > 0.5 ? 'is-good' : edge < -0.5 ? 'is-bad' : '' }, [
        el('b', {
          text: period.id === 'none' ? '되돌리지 않았습니다'
            : r.events.length === 0 ? `${period.ko} 로 두었지만 한 번도 걸리지 않았습니다`
            : `${period.ko} ${r.events.length}번 되돌렸고, 그냥 둔 쪽보다 ${pct(edge, 1)}`,
        }),
        el('span', {
          text: period.id === 'none'
            ? '위에서 되돌리기 주기를 골라 견주어 보십시오.'
            : r.events.length === 0
              ? '기간이 짧거나, “어긋나면” 밴드가 넓어 한 번도 벌어지지 않았습니다.'
            : Math.abs(edge) < 0.5
              ? '되돌리든 안 되돌리든 거의 같았습니다. 흔한 결과입니다 — '
                + '되돌리기는 수익을 늘리는 장치가 아니라 비중이 한쪽으로 쏠리는 것을 막는 장치입니다.'
            : edge > 0
              ? '되돌리기가 값을 했습니다. 다만 이 한 구간의 이야기입니다.'
              : '되돌리지 않는 편이 나았습니다. 오르는 것을 팔아 내리는 것을 샀기 때문입니다. '
                + '그 대신 한쪽으로 쏠리는 것은 막았습니다.',
        }),
      ]),

      canvasBlock('mix__cv', (cv) => drawTwo(cv, r.dates, [
        { values: r.equity, color: cssVar('--key-300', '#6b9bff'), label: '되돌린 쪽' },
        { values: r.hold, color: cssVar('--tx-400', '#6b7688'), label: '그냥 둔 쪽' },
      ])),

      el('div.mix__each', r.each.map((e) => el('div.mix__eachrow', [
        el('span', { text: e.ko }),
        el('span.num', { text: e.weight.toFixed(0) + '%' }),
        el('span.num', { class: dir(e.ret), text: pct(e.ret, 1) }),
      ]))),
      el('p.ana__why', {
        text: '낱개로 하나씩 들고 있었다면 각각 저랬습니다. 섞은 값이 그중 '
            + '가장 좋은 것보다 못한 것은 정상입니다 — 섞는 까닭은 가장 좋은 것을 '
            + '맞히려는 것이 아니라, 무엇이 가장 나쁠지 모르기 때문입니다.',
      }),
    );

    if (dca?.ok) this.outEl.append(this.#dcaBlock(dca, series[0]));
  }

  #dcaBlock(d, first) {
    const win = d.lumpEnd > d.dcaEnd;
    return el('div.mix__dca', [
      el('h3.bt__h', {
        text: `적립식과 일시납 — ${first.ko || first.symbol}, ${d.months}달`,
      }),
      el('div.bt__stats', [
        stat('넣은 돈', big(d.total), ''),
        stat('적립식 끝', big(d.dcaEnd), dir(d.dcaRet)),
        stat('일시납 끝', big(d.lumpEnd), dir(d.lumpRet)),
        stat('적립식 낙폭', pct(d.dcaMdd, 1), 'down'),
        stat('일시납 낙폭', pct(d.lumpMdd, 1), 'down'),
        stat('평단가 차이', pct((d.dcaAvg / d.lumpAvg - 1) * 100, 1),
          d.dcaAvg < d.lumpAvg ? 'up' : 'down'),
      ]),
      canvasBlock('mix__cv', (cv) => drawTwo(cv, d.dates, [
        { values: d.lump, color: cssVar('--key-300', '#6b9bff'), label: '일시납' },
        { values: d.dca, color: cssVar('--ok', '#26a69a'), label: '적립식' },
        { values: d.dcaCost, color: cssVar('--tx-500', '#4e586a'), label: '넣은 돈', dash: true },
      ])),
      el('p.ana__why', {
        text: win
          ? '일시납이 이겼습니다. 시장은 대체로 오르고, 일찍 넣은 돈은 더 오래 '
            + '붙어 있기 때문입니다. 그러나 도중에 판 깊이를 보십시오 — 사람이 '
            + '실제로 겁내는 것은 끝값이 아니라 그 골짜기입니다.'
          : '적립식이 이겼습니다. 이 구간이 도중에 크게 내렸다는 뜻입니다. '
            + '내릴 때 계속 사 모으면 평단가가 내려가고, 그것이 여기서 값을 했습니다.',
      }),
    ]);
  }
}

/* ═══════════════════ 지도 ═══════════════════ */

export class MapView {
  /**
   * @param {{strategy:()=>object, bars:()=>Array, symbolName:()=>string}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#map');
    this.cfg = { score: 'calmar', count: 11, split: 70 };
    this.busy = false;
    this.paint();
  }

  /* 갈래로 돌아왔을 때. 규칙이 그대로면 아무것도 하지 않는다 —
     스무 초 걸려 그린 지도가 갈래를 한 번 오갔다고 사라지면
     사람은 그 기능을 다시 안 쓴다. */
  refresh() {
    const sig = JSON.stringify(this.hooks.strategy());
    if (sig === this.sig && this.host.children.length) return;
    this.sig = sig;
    this.paint();
  }

  paint() {
    clear(this.host);

    const st = this.hooks.strategy();
    const ks = knobs(st);

    if (ks.length < 2) {
      this.host.appendChild(el('p.bt__note', {
        text: '바꿔 볼 숫자가 둘은 있어야 합니다. 규칙 갈래에서 지표를 '
            + '더하거나 손절·익절을 켜 보십시오.',
      }));
      return;
    }

    this.xId ??= ks[0].id;
    this.yId ??= (ks[1] || ks[0]).id;

    const pick = (which, cur) => el('select.sel', {
      onchange: (e) => { this[which] = e.target.value; this.paint(); },
    }, ks.map((k) => el('option', { value: k.id, text: k.ko, selected: k.id === cur })));

    const scoreSel = el('select.sel', {
      onchange: (e) => { this.cfg.score = e.target.value; },
    }, SCORES.map((s) => el('option', {
      value: s.id, text: s.ko, title: s.note || '', selected: s.id === this.cfg.score,
    })));

    this.host.append(
      el('div.map__form', [
        el('div.bt__field', [el('label', { text: '가로' }), pick('xId', this.xId)]),
        el('div.bt__field', [el('label', { text: '세로' }), pick('yId', this.yId)]),
        el('div.bt__field', [el('label', { text: '무엇으로 재나' }), scoreSel]),
        el('label.bt__num', [
          el('span', { text: '칸 수' }),
          el('input', {
            type: 'number', min: '5', max: '19', step: '2',
            value: String(this.cfg.count),
            oninput: (e) => { this.cfg.count = Number(e.target.value) || 11; },
          }),
          el('small', { text: '11이면 121번 돌립니다' }),
        ]),
        el('button.btn.btn--key', {
          type: 'button',
          onclick: (e) => this.run(e.currentTarget),
        }, [ico('flask'), el('span.btn__label', { text: '지도를 그린다' })]),
      ]),
      el('div.map__out', { id: 'mapOut' }, [
        el('p.bt__note', { text: '바꿔 볼 숫자 둘을 고르고 눌러 보십시오.' }),
      ]),
    );
  }

  async run(btn) {
    if (this.busy) return;
    const bars = this.hooks.bars();
    if (!bars?.length) {
      this.#say('먼저 규칙 갈래에서 한 번 시험해 주십시오 — 봉이 있어야 합니다.', true);
      return;
    }

    const st = this.hooks.strategy();
    const ks = knobs(st);
    const x = ks.find((k) => k.id === this.xId);
    const y = ks.find((k) => k.id === this.yId);
    if (!x || !y || x === y) {
      this.#say('가로와 세로는 서로 다른 것이어야 합니다.', true);
      return;
    }

    const plan = {
      x, y,
      xs: steps(x.min, x.max, this.cfg.count),
      ys: steps(y.min, y.max, this.cfg.count),
      score: this.cfg.score,
    };

    this.busy = true;
    btn?.classList.add('is-busy');
    this.#say(`${plan.xs.length * plan.ys.length}번 돌리는 중…`);

    // 한 숨 쉬어 화면이 그 말을 그릴 틈을 준다. 안 그러면 다 끝난 뒤에야
    // 뜬다 — 백스물한 번이 한 덩이로 돌기 때문이다.
    await wait(30);

    try {
      const map = grid(st, bars, plan);
      const wf = walkForward(st, bars, plan, this.cfg.split / 100);
      this.sig = JSON.stringify(st);      // 이 지도가 어느 규칙의 것인지
      this.#paintOut(map, wf, plan);
    } catch (err) {
      this.#say('돌리다 넘어졌습니다: ' + err.message, true);
    } finally {
      this.busy = false;
      btn?.classList.remove('is-busy');
    }
  }

  #say(text, bad) {
    const out = $('#mapOut');
    if (!out) return;
    clear(out);
    out.appendChild(el('p.bt__note', { class: bad ? 'is-bad' : '', text }));
  }

  #paintOut(map, wf, plan) {
    const out = $('#mapOut');
    clear(out);

    if (!map.ok) {
      out.appendChild(el('p.bt__note.is-bad', { text: '성한 결과가 하나도 나오지 않았습니다.' }));
      return;
    }

    const unit = scoreById(plan.score).unit || '';
    const fmt = (v) => (Number.isFinite(v) ? num(v, unit ? 1 : 2) + unit : '—');

    // 격자
    const cells = [el('div.map__c.map__corner', { text: map.yLabel.slice(0, 6) })];
    for (const xv of map.xs) cells.push(el('div.map__c.map__top', { text: String(xv) }));

    map.ys.forEach((yv, yi) => {
      cells.push(el('div.map__c.map__side', { text: String(yv) }));
      map.xs.forEach((xv, xi) => {
        const v = map.cells[yi][xi];
        const isBest = map.best && map.best.x === xv && map.best.y === yv;
        cells.push(el('div.map__c', {
          class: isBest ? 'is-best' : '',
          style: { background: mapColor(v, map.lo, map.hi) },
          title: `${map.xLabel} ${xv} · ${map.yLabel} ${yv} → ${fmt(v)}`,
          // 백분율은 정수로도 갈리지만 비율은 소수 한 자리가 있어야
          // 0.7 과 1.2 가 둘 다 "1" 로 뭉개지지 않는다
          text: Number.isFinite(v) ? (unit ? v.toFixed(0) : v.toFixed(1)) : '',
        }));
      });
    });

    const sharp = map.sharpness;
    const verdict = sharp == null ? null
      : sharp < 0.12 ? { k: 'is-good', t: '봉우리가 넓습니다',
          d: '값을 조금 어긋나게 잡아도 비슷하게 됩니다. 시장의 성질을 짚었을 가능성이 있습니다.' }
      : sharp < 0.3 ? { k: '', t: '봉우리가 보통입니다',
          d: '나쁘지 않지만, 아래 워크포워드를 꼭 보십시오.' }
      : { k: 'is-bad', t: '봉우리가 뾰족합니다',
          d: '그 값에서만 되고 한 칸 옆에서는 안 된다는 뜻입니다. 시장을 배운 것이 아니라 '
             + '지나간 우연을 외운 것일 가능성이 높습니다.' };

    out.append(
      el('div.map__gridwrap', [
        el('div.map__axis', { text: `가로 ${map.xLabel} · 세로 ${map.yLabel}` }),
        el('div.map__grid', {
          style: { gridTemplateColumns: `auto repeat(${map.xs.length}, minmax(0, 1fr))` },
        }, cells),
        el('div.map__scale', [
          el('span', { text: fmt(map.lo) }),
          el('i'),
          el('span', { text: fmt(map.hi) }),
        ]),
      ]),

      map.best ? el('p.bt__note', {
        text: `가장 좋았던 자리는 ${map.xLabel} ${map.best.x}, ${map.yLabel} ${map.best.y}`
            + ` — ${fmt(map.best.v)} 입니다.`,
      }) : null,

      verdict ? el('div.map__verdict', { class: verdict.k }, [
        el('b', { text: verdict.t + ` (뾰족함 ${(sharp * 100).toFixed(0)})` }),
        el('span', { text: verdict.d }),
      ]) : null,

      this.#wfBlock(wf, fmt),
    );
  }

  /* ── 워크포워드 ── */

  #wfBlock(wf, fmt) {
    if (!wf.ok) {
      return el('div.map__wf', [
        el('h3.bt__h', { text: '앞에서 골라 뒤에서 시험하기' }),
        el('p.bt__note.is-bad', { text: wf.why }),
      ]);
    }

    // 뒤 구간에서 한 번도 안 샀으면 점수가 없다. 빈칸 다섯을 보여 주는
    // 대신 그렇다고 말한다 — 그것도 답이다.
    if (wf.outTrades === 0) {
      return el('div.map__wf', [
        el('h3.bt__h', { text: '앞에서 골라 뒤에서 시험하기' }),
        el('div.map__verdict.is-bad', [
          el('b', { text: '뒤 구간에서는 한 번도 사지 않았습니다' }),
          el('span', {
            text: `앞 ${wf.headLen}봉에서 고른 값(${wf.chosen.x} · ${wf.chosen.y})으로는 `
                + `뒤 ${wf.tailLen}봉에서 살 자리가 나오지 않았습니다. `
                + '규칙이 그 구간의 모양에만 맞춰져 있었다는 뜻입니다. '
                + '기간을 넓히거나 칸 수를 줄여 다시 보십시오.',
          }),
        ]),
      ]);
    }

    const carry = wf.carry;
    const verdict = carry == null ? null
      : carry >= 0.6 ? { k: 'is-good', t: '뒤 구간에서도 통했습니다',
          d: '앞에서 고른 값이 뒤에서 최선의 ' + (carry * 100).toFixed(0) + '% 를 냈습니다. '
             + '이 정도면 배운 것에 가깝습니다.' }
      : carry >= 0.2 ? { k: '', t: '뒤 구간에서 절반쯤 통했습니다',
          d: '앞에서 고른 값이 뒤에서 최선의 ' + (carry * 100).toFixed(0) + '% 를 냈습니다. '
             + '쓸 수는 있지만 기대는 낮춰 잡으십시오.' }
      : { k: 'is-bad', t: '뒤 구간에서는 통하지 않았습니다',
          d: '앞에서 좋았던 값이 뒤에서는 남지 않았습니다. 앞 구간의 우연을 외운 것입니다. '
             + '이 결과가 나오는 것이 오히려 정상입니다.' };

    return el('div.map__wf', [
      el('h3.bt__h', { text: '앞에서 골라 뒤에서 시험하기' }),
      el('p.ana__why', {
        text: `앞 ${wf.headLen}봉에서 가장 좋았던 값을 고르고, 그 값 그대로 `
            + `뒤 ${wf.tailLen}봉에서 시험했습니다. 고르는 자료와 시험하는 자료가 `
            + `같으면 시험 문제를 보고 공부한 것과 같습니다.`,
      }),
      el('div.bt__stats', [
        stat('고른 값', `${wf.chosen.x} · ${wf.chosen.y}`, ''),
        stat('앞에서', fmt(wf.inSampleScore), 'up'),
        stat('뒤에서', fmt(wf.outSampleScore),
          Number.isFinite(wf.outSampleScore) ? dir(wf.outSampleScore) : ''),
        stat('뒤에서 최선이었을 값', fmt(wf.bestPossible), ''),
        stat('뒤 구간 거래', String(wf.outTrades) + '번', ''),
        stat('남은 정도', carry == null ? '—' : (carry * 100).toFixed(0) + '%',
          carry == null ? '' : carry >= 0.6 ? 'up' : carry < 0.2 ? 'down' : ''),
      ]),
      verdict ? el('div.map__verdict', { class: verdict.k }, [
        el('b', { text: verdict.t }),
        el('span', { text: verdict.d }),
      ]) : null,
    ]);
  }
}

/* ═══════════════════ 조각 ═══════════════════ */

const stat = (k, v, tone) => el('div.bt__stat', { data: { tone: tone || '' } }, [
  el('span.bt__statk', { text: k }),
  el('span.bt__statval', { text: v }),
]);

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** 캔버스를 만들고, 붙은 뒤에 그린다 */
function canvasBlock(cls, draw) {
  const cv = el('canvas.' + cls);
  const box = el('div.cvbox', [cv]);
  // 붙기 전에는 크기를 잴 수 없다. 다음 그림 프레임이 아니라 시간으로
  // 미룬다 — 창이 뒤에 있으면 그림 프레임이 오지 않는다.
  setTimeout(() => draw(cv), 0);
  return box;
}

/** 줄 몇 개를 한 판에. 값의 크기가 다르면 못 겹치므로 같은 눈금을 쓴다. */
function drawTwo(cv, dates, series) {
  const r = cv.getBoundingClientRect();
  const w = r.width || cv.parentElement?.clientWidth || 600;
  const h = 220;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const pad = { l: 8, r: 62, t: 12, b: 22 };
  let lo = Infinity, hi = -Infinity;
  for (const s of series) {
    for (const v of s.values) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || hi === lo) return;

  const n = dates.length;
  const X = (i) => pad.l + (i / (n - 1 || 1)) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b);

  // 눈금
  g.font = '10px "IBM Plex Mono", monospace';
  g.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4;
    const y = Math.round(Y(v)) + 0.5;
    g.strokeStyle = cssVar('--line-soft', 'rgba(255,255,255,.045)');
    g.beginPath(); g.moveTo(pad.l, y); g.lineTo(w - pad.r, y); g.stroke();
    g.fillStyle = cssVar('--tx-500', '#4e586a');
    g.textAlign = 'left';
    g.fillText(big(v), w - pad.r + 6, y);
  }

  // 아래 날짜
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let i = 0; i < 5; i++) {
    const idx = Math.round((n - 1) * (i / 4));
    const d = new Date(dates[idx]);
    g.fillStyle = cssVar('--tx-500', '#4e586a');
    g.fillText(
      new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: 'numeric' }).format(d),
      Math.max(24, Math.min(w - pad.r - 24, X(idx))), h - pad.b + 5,
    );
  }

  for (const s of series) {
    g.strokeStyle = s.color;
    g.lineWidth = s.dash ? 1 : 1.8;
    g.globalAlpha = s.dash ? 0.6 : 1;
    if (s.dash) g.setLineDash([4, 4]); else g.setLineDash([]);
    g.lineJoin = 'round';
    g.beginPath();
    let pen = false;
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) { pen = false; return; }
      const x = X(i), y = Y(v);
      if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    });
    g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
  }

  // 범례
  g.font = '10px "Noto Sans KR", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  series.forEach((s, i) => {
    const y = pad.t + 6 + i * 14;
    g.fillStyle = s.color;
    g.fillRect(pad.l + 4, y - 1, 10, 2);
    g.fillText(s.label, pad.l + 18, y);
  });
}

/** 지도 칸의 색. 가장 좋은 쪽이 파랗다 — 오르내림 색과 섞이면 안 된다. */
function mapColor(v, lo, hi) {
  if (!Number.isFinite(v)) return 'transparent';
  const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  return `rgba(41, 98, 255, ${(0.05 + t * 0.68).toFixed(3)})`;
}

/* ─────────────── 남겨 두기 ─────────────── */

const MIX_KEY = 'mix';

function load() {
  const saved = store.get(MIX_KEY);
  const base = {
    picks: {},
    period: 'quarter',
    range: '5y',
    bandPct: 5,
    feeBps: 25,
    monthly: 1_000_000,
  };
  if (!saved || typeof saved !== 'object') {
    // 처음 오는 사람에게는 흔한 자산배분 하나를 미리 담아 둔다.
    // 빈 칸을 마주하면 무엇을 골라야 할지 알기 어렵다.
    base.picks = { '^KS11': 40, '^GSPC': 40, 'GC=F': 20 };
    return base;
  }
  return { ...base, ...saved, picks: saved.picks || base.picks };
}

const save = (cfg) => store.set(MIX_KEY, JSON.parse(JSON.stringify(cfg)));
