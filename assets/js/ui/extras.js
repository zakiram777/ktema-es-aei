/* ═══════════════════════════════════════════════════════════════
   extras.js — 바깥 길로 받아 오는 판 넷

   전부 같은 결이라 한 파일에 모았다 — 바깥에서 무언가를 받아, 없으면
   없다고 말하고, 있으면 판 하나를 채운다.

     매크로   시세 밑에 깔린 것 (FRED)
     재무     회사가 제출한 원본 (SEC)
     원화     해외 자산을 원으로 환산 (Frankfurter)
     성적표   일지를 시세에 대어 채점 (바깥 부름 없음)

   ── 없으면 없다고 말한다 ──
   열쇠가 없거나 길이 막히면 화면을 비워 두지 않는다. 무엇이 없고
   어디서 받는지를 그 자리에 적는다. 빈 판은 고장으로 읽히고,
   고장으로 읽히면 사람은 사이트 전체를 덜 믿게 된다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear } from '../core/dom.js';
import { px, pct, num, dir, big, stamp } from '../core/fmt.js';
import * as store from '../core/store.js';
import * as macro from '../market/macro.js';
import * as filings from '../market/filings.js';
import * as fx from '../market/fx.js';
import { score, HORIZONS } from '../journal/score.js';

/* ═══════════════════ 매크로 ═══════════════════ */

export class MacroPanel {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#macro');
    this.stampEl = $('#macroStamp');
    this.at = 0;
  }

  /** 분석 화면을 열 때 부른다. 한 시간에 한 번만 실제로 나간다. */
  async load({ force = false } = {}) {
    if (!this.host) return;

    if (!macro.hasKey()) { this.#needKey(); return; }
    if (!force && Date.now() - this.at < 60 * 60_000) return;

    clear(this.host);
    this.host.appendChild(el('p.ana__wait', { text: '경제 지표를 부르는 중…' }));

    try {
      const rows = await macro.all();
      this.at = Date.now();
      this.stampEl.textContent = stamp(new Date(this.at)) + ' 기준';
      this.#paint(rows);
    } catch (err) {
      clear(this.host);
      this.host.appendChild(el('p.ana__wait.is-bad', { text: '받지 못했습니다: ' + err.message }));
    }
  }

  #needKey() {
    const how = macro.KEY_HOWTO.fred;
    clear(this.host);
    this.host.appendChild(el('div.needkey', [
      el('b', { text: '열쇠를 넣으면 여기가 채워집니다' }),
      el('span', {
        text: '수익률곡선이 뒤집힌 채 열두 달째라는 사실은 어떤 종목 차트에도 '
            + '안 나옵니다. 그런데 모든 종목 차트를 다르게 읽게 만듭니다.',
      }),
      el('span', { text: how.note }),
      el('div.needkey__row', [
        el('a.btn.btn--quiet.btn--tiny', {
          href: how.url, target: '_blank', rel: 'noopener noreferrer',
        }, el('span.btn__label', { text: how.ko + ' 열쇠 받기' })),
        el('button.btn.btn--quiet.btn--tiny', {
          type: 'button',
          onclick: () => this.hooks.openSettings?.('Κλεῖδες'),
        }, el('span.btn__label', { text: '설정에 넣기' })),
      ]),
    ]));
  }

  #paint(rows) {
    clear(this.host);
    for (const r of rows) {
      if (r.error) {
        this.host.appendChild(el('div.mcard.is-bad', [
          el('span.mcard__ko', { text: r.ko }),
          el('span.mcard__err', { text: r.error }),
        ]));
        continue;
      }

      // 좋고 나쁨이 뒤집히는 것들이 있다 — 수익률곡선은 낮을수록 나쁘고,
      // 하이일드 가산금리는 높을수록 나쁘다. invert 로 그것을 적어 둔다.
      const worse = r.invert
        ? (r.id === 'T10Y2Y' || r.id === 'T10Y3M' ? r.last < 0 : r.change > 0)
        : false;

      const cv = el('canvas.mcard__cv');
      setTimeout(() => spark(cv, r.points, worse), 0);

      this.host.appendChild(el('div.mcard', { title: r.note || '' }, [
        el('div.mcard__head', [
          el('span.mcard__ko', { text: r.ko }),
          el('span.mcard__gr', { text: r.gr || '' }),
        ]),
        el('div.mcard__v', { class: worse ? 'down' : '' }, [
          el('b', { text: Number.isFinite(r.last) ? num(r.last, 2) + (r.unit || '') : '—' }),
          Number.isFinite(r.change)
            ? el('span', {
              class: dir(r.change),
              text: (r.change > 0 ? '+' : '') + num(r.change, 2),
            })
            : null,
        ]),
        cv,
        el('span.mcard__pos', {
          text: Number.isFinite(r.pos)
            ? `다섯 해 폭의 ${Math.round(r.pos)}% 자리`
            : '',
        }),
      ]));
    }

    this.host.appendChild(el('p.ana__why', {
      text: '칸에 마우스를 얹으면 그 숫자가 무엇을 뜻하는지 나옵니다. '
          + '전부 미국 것입니다 — 한국 금리는 한국은행 쪽인데 아직 잇지 않았습니다.',
    }));
  }
}

