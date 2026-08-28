/* ═══════════════════════════════════════════════════════════════
   view.js — 장부 화면

   갈래 셋. 묻는 것이 서로 다르다.

     보유   지금 무엇을 얼마나 들고 있나 · 거래를 적는 자리
     성과   상품이 번 것과 내가 번 것 (TWR · MWR)
     세금   올해 얼마를 낼 것이고, 줄일 길이 있나

   ── 왜 보유가 먼저인가 ──
   나머지 둘은 장부가 있어야 뜻이 있다. 장부가 비어 있으면 성과도
   세금도 셈할 것이 없다. 그래서 첫 갈래가 적는 자리이고, 거기서
   빈 화면을 마주하지 않도록 무엇을 적는 곳인지 먼저 말한다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, ico } from '../core/dom.js';
import { px, pct, num, dir, big, dayStamp } from '../core/fmt.js';
import * as store from '../core/store.js';
import { nameOf, currencyOf } from '../market/symbols.js';
import * as book from './book.js';
import * as perf from './perf.js';
import * as tax from './tax.js';

export class BookView {
  /**
   * @param {{fetchSeries, priceOf, onSymbol, notice}} hooks
   */
  /**
   * @param {{fetchSeries, priceOf, rateOf, onSymbol, notice}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#bookwrap');
    this.tab = store.get('bookTab') || 'hold';
    this.report = null;
    this.busy = false;
    this.paint();
  }

  /* ═══════════════ 틀 ═══════════════ */

  paint() {
    clear(this.host);
    this.host.append(this.#tabs(), this.#pane());
  }

  #tabs() {
    const TABS = [
      { id: 'hold', gr: 'Κτῆσις', ko: '보유', note: '무엇을 얼마나 들고 있나' },
      { id: 'perf', gr: 'Ἔργον',  ko: '성과', note: '상품이 번 것과 내가 번 것' },
      { id: 'tax',  gr: 'Φόρος',  ko: '세금', note: '올해 얼마를 낼 것인가' },
    ];
    return el('nav.tabs', TABS.map((t) => el('button', {
      type: 'button',
      class: t.id === this.tab ? 'is-on' : '',
      title: t.note,
      onclick: () => { this.tab = t.id; store.set('bookTab', t.id); this.paint(); },
    }, [
      el('span.tab__gr', { text: t.gr }),
      el('span.tab__ko', { text: t.ko }),
    ])));
  }

  #pane() {
    if (this.tab === 'perf') return this.#perfPane();
    if (this.tax === 'tax' || this.tab === 'tax') return this.#taxPane();
    return this.#holdPane();
  }

  /* ═══════════════ 보유 ═══════════════ */

  #holdPane() {
    const txs = book.all();
    const pos = book.positions(txs);
    const box = el('div.bk');

    box.append(this.#form(), this.#positions(pos), this.#ledger(txs));
    return box;
  }

  /* ── 거래 적는 자리 ── */

  #form() {
    const state = { kind: 'buy', at: todayStr(), symbol: '', qty: '', price: '', amount: '', fee: '', note: '' };

    const fields = el('div.bk__fields');
    const paint = () => {
      clear(fields);
      const k = book.kindById(state.kind);

      fields.append(
        field('언제', el('input', {
          type: 'date', value: state.at,
          oninput: (e) => { state.at = e.target.value; },
        })),
      );

      if (!k.cash) {
        fields.append(field('무엇을', el('input', {
          type: 'text', placeholder: '005930.KS · AAPL',
          value: state.symbol, spellcheck: 'false',
          oninput: (e) => { state.symbol = e.target.value.trim().toUpperCase(); paintHint(); },
        })));
      }

      if (k.needs.includes('qty')) {
        fields.append(
          field('몇 주', el('input', {
            type: 'number', step: 'any', min: '0', value: state.qty,
            oninput: (e) => { state.qty = e.target.value; paintHint(); },
          })),
          field('단가', el('input', {
            type: 'number', step: 'any', min: '0', value: state.price,
            oninput: (e) => { state.price = e.target.value; paintHint(); },
          })),
        );
      }
      if (k.needs.includes('amount')) {
        fields.append(field('금액', el('input', {
          type: 'number', step: 'any', value: state.amount,
          oninput: (e) => { state.amount = e.target.value; paintHint(); },
        })));
      }

      fields.append(
        field('수수료·세금', el('input', {
          type: 'number', step: 'any', min: '0', value: state.fee,
          oninput: (e) => { state.fee = e.target.value; },
        })),
        field('메모', el('input', {
          type: 'text', value: state.note, maxlength: '200',
          placeholder: '왜 샀는지 한 줄',
          oninput: (e) => { state.note = e.target.value; },
        })),
      );
    };

    const hint = el('p.bk__hint');
    const paintHint = () => {
      const k = book.kindById(state.kind);
      const cur = k.cash ? 'KRW' : currencyOf(state.symbol);
      const total = k.needs.includes('qty')
        ? (Number(state.qty) || 0) * (Number(state.price) || 0)
        : Number(state.amount) || 0;
      hint.textContent = total
        ? `${cur} ${total.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`
          + (state.symbol && !k.cash ? ` · ${nameOf(state.symbol)}` : '')
        : '';
    };

    const kindRow = el('div.bk__kinds', book.KINDS.map((k) => el('button', {
      type: 'button',
      class: k.id === state.kind ? 'is-on' : '',
      onclick: (e) => {
        state.kind = k.id;
        for (const b of kindRow.children) b.classList.toggle('is-on', b === e.currentTarget);
        paint();
        paintHint();
      },
    }, k.ko)));

    paint();

    return el('div.bk__form', [
      el('h3.bt__h', { text: '거래를 적는다' }),
      kindRow,
      fields,
      hint,
      el('div.bk__actions', [
        el('button.btn.btn--key', {
          type: 'button',
          onclick: () => {
            const saved = book.save({
              ...state,
              at: state.at ? new Date(state.at + 'T09:00:00').getTime() : Date.now(),
            });
            if (!saved) {
              this.hooks.notice?.('빠진 칸이 있습니다. 무엇을, 몇 주, 얼마에 — 셋은 있어야 합니다.');
              return;
            }
            this.report = null;                 // 성과를 다시 셈해야 한다
            this.hooks.onChanged?.();
            this.paint();
          },
        }, [ico('plus'), el('span.btn__label', { text: '적는다' })]),
        el('button.btn.btn--quiet', {
          type: 'button',
          onclick: () => this.#exportBook(),
        }, el('span.btn__label', { text: '내보내기' })),
        el('button.btn.btn--quiet', {
          type: 'button',
          onclick: () => this.#importBook(),
        }, el('span.btn__label', { text: '가져오기' })),
      ]),
      el('p.ana__why', {
        text: '장부는 이 브라우저에만 남습니다. 설정 파일(settings.json)에는 '
            + '담기지 않습니다 — 그 파일은 웹호스팅에 올려도 되는 것이라, '
            + '매매 내역이 거기 있으면 안 되기 때문입니다. 옮기려면 위의 '
            + '내보내기를 쓰십시오.',
      }),
    ]);
  }

  /* ── 지금 들고 있는 것 ── */

  #positions(pos) {
    const open = pos.rows.filter((p) => p.open);
    if (!open.length) {
      return el('p.bk__empty', {
        text: '아직 들고 있는 것이 없습니다. 위에서 산 것을 적어 보십시오.',
      });
    }

    const priceOf = this.hooks.priceOf || (() => null);
    const base = store.get('bookBase') || 'KRW';

    /* 합계를 내려면 돈을 하나로 모아야 한다.

       예전에는 원화와 달러를 그냥 더했다. 삼성전자 1,139만 원과 금
       4,479 달러를 더해 놓고 합계라고 불렀으니 그것은 숫자가 아니라
       글자였다. 환율을 못 받으면 합계를 아예 내지 않는다 — 틀린
       합계보다 없는 합계가 낫다. */
    const rateOf = this.hooks.rateOf || (() => null);
    let mixed = false;

    const rows = open.map((p) => {
      const now = priceOf(p.symbol);
      const rate = p.currency === base ? 1 : rateOf(p.currency);
      if (rate == null) mixed = true;
      const value = Number.isFinite(now) ? now * p.qty : null;
      const gain = value != null ? value - p.cost : null;
      const gainPct = gain != null && p.cost > 0 ? (gain / p.cost) * 100 : null;
      return { ...p, now, value, gain, gainPct, rate };
    });

    const canSum = !mixed;
    const totalCost = canSum ? rows.reduce((a, r) => a + r.cost * r.rate, 0) : null;
    const totalVal = canSum ? rows.reduce((a, r) => a + (r.value ?? r.cost) * r.rate, 0) : null;

    return el('div.bk__block', [
      el('div.ana__h', [
        el('span', { text: '들고 있는 것' }),
        el('small', {
          text: canSum
            ? `${open.length}가지 · 합계는 ${base} 로 환산한 것입니다`
            : `${open.length}가지 · 환율을 못 받아 합계는 내지 않습니다`,
        }),
      ]),
      el('div.bk__pos', rows.map((r) => el('div.bk__row', {
        title: r.symbol + ' — 눌러서 차트로',
        onclick: () => this.hooks.onSymbol?.(r.symbol),
      }, [
        el('span.bk__id', [
          el('b', { text: r.ko }),
          el('code', { text: r.symbol + ' · ' + r.currency }),
        ]),
        el('span.bk__n', { text: fmtQty(r.qty) + '주' }),
        el('span.bk__n', { title: '평균단가', text: px(r.avg) }),
        el('span.bk__n', { title: '지금 값', text: r.now != null ? px(r.now) : '—' }),
        el('span.bk__n', {
          class: r.gainPct != null ? dir(r.gainPct) : '',
          text: r.gainPct != null ? pct(r.gainPct, 1) : '—',
        }),
        el('span.bk__n', {
          class: r.gain != null ? dir(r.gain) : '',
          title: '평가손익',
          text: r.gain != null ? big(r.gain) : '—',
        }),
      ]))),
      canSum ? el('div.bk__sum', [
        stat('산 값 합', big(totalCost), ''),
        stat('지금 값 합', big(totalVal), ''),
        stat('평가손익', big(totalVal - totalCost), dir(totalVal - totalCost)),
        stat('수익률', pct((totalVal / totalCost - 1) * 100, 1), dir(totalVal - totalCost)),
      ]) : el('p.ana__why.is-warn', {
        text: '돈이 섞여 있는데 환율을 받지 못했습니다. 종목마다의 숫자는 '
            + '맞지만 합계는 내지 않았습니다 — 원화와 달러를 그냥 더한 숫자는 '
            + '아무 뜻이 없기 때문입니다.',
      }),
      el('p.ana__why', {
        text: `실현손익 ${big(pos.realized)} · 받은 배당 ${big(pos.dividends)}. `
            + '이 둘은 판 때와 받은 때의 돈으로 적힌 것이라 섞여 있을 수 있습니다.',
      }),
    ]);
  }

  /* ── 적어 둔 거래 ── */

  #ledger(txs) {
    if (!txs.length) return el('div');

    const recent = [...txs].reverse().slice(0, 60);

    return el('div.bk__block', [
      el('div.ana__h', [
        el('span', { text: '적어 둔 거래' }),
        el('small', { text: `${txs.length}건` + (txs.length > 60 ? ' · 최근 60건' : '') }),
      ]),
      el('div.bk__txs', recent.map((t) => {
        const k = book.kindById(t.kind);
        return el('div.bk__tx', { data: { kind: t.kind } }, [
          el('span.bk__when', { text: dayStamp(new Date(t.at)) }),
          el('span.bk__kind', { text: k.ko }),
          el('span.bk__what', { text: t.symbol ? (t.ko || nameOf(t.symbol)) : '현금' }),
          el('span.bk__n', {
            text: t.qty ? `${fmtQty(t.qty)} × ${px(t.price)}` : big(t.amount),
          }),
          el('span.bk__n', { text: t.currency }),
          el('span.bk__note', { text: t.note || '' }),
          el('button.bk__x', {
            type: 'button', title: '지우기',
            onclick: (e) => {
              e.stopPropagation();
              book.remove(t.id);
              this.report = null;
              this.hooks.onChanged?.();
              this.paint();
            },
          }, '×'),
        ]);
      })),
    ]);
  }

  /* ═══════════════ 성과 ═══════════════ */

  #perfPane() {
    const box = el('div.bk');

    if (!book.all().length) {
      box.appendChild(el('p.bk__empty', { text: '장부가 비어 있습니다. 보유 갈래에서 거래를 적어 보십시오.' }));
      return box;
    }

    const out = el('div.bk__out');
    box.append(
      el('p.hint', {
        html: '상품이 번 것(<b>TWR</b>)과 내가 실제로 번 것(<b>MWR</b>)은 다릅니다. '
            + '꼭대기에서 더 넣고 바닥에서 못 넣었으면 뒤엣것이 낮습니다. '
            + '<b>그 간격이 곧 내 타이밍의 값입니다.</b>',
      }),
      el('div.bk__actions', [
        el('button.btn.btn--key', {
          type: 'button',
          onclick: (e) => this.#runPerf(out, e.currentTarget),
        }, [ico('flask'), el('span.btn__label', { text: '셈한다' })]),
      ]),
      out,
    );

    if (this.report) this.#paintPerf(out, this.report);
    else out.appendChild(el('p.bt__note', { text: '“셈한다”를 누르면 시세를 부르고 되짚습니다.' }));

    return box;
  }

  async #runPerf(out, btn) {
    if (this.busy) return;
    this.busy = true;
    btn?.classList.add('is-busy');
    clear(out);
    out.appendChild(el('p.bt__note', { text: '시세를 부르는 중…' }));

    try {
      const syms = book.allSymbols();
      const span = book.span();
      const range = span && span.days > 1800 ? '10y' : span && span.days > 700 ? '5y' : '2y';
      const series = await this.hooks.fetchSeries(syms, range);

      const got = await perf.report(series, { base: store.get('bookBase') || 'KRW' });
      this.report = got;
      this.#paintPerf(out, got);
    } catch (err) {
      clear(out);
      out.appendChild(el('p.bt__note.is-bad', { text: '셈하지 못했습니다: ' + err.message }));
    } finally {
      this.busy = false;
      btn?.classList.remove('is-busy');
    }
  }

  #paintPerf(out, r) {
    clear(out);
    if (!r.ok) { out.appendChild(el('p.bt__note.is-bad', { text: r.why })); return; }

    const gap = r.gap;
    const verdict = r.tooShort ? {
        k: '', t: '아직 연율로 펼 만큼 길지 않습니다',
        d: '한 달이 안 된 장부를 연율로 펴면 사흘에 2% 번 것이 900% 가 됩니다. '
         + '셈은 맞지만 그 숫자는 거짓말이라 내지 않습니다. 한 달만 지나면 나옵니다.',
      }
      : gap == null ? null
      : gap < -1.5 ? {
        k: 'is-bad', t: '넣은 때가 좋지 않았습니다',
        d: `상품은 연 ${fmtPct(r.twr.annual)} 벌었는데 나는 ${fmtPct(r.mwr)} 벌었습니다. `
         + `그 차이 ${fmtPct(gap)} 가 언제 넣고 뺐는지에서 온 것입니다. `
         + '대개 오른 뒤에 더 넣고 내린 뒤에 못 넣었을 때 이렇게 됩니다.',
      }
      : gap > 1.5 ? {
        k: 'is-good', t: '넣은 때가 좋았습니다',
        d: `상품이 연 ${fmtPct(r.twr.annual)} 벌었는데 나는 ${fmtPct(r.mwr)} 벌었습니다. `
         + '내릴 때 넣었다는 뜻입니다. 다만 한 구간의 이야기입니다.',
      }
      : {
        k: '', t: '넣은 때는 거의 영향이 없었습니다',
        d: '상품이 번 것과 내가 번 것이 비슷합니다. 꾸준히 넣었거나, 한 번에 넣고 두었을 때 이렇습니다.',
      };

    out.append(
      el('div.bt__stats', [
        stat('지금 값', big(r.value), ''),
        stat('넣은 돈', big(r.inflow), ''),
        stat('뺀 돈', big(r.outflow), ''),
        stat('TWR 연', fmtPct(r.twr?.annual), dir(r.twr?.annual)),
        stat('MWR 연', fmtPct(r.mwr), dir(r.mwr)),
        stat('그 차이', fmtPct(gap), gap == null ? '' : dir(gap)),
        stat('최대 낙폭', fmtPct(r.mdd), 'down'),
        stat('되짚은 날', r.days + '일', ''),
      ]),

      verdict ? el('div.mix__verdict', { class: verdict.k }, [
        el('b', { text: verdict.t }),
        el('span', { text: verdict.d }),
      ]) : null,

      canvas('bk__cv', (cv) => drawEquity(cv, r)),

      !r.fxOk ? el('p.bt__note.is-bad', {
        text: '환율을 받지 못해 섞인 돈을 그대로 더했습니다. 숫자가 실제와 다릅니다.',
      }) : null,

      r.missing > 0 ? el('p.ana__why', {
        text: `시세가 빠진 날이 ${r.missing}번 있어 앞 값으로 채웠습니다.`,
      }) : null,

      el('p.ana__why', {
        text: 'TWR 은 돈을 언제 넣었는지를 지운 수익률이고, MWR 은 그것을 그대로 '
            + '넣은 수익률입니다. 펀드 광고에 뜨는 것은 앞엣것이고, 내 통장에 '
            + '찍히는 것은 뒤엣것입니다.',
      }),
    );
  }

  /* ═══════════════ 세금 ═══════════════ */

  #taxPane() {
    const box = el('div.bk');
    const year = new Date().getFullYear();
    const r = tax.rates();

    if (!book.all().length) {
      box.appendChild(el('p.bk__empty', { text: '장부가 비어 있습니다. 보유 갈래에서 거래를 적어 보십시오.' }));
      return box;
    }

    const realized = tax.realized(year);
    const fin = tax.financeIncome(year);

    const priceOf = this.hooks.priceOf || (() => null);
    const pos = book.positions();
    const h = tax.harvest(pos.rows, priceOf);

    box.append(
      el('p.hint.hint--warn', {
        html: '이 판은 <b>넣은 세율로 적은 장부를 더하고 뺀 것</b>일 뿐입니다. '
            + '세법은 바뀌고 사람마다 사정이 다릅니다. 실제 신고는 반드시 '
            + '확인하고 하십시오 — 여기 숫자를 그대로 믿고 신고하면 안 됩니다.',
      }),

      this.#rateForm(r),

      el('div.bk__block', [
        el('div.ana__h', [
          el('span', { text: year + '년 실현된 것' }),
          el('small', { text: '판 것과 받은 배당' }),
        ]),
        el('div.bt__stats', [
          stat('해외 양도차익', big(realized.overseas.gain), dir(realized.overseas.gain)),
          stat('기본공제 뒤', big(realized.overseas.taxable), ''),
          stat('해외 양도세', big(realized.overseas.tax), realized.overseas.tax > 0 ? 'down' : ''),
          stat('국내 양도차익', big(realized.domestic.gain), dir(realized.domestic.gain)),
          stat('국내 양도세', r.domesticTaxed ? big(realized.domestic.tax) : '없음', ''),
          stat('배당 · 떼인 세금', big(realized.dividend.amount) + ' · ' + big(realized.dividend.tax), ''),
        ]),
        !r.domesticTaxed ? el('p.ana__why', {
          text: '국내 상장주식은 소액주주면 양도소득세가 없어 0으로 두었습니다. '
              + '대주주라면 위에서 켜 주십시오.',
        }) : null,
      ]),

      this.#harvestBlock(h, realized),

      el('div.bk__block', [
        el('div.ana__h', [
          el('span', { text: '금융소득 종합과세' }),
          el('small', { text: '배당과 이자를 합쳐 문턱을 넘나' }),
        ]),
        el('div.fin__bar', [
          el('i', { style: { width: Math.min(100, fin.pct) + '%' }, class: fin.over ? 'is-over' : '' }),
        ]),
        el('p.bt__note', {
          text: fin.over
            ? `올해 ${big(fin.total)} 로 문턱 ${big(fin.cap)} 를 넘었습니다. `
              + '다른 소득과 합산되므로 세율이 달라질 수 있습니다.'
            : `올해 ${big(fin.total)}. 문턱까지 ${big(fin.left)} 남았습니다.`,
        }),
      ]),
    );

    return box;
  }

  #rateForm(r) {
    const put = (k, v) => {
      const cur = store.get('tax') || {};
      store.set('tax', { ...cur, [k]: v });
      this.paint();
    };

    return el('div.bk__rates', [
      el('label.bt__num', [
        el('span', { text: '해외 양도세 %' }),
        el('input', {
          type: 'number', step: '0.1', value: String(r.overseasRate),
          onchange: (e) => put('overseasRate', Number(e.target.value)),
        }),
      ]),
      el('label.bt__num', [
        el('span', { text: '연 기본공제' }),
        el('input', {
          type: 'number', step: '100000', value: String(r.overseasFree),
          onchange: (e) => put('overseasFree', Number(e.target.value)),
        }),
      ]),
      el('label.bt__num', [
        el('span', { text: '배당 원천징수 %' }),
        el('input', {
          type: 'number', step: '0.1', value: String(r.dividendRate),
          onchange: (e) => put('dividendRate', Number(e.target.value)),
        }),
      ]),
      el('label.bt__num', [
        el('span', { text: '종합과세 문턱' }),
        el('input', {
          type: 'number', step: '1000000', value: String(r.financeCap),
          onchange: (e) => put('financeCap', Number(e.target.value)),
        }),
      ]),
      el('label.switch', [
        (() => {
          const b = el('input', { type: 'checkbox' });
          b.checked = !!r.domesticTaxed;
          b.addEventListener('change', () => put('domesticTaxed', b.checked));
          return b;
        })(),
        el('span.switch__track', [el('span.switch__dot')]),
        el('span.switch__label', { text: '국내도 양도세 대상 (대주주)' }),
      ]),
      el('p.row__note', { text: r.asOf + '. 바뀌면 위에서 고치십시오.' }),
    ]);
  }

  #harvestBlock(h, realized) {
    if (!h) return el('div');

    const body = [];

    if (h.room <= 0) {
      body.push(el('div.mix__verdict.is-good', [
        el('b', { text: '지금은 팔아서 줄일 세금이 없습니다' }),
        el('span', {
          text: realized.overseas.gain <= 0
            ? '올해 해외 양도차익이 없습니다.'
            : `올해 차익 ${big(realized.overseas.gain)} 가 기본공제 `
              + `${big(h.rate.overseasFree)} 아래입니다. 그냥 두십시오.`,
        }),
      ]));
    } else if (!h.plan.length) {
      body.push(el('div.mix__verdict', [
        el('b', { text: '손실 중인 해외 종목이 없습니다' }),
        el('span', {
          text: `올해 공제를 넘는 차익이 ${big(h.room)} 있지만, 팔아서 상계할 `
              + '손실이 없습니다.',
        }),
      ]));
    } else {
      body.push(
        el('div.mix__verdict.is-good', [
          el('b', { text: `${big(h.saved)} 만큼 세금을 미룰 수 있습니다` }),
          el('span', {
            text: h.enough
              ? '아래를 팔면 올해 차익이 공제 아래로 내려갑니다.'
              : '아래를 다 팔아도 차익이 공제 위에 남습니다. 그만큼만 줄어듭니다.',
          }),
        ]),
        el('div.bk__pos', h.plan.map((x) => el('div.bk__row', {
          onclick: () => this.hooks.onSymbol?.(x.symbol),
        }, [
          el('span.bk__id', [el('b', { text: x.ko }), el('code', { text: x.symbol })]),
          el('span.bk__n', { text: fmtQty(x.qty) + '주' }),
          el('span.bk__n', { class: 'down', text: pct(x.pct, 1) }),
          el('span.bk__n', { class: 'down', text: big(x.unrealized) }),
          el('span.bk__n', { text: x.whole ? '전부' : big(-x.use) + '만큼' }),
        ]))),
      );
    }

    body.push(el('p.ana__why', {
      text: '이것은 세금을 없애는 것이 아니라 미루는 것입니다. 다시 사면 '
          + '취득가가 낮아져 나중에 팔 때 그만큼 더 냅니다. 그래도 미루는 '
          + '것만으로 값이 있습니다 — 그 돈이 그동안 일하기 때문입니다. '
          + '팔고 사는 사이에 값이 뛸 수 있다는 것, 수수료가 두 번 든다는 '
          + '것은 실재하는 위험입니다.',
    }));

    if (h.domesticSkipped) {
      body.push(el('p.ana__why', {
        text: `국내 상장 ${h.domesticSkipped}가지는 셈에서 뺐습니다 — 소액주주면 `
            + '양도세가 없어 팔아도 줄일 것이 없습니다.',
      }));
    }

    return el('div.bk__block', [
      el('div.ana__h', [
        el('span', { text: '손실 수확' }),
        el('small', { text: '지금 손실 중인 것을 팔면 올해 세금이 얼마나 주나' }),
      ]),
      ...body,
    ]);
  }

  /* ═══════════════ 옮기기 ═══════════════ */

  #exportBook() {
    const data = book.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', {
      href: URL.createObjectURL(blob),
      download: `ktema-book-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  #importBook() {
    const input = el('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const got = book.importAll(JSON.parse(await file.text()));
        this.report = null;
        this.hooks.onChanged?.();
        this.paint();
        this.hooks.notice?.(`거래 ${got.added}건을 들여왔습니다 (모두 ${got.total}건).`);
      } catch (e) {
        this.hooks.notice?.('가져오지 못했습니다: ' + e.message);
      }
    });
    input.click();
  }
}

/* ═══════════════════ 조각 ═══════════════════ */

const field = (label, node) => el('label.bk__field', [el('span', { text: label }), node]);

const stat = (k, v, tone) => el('div.bt__stat', { data: { tone: tone || '' } }, [
  el('span.bt__statk', { text: k }),
  el('span.bt__statval', { text: v }),
]);

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtQty = (q) => (Number.isInteger(q) ? String(q) : q.toFixed(4).replace(/0+$/, ''));
const fmtPct = (v) => (Number.isFinite(v) ? pct(v, 1) : '—');

function canvas(cls, draw) {
  const cv = el('canvas.' + cls);
  setTimeout(() => draw(cv), 0);
  return el('div.cvbox', [cv]);
}

const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/* ─────────────── 평가액 곡선 ───────────────

   두 줄을 겹친다. 평가액과 넣은 돈. 둘 사이의 간격이 번 것이다.
   수익률 곡선 하나보다 이쪽이 읽기 쉽다 — 얼마를 넣어서 얼마가
   되었는지가 한눈에 보이기 때문이다. */

function drawEquity(cv, r) {
  const rect = cv.getBoundingClientRect();
  const w = rect.width || cv.parentElement?.clientWidth || 600;
  const h = 240;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const rows = r.rows;
  if (rows.length < 2) return;

  // 넣은 돈의 누적
  let acc = 0;
  const invested = rows.map((x) => { acc += x.flow; return acc; });

  const vals = rows.map((x) => x.value).concat(invested);
  const lo = Math.min(...vals, 0);
  const hi = Math.max(...vals);
  if (!(hi > lo)) return;

  const pad = { l: 8, r: 68, t: 14, b: 22 };
  const X = (i) => pad.l + (i / (rows.length - 1)) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b);

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

  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (let i = 0; i < 5; i++) {
    const idx = Math.round((rows.length - 1) * (i / 4));
    g.fillStyle = cssVar('--tx-500', '#4e586a');
    g.fillText(
      new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: 'numeric' }).format(new Date(rows[idx].t)),
      Math.max(22, Math.min(w - pad.r - 22, X(idx))), h - pad.b + 5,
    );
  }

  // 넣은 돈과 평가액 사이를 물들인다 — 그 넓이가 번 것이다
  const up = cssVar('--up', '#f0554d');
  const down = cssVar('--down', '#3f8ae0');
  const good = rows[rows.length - 1].value >= invested[invested.length - 1];

  g.beginPath();
  rows.forEach((x, i) => { const p = [X(i), Y(x.value)]; i ? g.lineTo(...p) : g.moveTo(...p); });
  for (let i = rows.length - 1; i >= 0; i--) g.lineTo(X(i), Y(invested[i]));
  g.closePath();
  g.fillStyle = good ? up : down;
  g.globalAlpha = 0.14;
  g.fill();
  g.globalAlpha = 1;

  // 넣은 돈
  g.strokeStyle = cssVar('--tx-500', '#4e586a');
  g.setLineDash([4, 4]);
  g.lineWidth = 1.2;
  g.beginPath();
  invested.forEach((v, i) => { const p = [X(i), Y(v)]; i ? g.lineTo(...p) : g.moveTo(...p); });
  g.stroke();
  g.setLineDash([]);

  // 평가액
  g.strokeStyle = cssVar('--tx-100', '#e6ebf2');
  g.lineWidth = 1.8;
  g.lineJoin = 'round';
  g.beginPath();
  rows.forEach((x, i) => { const p = [X(i), Y(x.value)]; i ? g.lineTo(...p) : g.moveTo(...p); });
  g.stroke();

  g.font = '10px "Noto Sans KR", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = cssVar('--tx-100', '#e6ebf2');
  g.fillText('평가액', pad.l + 4, pad.t + 6);
  g.fillStyle = cssVar('--tx-500', '#4e586a');
  g.fillText('넣은 돈', pad.l + 4, pad.t + 20);
}