/* ═══════════════════ 재무 ═══════════════════ */

export class FinPanel {
  constructor() {
    this.host = $('#finBody');
    this.box = $('#fin');
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
    this.host.appendChild(el('p.ana__wait', { text: symbol + ' 의 재무를 부르는 중…' }));

    try {
      const got = await filings.financials(symbol);
      clear(this.host);
      if (!got.ok) {
        this.host.appendChild(el('p.ana__wait', { text: got.why }));
        return;
      }
      this.#paint(got);
    } catch (err) {
      clear(this.host);
      this.host.appendChild(el('p.ana__wait.is-bad', { text: '받지 못했습니다: ' + err.message }));
      this.symbol = null;                        // 다음에 다시 해 볼 수 있게
    }
  }

  #paint(got) {
    // 해를 가로로 늘어놓는다. 항목이 세로다.
    const years = [...new Set(got.items.flatMap((i) => i.rows.map((r) => r.fy)))]
      .sort((a, b) => a - b)
      .slice(-10);

    const head = [el('div.fin__c.fin__side', { text: '' })];
    for (const y of years) head.push(el('div.fin__c.fin__top', { text: String(y).slice(2) }));

    const body = [];
    for (const item of got.items) {
      body.push(el('div.fin__c.fin__side', { text: item.ko, title: item.tag }));
      const byYear = new Map(item.rows.map((r) => [r.fy, r]));
      let prev = null;
      for (const y of years) {
        const r = byYear.get(y);
        if (!r) { body.push(el('div.fin__c.is-empty')); prev = null; continue; }

        // 늘었나 줄었나를 색으로. 값 자체보다 결이 먼저 보여야 한다.
        const g = prev && prev !== 0 ? (r.val / prev - 1) * 100 : null;
        body.push(el('div.fin__c', {
          class: g == null ? '' : dir(g),
          title: g == null ? '' : `${y}년 ${pct(g, 1)}`,
          text: item.per ? num(r.val, 2) : big(r.val),
        }));
        prev = r.val;
      }
    }

    clear(this.host);
    this.host.append(
      el('div.finwrap', [
        el('div.fin__grid', {
          style: { gridTemplateColumns: `auto repeat(${years.length}, minmax(0, 1fr))` },
        }, [...head, ...body]),
      ]),
      el('p.ana__why', {
        text: '회계연도 기준이고, 고쳐 낸 것이 있으면 나중에 낸 값을 씁니다. '
            + '색은 전년 대비입니다. 주식수가 해마다 늘고 있으면 그만큼 '
            + '내 몫이 옅어지는 중이라는 뜻입니다 — 그것이 여기서 가장 자주 '
            + '놓치는 줄입니다.',
      }),
    );
  }
}

/* ═══════════════════ 원화 ═══════════════════ */

export class FxSwitch {
  /** @param {{chartQ:()=>object, redraw:(bars)=>void, note:(text)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.on = false;
  }

  async toggle() {
    const q = this.hooks.chartQ();
    if (!q?.bars?.length) return;

    this.on = !this.on;
    $('#btnFx')?.classList.toggle('is-on', this.on);

    if (!this.on) { this.hooks.redraw(null); return; }

    try {
      const got = await fx.convert(q.bars, q.symbol, 'KRW');
      if (!got.ok) {
        this.on = false;
        $('#btnFx')?.classList.remove('is-on');
        this.hooks.note(got.why);
        return;
      }
      this.hooks.redraw(got.bars);
      this.hooks.note(
        `원화로 보면 ${pct(got.totalRet, 1)} 입니다. `
        + `그중 값이 낸 몫이 ${pct(got.assetRet, 1)}, `
        + `환율이 낸 몫이 ${pct(got.fxShare, 1)} 입니다 `
        + `(${got.base}/원 ${num(got.rateFirst, 0)} → ${num(got.rateLast, 0)}).`,
      );
    } catch (err) {
      this.on = false;
      $('#btnFx')?.classList.remove('is-on');
      this.hooks.note('환율을 받지 못했습니다: ' + err.message);
    }
  }
}

/* ═══════════════════ 일지 성적표 ═══════════════════ */

export class ScoreCard {
  /** @param {{series:()=>Array}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#jscore');
  }

  paint() {
    if (!this.host) return;
    clear(this.host);

    const series = this.hooks.series();
    if (!series?.length) {
      this.host.appendChild(el('p.jscore__wait', {
        text: '분석 화면을 한 번 열면 여기도 채워집니다 — 채점에 두 해치 시세가 필요합니다.',
      }));
      return;
    }

    const got = score(series);
    if (!got.ok) {
      this.host.appendChild(el('p.jscore__wait', { text: got.why }));
      return;
    }

    this.host.append(
      el('div.jscore__head', [
        el('span', { text: '적어 둔 대로 되었나' }),
        el('small', { text: `채점한 글 ${got.total}개` + (got.skipped ? ` · 아직 이른 글 ${got.skipped}개` : '') }),
      ]),

      el('div.jscore__moods', got.moods.map((m) => this.#mood(m))),

      el('div.jscore__verdict', { class: 'is-' + got.verdict.tone }, [
        el('span', { text: got.verdict.text }),
      ]),

      got.tags.length ? el('div.jscore__tags', [
        el('h5', { text: '이름표별 — 30일 뒤' }),
        el('div.jscore__taglist', got.tags.map((t) => el('span.jscore__tag', {
          class: t.thin ? 'is-thin' : (t.avg > 0 ? 'up' : 'down'),
          title: t.thin ? `${t.n}개뿐이라 숫자를 내지 않습니다` : `${t.n}개 평균`,
          text: `#${t.tag} ` + (t.thin ? `(${t.n})` : pct(t.avg, 1)),
        }))),
      ]) : null,
    );
  }

  #mood(m) {
    const cells = HORIZONS.map((h) => {
      const s = m.horizons[h.id];
      if (!s || s.thin) {
        return el('div.jscore__cell.is-thin', [
          el('span.jscore__k', { text: h.ko }),
          el('span.jscore__v', { text: `${s?.n ?? 0}개` }),
          el('span.jscore__n', { text: '아직 모자람' }),
        ]);
      }
      return el('div.jscore__cell', [
        el('span.jscore__k', { text: h.ko }),
        el('span.jscore__v', { class: dir(s.avg), text: pct(s.avg, 1) }),
        el('span.jscore__n', {
          text: s.hit == null
            ? `${s.n}번 · ${pct(s.worst, 0)} … ${pct(s.best, 0)}`
            : `${s.n}번 중 ${s.hit.toFixed(0)}% 맞음`,
        }),
      ]);
    });

    return el('div.jscore__mood', { data: { tone: m.tone } }, [
      el('div.jscore__moodhead', [
        el('span.jscore__gr', { text: m.gr }),
        el('span.jscore__ko', { text: m.ko }),
        el('span.jscore__cnt', { text: m.n + '개' }),
      ]),
      ...cells,
    ]);
  }
}

/* ─────────────── 작은 그림 ─────────────── */

function spark(cv, points, worse) {
  const r = cv.getBoundingClientRect();
  const w = r.width || 200;
  const h = 34;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  if (!points?.length) return;
  const vs = points.map((p) => p.v);
  let lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi === lo) { hi += 1; lo -= 1; }

  const X = (i) => (i / (points.length - 1 || 1)) * w;
  const Y = (v) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);

  // 0선이 구간 안에 있으면 그어 준다. 수익률곡선에서는 그 선이 전부다.
  if (lo < 0 && hi > 0) {
    const y = Math.round(Y(0)) + 0.5;
    g.strokeStyle = 'rgba(255,255,255,.18)';
    g.setLineDash([2, 3]);
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    g.setLineDash([]);
  }

  const col = getComputedStyle(document.documentElement)
    .getPropertyValue(worse ? '--bad' : '--key-300').trim() || '#6b9bff';

  g.strokeStyle = col;
  g.lineWidth = 1.3;
  g.lineJoin = 'round';
  g.beginPath();
  points.forEach((p, i) => { const x = X(i), y = Y(p.v); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();

  // 끝점을 찍어 준다 — 어디가 지금인지
  g.fillStyle = col;
  g.beginPath();
  g.arc(X(points.length - 1), Y(vs[vs.length - 1]), 2, 0, Math.PI * 2);
  g.fill();
}
