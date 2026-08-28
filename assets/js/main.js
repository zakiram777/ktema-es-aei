/* ═══════════════════════════════════════════════════════════════
   main.js — 모든 것을 잇는 자리

   각 조각은 서로를 모른다. 여기서만 서로를 안다. 그래서 조각 하나를
   갈아 끼워도 나머지는 그대로 둘 수 있다.

   흐름
     관문을 지난다 → 시세를 부른다 → 차트를 건다 → 소식을 부른다
     → 그다음부터는 90초마다 시세만 조용히 다시 부른다

   ── 무엇을 먼저 부르나 ──
   시세가 먼저다. 이 사이트를 여는 사람이 첫 3초에 보고 싶어 하는 것은
   숫자이지 기사가 아니다. 소식은 그 뒤에 조용히 채워 넣는다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, wait, calmly } from './core/dom.js';
import { on } from './core/bus.js';
import * as store from './core/store.js';
import { until } from './core/fmt.js';

import { checkSelfProxy } from './net/proxy.js';

import * as feed from './news/feed.js';
import { NewsView } from './news/view.js';
import { Reader } from './news/reader.js';
import { Breaking } from './news/breaking.js';

import * as quotes from './market/quotes.js';
import { MarketView } from './market/view.js';
import { AnalysisView } from './market/anaview.js';
import { breadth } from './market/analysis.js';
import { DEFAULT_WATCH, RANGES, nameOf } from './market/symbols.js';

import { Veil, gateFilm } from './ui/ambience.js';
import { Settings } from './ui/settings.js';
import { Nav } from './ui/nav.js';
import { Picker } from './ui/picker.js';
import { WatchList } from './ui/watch.js';
import { MacroPanel, FinPanel, FxSwitch, ScoreCard } from './ui/extras.js';
import { StressPanel, DivPanel, RulePanel } from './ui/extras2.js';
import { BookView } from './portfolio/view.js';
import * as book from './portfolio/book.js';
import * as fx from './market/fx.js';
import * as filings from './market/filings.js';

import { JournalView } from './journal/view.js';
import { BacktestView } from './backtest/view.js';
import { MixView, MapView } from './backtest/labview.js';

/* ═══════════════════ 상태 ═══════════════════ */

const app = {
  veil: null, nav: null, pick: null, watch: null,
  news: null, reader: null, breaking: null,
  market: null, ana: null, journal: null, backtest: null, settings: null,
  timer: 0, countdown: 0, seeding: null,
  quotes: [],
  chartQ: null,
  anaAt: 0,
};

/* ═══════════════════ 소식 ═══════════════════ */

async function loadNews({ quiet = false, force = false } = {}) {
  const btn = $('#btnRefresh');
  btn.classList.add('is-busy');
  if (!quiet && !feed.cached(app.news.cat)) app.news.loading();

  try {
    const { items, at } = await feed.load(app.news.cat, { force });

    // 공시를 같은 목록에 섞는다. 기사는 남이 회사에 대해 쓴 글이고
    // 공시는 회사가 스스로 낸 글인데, 읽는 사람에게는 둘 다 소식이다.
    const withFilings = await mixFilings(items);
    app.news.set(withFilings, at);

    if (!quiet) {
      const fresh = withFilings.filter((x) => x.isNew).length;
      app.breaking.notice(
        fresh > 0 ? `새 소식 ${fresh}건을 포함해 ${withFilings.length}건.` : `${withFilings.length}건. 새 것은 없습니다.`,
        { kind: '갱신', ms: 5000 },
      );
    }
  } catch (err) {
    console.warn('[news]', err);
    if (!feed.cached(app.news.cat)) app.news.failed(err);
    else app.breaking.notice('소식을 갱신하지 못했습니다. 이전 목록을 그대로 둡니다.', { kind: '알림' });
  } finally {
    btn.classList.remove('is-busy');
    scheduleRefresh();
  }
}

/* ── 공시 ──

   관심종목 가운데 한국 종목의 최근 공시를 받아 소식 목록에 섞는다.
   유상증자·최대주주 변경·감사의견 거절 같은 것은 기사보다 공시가
   먼저이고, 기사를 기다리면 이미 값이 움직인 뒤다.

   열쇠가 없으면 아무 일도 하지 않고 조용히 지나간다. 이것 하나 없다고
   소식 화면이 반쪽이 되어서는 안 된다. */
const FILINGS_TTL = 15 * 60_000;

async function mixFilings(items) {
  if (!filings.hasDartKey()) return items;

  const watch = store.get('watch') || DEFAULT_WATCH;
  const codes = watch.map((w) => filings.codeOf(w.symbol)).filter(Boolean);
  if (!codes.length) return items;

  /* 소식은 3분마다 스스로 갱신된다. 공시까지 그때마다 물으면 종목
     열 개에 한 시간이면 이백 번이다. 한도에 걸릴 양은 아니지만 그럴
     까닭도 없다 — 공시는 3분에 한 번 바뀌는 것이 아니다.
     받아 둔 것은 15분 동안 그대로 쓴다. */
  if (app.filings && Date.now() - app.filingsAt < FILINGS_TTL) {
    return [...app.filings, ...items].sort((a, b) => (b.time || 0) - (a.time || 0));
  }

  try {
    const list = await filings.recent({ codes, days: 3, max: 30 });
    app.filings = list;
    app.filingsAt = Date.now();
    if (!list.length) return items;

    // 급한 것은 속보로도 외친다
    for (const f of list) {
      if (f.score >= 7 && f.isNew) app.breaking.push(f);
    }

    return [...list, ...items].sort((a, b) => (b.time || 0) - (a.time || 0));
  } catch (err) {
    console.warn('[dart]', err);
    return items;
  }
}

function scheduleRefresh() {
  clearTimeout(app.timer);
  clearInterval(app.countdown);
  const nextEl = $('#nextRefresh');

  if (!store.get('autoRefresh')) { nextEl.textContent = ''; return; }

  const ms = (store.get('refreshSec') || 180) * 1000;
  const due = Date.now() + ms;

  app.timer = setTimeout(() => loadNews({ quiet: true }), ms);
  app.countdown = setInterval(() => {
    const left = due - Date.now();
    nextEl.textContent = left > 0 ? `다음 갱신 ${until(left)}` : '';
    if (left <= 0) clearInterval(app.countdown);
  }, 1000);
  nextEl.textContent = `다음 갱신 ${until(ms)}`;
}

/* ═══════════════════ 시세 ═══════════════════ */

async function loadQuotes({ quiet = false } = {}) {
  const btn = $('#btnQuotes');
  btn?.classList.add('is-busy');
  try {
    const watch = store.get('watch') || DEFAULT_WATCH;
    // 석 달치를 부른다. 묶음 부름은 어차피 한 번이라 닷새치와 값이 같은데,
    // 석 달이면 20일선을 셈할 수 있어 시장 폭이 살고 판의 잔선도 길어진다.
    const { quotes: qs, at } = await quotes.fetchWatch(watch, {
      fresh: !quiet, range: '3mo', interval: '1d',
    });
    app.quotes = qs;
    app.market.setQuotes(qs, at);
    app.watch.set(qs, at);
    paintBreadth(qs);
  } catch (err) {
    console.warn('[quotes]', err);
    if (!app.quotes.length) {
      app.breaking.notice('시세를 가져오지 못했습니다.', { kind: '알림' });
    }
  } finally {
    btn?.classList.remove('is-busy');
  }
}

/* ── 시장 폭 ──

   지수는 큰 것 몇에 끌려간다. 이 숫자는 안 끌려간다. 지수는 오르는데
   이것이 내려가고 있으면 몇 개가 전체를 끌고 있는 것이고, 그런 오름은
   대개 오래가지 않는다. 부름은 0이다 — 관심종목의 봉이 이미 있다. */
function paintBreadth(quotes) {
  const box = $('#breadth');
  if (!box) return;
  const b = breadth(quotes, 20);
  if (!b) { box.hidden = true; return; }

  box.hidden = false;
  box.textContent = `${b.above}/${b.total}`;
  box.title = `지켜보는 ${b.total} 가운데 ${b.above}이 20일선 위에 있습니다`
            + ` (${b.pct.toFixed(0)}%). 오늘 오른 것은 ${b.up}개입니다.`;
  box.className = 'breadth ' + (b.pct >= 60 ? 'is-wide' : b.pct <= 35 ? 'is-narrow' : '');
}

/* 차트는 시세를 부른 뒤에 나가는 부름이라, 공개 프록시가 잠깐 문턱을
   걸어 잠글 때 혼자 넘어지기 쉽다 — 목록은 찼는데 차트만 "길이
   막혔습니다" 로 남는 모양이 그것이다. 대개 한숨 쉬었다 다시 물으면
   열리므로, 사람이 단추를 누르기 전에 한 번은 조용히 다시 물어본다.

   기다리는 시간을 늘려 가며 두 번 더 묻는다. 문턱은 "몇 초에 몇 번" 으로
   세어지므로, 두 번 다 같은 간격으로 물으면 둘 다 같은 창 안에 떨어져
   함께 넘어진다. */
const CHART_RETRY_MS = [1200, 3500];

async function loadChart(symbol, rangeId) {
  const r = RANGES.find((x) => x.id === rangeId) || RANGES[3];
  app.market.chartLoading(true);

  for (let attempt = 0; attempt <= CHART_RETRY_MS.length; attempt++) {
    try {
      const q = await quotes.fetchOne(symbol, { range: r.id, interval: r.interval });
      app.chartQ = q;
      app.market.setChart(q, r.id);
      app.pick.show(q.symbol, q.ko || q.name);
      app.watch.live(q);
      return;
    } catch (err) {
      // 그새 다른 것을 골랐다면 옛 부름은 조용히 물러난다
      if (app.market.symbol !== symbol || app.market.range !== r.id) return;
      const naptime = CHART_RETRY_MS[attempt];
      if (naptime) { await wait(naptime); continue; }
      console.warn('[chart]', err);
      app.market.chartFailed(err.message);
    }
  }
}

/** 무엇을 볼 것인가가 바뀌었다 — 한 곳으로 모아 둔다 */
function goSymbol(sym, meta) {
  store.set('symbol', sym);
  app.market.setSymbol(sym);
  app.market.clearCompare();
  // 원화 환산과 재무는 그 종목의 것이다. 종목이 갈리면 같이 갈린다.
  if (app.fx?.on) { app.fx.on = false; $('#btnFx')?.classList.remove('is-on'); }
  if (app.fin && !$('#fin').hidden) app.fin.load(sym);
  app.watch.mark(sym);
  app.pick.show(sym, meta?.ko || nameOf(sym));
  loadChart(sym, app.market.range);
  app.nav?.show('chart');
}

/* ── 장부에 있는데 관심종목에 없는 것 ──

   장부의 종목은 시세를 알아야 평가손익이 나온다. 관심종목에 없으면
   아무도 안 부르므로 여기서 챙긴다. 관심종목에 넣지는 않는다 —
   판 것까지 오른쪽 칸에 쌓이면 그 칸이 장부가 되어 버린다. */
/* ── 섞인 돈을 하나로 모으려면 ──
   장부에 달러와 원이 함께 있으면 합계를 낼 수 없다. 지금 환율 하나면
   되므로 가볍다. 못 받으면 합계를 아예 안 낸다 — 틀린 합계보다 없는
   합계가 낫다. */
async function loadBookRates() {
  const base = store.get('bookBase') || 'KRW';
  const curs = [...new Set(book.all().map((t) => t.currency).filter((c) => c && c !== base))];
  if (!curs.length) return;

  app.rates ||= new Map();
  for (const c of curs) {
    if (app.rates.has(c)) continue;
    try { app.rates.set(c, await fx.latest(c, base)); }
    catch { /* 못 받으면 합계를 안 낸다 */ }
  }
  if (app.nav?.current === 'book') app.book?.paint();
}

async function loadBookQuotes() {
  const held = book.heldSymbols();
  const watch = (store.get('watch') || DEFAULT_WATCH).map((w) => w.symbol);
  const missing = held.filter((s) => !watch.includes(s));
  if (!missing.length) return;

  try {
    const got = await quotes.fetchSeries(missing, { range: '5d', interval: '1d' });
    // 시세판에는 안 올리고 값만 곁에 둔다
    const seen = new Set(app.quotes.map((q) => q.symbol));
    app.quotes = [...app.quotes, ...got.filter((q) => !seen.has(q.symbol))];
    if (app.nav?.current === 'book') app.book?.paint();
  } catch (err) {
    console.warn('[book quotes]', err);
  }
}

/* ═══════════════════ 분석 ═══════════════════

   한 해치 열둘을 부르는 일이라 무겁다. 그래서 분석 화면을 열 때만
   부르고, 한 번 부른 것은 5분 동안 다시 부르지 않는다. */

const ANA_TTL = 5 * 60_000;

async function loadAnalysis({ force = false } = {}) {
  if (!force && Date.now() - app.anaAt < ANA_TTL) return;
  app.ana.loading();
  try {
    const watch = store.get('watch') || DEFAULT_WATCH;
    // 두 해치를 부른다. 한 해치로는 "아무 날에나 들어갔다면 1년 뒤" 를
    // 셈할 시작점이 없다 — 250봉으로 250봉 뒤를 보려면 시작점이 하나뿐이다.
    const series = await quotes.fetchSeries(watch, { range: '2y', interval: '1d', fresh: force });
    app.anaAt = Date.now();
    app.ana.set(series, app.anaAt);
    app.stress?.paint();
    // 성적표는 이 두 해치를 그대로 쓴다. 일지 화면에 있을 때만 다시 그린다.
    if (app.nav?.current === 'journal') { app.score?.paint(); app.rules?.paint(); }
  } catch (err) {
    console.warn('[analysis]', err);
    app.ana.failed(err.message);
  }
}

/* ═══════════════════ 짓기 ═══════════════════ */

function build() {
  document.documentElement.dataset.tint = store.get('tint') || 'kr';

  /* ── 바탕 ── */
  app.veil = new Veil({ film: $('#veilFilm'), grid: $('#veilGrid') });
  if (store.get('motion') && !calmly()) app.veil.start();
  else app.veil.pause();

  /* ── 소식 ── */
  app.news = new NewsView({
    onOpen: (item) => app.reader.open(item),
    onRefresh: () => loadNews(),
    onTab: (cat) => {
      // 방금 본 갈래로 돌아온 것이면 다시 부르지 않는다.
      // 갈래를 오갈 때마다 열일곱 곳을 두드리면 낭비다.
      const hit = feed.cached(cat);
      if (hit && feed.age(cat) < 90_000) {
        app.news.set(hit.items, hit.at);
        scheduleRefresh();
        return;
      }
      loadNews({ quiet: true, force: true });
    },
  });

  app.reader = new Reader({
    watch: () => store.get('watch') || DEFAULT_WATCH,
    onSymbol: (sym) => goSymbol(sym),
  });

  app.breaking = new Breaking({
    onOpen: (item) => { if (item?.id && item.title) app.reader.open(item); },
    onUrgent: () => app.nav?.mark('news', true),
  });

  /* ── 시장 ── */
  app.market = new MarketView({
    onSymbol: (sym) => goSymbol(sym),
    onRange: (r) => loadChart(app.market.symbol, r),
  });
  app.market.buildIndicatorPanel();
  app.market.buildComparePanel((sym) => {
    const r = RANGES.find((x) => x.id === app.market.range) || RANGES[3];
    return quotes.fetchOne(sym, { range: r.id, interval: r.interval });
  });

  app.ana = new AnalysisView({ onSymbol: (sym) => goSymbol(sym) });

  /* ── 바깥 길로 받아 오는 판들 ── */
  app.macro = new MacroPanel({ openSettings: (g) => app.settings.open(g) });
  app.fin = new FinPanel();
  app.divs = new DivPanel();
  app.score = new ScoreCard({ series: () => app.ana?.series || [] });

  /* ── 나쁠 때만 드러나는 것 ──
     분석이 받아 둔 두 해치를 그대로 쓴다. 스트레스 재생은 더 긴 이력이
     있으면 좋지만, 없으면 베타로 갈음하고 갈음했다고 밝힌다. */
  app.stress = new StressPanel({
    series: () => app.ana?.series || [],
    marketSym: () => app.ana?.marketSym || '^KS11',
    value: () => app.bookValue || null,
    // 2008년까지 되짚으려면 스무 해치가 있어야 한다. 묶음 부름 한 번이다.
    fetchLong: (syms) => quotes.fetchSeries(syms, { range: '20y', interval: '1d' }),
    // 비중을 한 돈으로 모으려면 환율이 있어야 한다
    rateOf: (cur) => app.rates?.get(cur) ?? null,
    onSymbol: (sym) => goSymbol(sym),
  });

  /* ── 장부 ──
     이것이 들어오면 나머지가 전부 진짜가 된다. 위험 기여도는 가정된
     균등비중이 아니라 내 비중으로, 스트레스 재생은 내 조합으로. */
  app.book = new BookView({
    fetchSeries: (syms, range) => quotes.fetchSeries(syms, { range, interval: '1d' }),
    rateOf: (cur) => app.rates?.get(cur) ?? null,
    priceOf: (sym) => {
      if (app.chartQ?.symbol === sym && Number.isFinite(app.chartQ.price)) return app.chartQ.price;
      const q = app.quotes.find((x) => x.symbol === sym);
      if (q && Number.isFinite(q.price)) return q.price;
      const s = app.ana?.series?.find((x) => x.symbol === sym);
      return s?.bars?.length ? s.bars[s.bars.length - 1].c : null;
    },
    onSymbol: (sym) => goSymbol(sym),
    onChanged: () => {
      app.bookValue = null;
      app.stress?.paint();
      // 장부에 있는 것은 시세를 알아야 하므로 관심종목에 없으면 챙겨 둔다
      loadBookQuotes();
    },
    notice: (t) => app.breaking.notice(t, { kind: '장부', ms: 6000 }),
  });

  /* ── 규칙 감시 ── */
  app.rules = new RulePanel({
    barsOf: (sym) => app.ana?.series?.find((x) => x.symbol === sym)?.bars
                  || app.quotes.find((x) => x.symbol === sym)?.bars
                  || [],
    symbols: () => {
      const watch = store.get('watch') || DEFAULT_WATCH;
      const held = book.positions().rows.filter((p) => p.open)
        .map((p) => ({ symbol: p.symbol, ko: p.ko }));
      const seen = new Set(held.map((h) => h.symbol));
      return [...held, ...watch.filter((w) => !seen.has(w.symbol))];
    },
    onSymbol: (sym) => goSymbol(sym),
    notice: (t) => app.breaking.notice(t, { kind: '규칙', ms: 5000 }),
  });

  /* 원화 환산 — 차트의 봉만 갈아 끼우고 나머지는 그대로 둔다.
     되돌릴 때를 위해 원래 봉은 chartQ 가 들고 있다. */
  app.fx = new FxSwitch({
    chartQ: () => app.chartQ,
    redraw: (bars) => app.market.swapBars(bars, bars ? ' (원)' : ''),
    note: (text) => app.breaking.notice(text, { kind: '원화', ms: 12_000 }),
  });

  /* ── 머리띠의 고르개 ── */
  app.pick = new Picker({ onPick: (sym, meta) => goSymbol(sym, meta) });
  app.pick.show(app.market.symbol, nameOf(app.market.symbol));

  /* ── 오른쪽 관심종목 ── */
  app.watch = new WatchList({
    onPick: (sym) => goSymbol(sym),
    onChanged: () => { app.anaAt = 0; loadQuotes({ quiet: false }); },
  });
  app.watch.mark(app.market.symbol);

  /* ── 설정 ── */
  app.settings = new Settings({
    // 열쇠를 넣자마자 그 기능이 살아나야 한다. 설정을 닫고 화면을
    // 옮겨 다녀야 비로소 뜨면, 사람은 열쇠가 틀린 줄 안다.
    onKeys: (key) => {
      if (key === 'keyFred') app.macro?.load({ force: true });
      if (key === 'keyDart') { app.filingsAt = 0; loadNews({ quiet: true, force: true }); }
    },
    onAutoRefresh: () => scheduleRefresh(),
    onRefresh: () => loadNews(),
    onMotion: (v) => (v ? app.veil.start() : app.veil.pause()),
    onTint: () => { app.market.chart.draw(); app.market.setQuotes(app.quotes); },
    onRange: (r) => { app.market.range = r; },
    onWatchReset: () => app.watch.reset(),
    // 다른 PC 에서 가져온 설정을 화면에 반영한다
    onImported: () => {
      document.documentElement.dataset.tint = store.get('tint') || 'kr';
      $('#autoRefresh').checked = !!store.get('autoRefresh');
      app.market.chart.draw();
      app.market.setQuotes(app.quotes);
      app.anaAt = 0;
      scheduleRefresh();
      loadQuotes({ quiet: true });
      loadNews({ quiet: true, force: true });
    },
  });

  /* ── 화면 나누기 ──
     여섯 화면이 가운데 칸 하나를 나누어 쓴다. 숨어 있던 화면은 제
     크기를 몰랐으므로, 보일 때 다시 그리라고 알린다. */
  app.nav = new Nav({
    onShow: (id) => {
      if (id === 'chart') app.market.refresh();
      if (id === 'analysis') { loadAnalysis(); app.macro?.load(); loadBookRates(); }
      if (id === 'backtest') app.backtest?.refresh();
      if (id === 'book') { app.book?.paint(); loadBookQuotes(); loadBookRates(); }
      if (id === 'journal') { app.journal?.paint(); app.score?.paint(); app.rules?.paint(); }
    },
  });

  /* ── 투자일지 ── */
  app.journal = new JournalView({
    quotes: () => app.quotes,
    onSaved: () => app.breaking.notice('일지에 적어 두었습니다.', { kind: '일지', ms: 4000 }),
  });

  /* ── 전략 시험 ──
     시세를 부르는 일만 넘겨준다. 시험하는 셈은 backtest/engine.js 가
     혼자 하고, 이쪽 화면은 그것을 그리기만 한다. */
  app.backtest = new BacktestView({
    fetchBars: (symbol, range) => {
      const r = RANGES.find((x) => x.id === range) || RANGES[4];
      return quotes.fetchOne(symbol, { range: r.id, interval: r.interval });
    },
  });

  /* ── 시험 화면의 나머지 두 갈래 ──
     비중은 여럿을 한 번에 부르고(spark), 지도는 규칙 갈래가 이미
     받아 둔 봉을 그대로 쓴다. 백스물한 번 돌리자고 백스물한 번
     부를 까닭이 없다. */
  app.mix = new MixView({
    /* 눈금은 늘 하루로 고정한다.

       주간봉은 거래소마다 주가 시작하는 요일이 다르게 찍혀 나온다.
       서울과 뉴욕의 주간봉을 날짜로 짝지으면 하나도 안 맞아서, 여럿을
       섞는 이 갈래에서는 쓸 수 없다. 일봉은 장 여는 시각이 달라도
       같은 날짜에 찍히므로 짝이 맞는다. */
    fetchSeries: (syms, range) => quotes.fetchSeries(syms, { range, interval: '1d' }),
  });

  app.map = new MapView({
    strategy: () => app.backtest.strategy,
    bars: () => app.backtest.bars || [],
  });

  buildBtTabs();

  wireButtons();
  wireBus();

  // 콘솔에서 속을 들여다볼 수 있게 열어 둔다. 고칠 때 쓴다.
  app.load = { news: loadNews, quotes: loadQuotes, chart: loadChart, analysis: loadAnalysis };
  window.KTEMA = app;
}

function wireButtons() {
  $('#btnRefresh').addEventListener('click', () => loadNews());
  $('#btnQuotes').addEventListener('click', () => loadQuotes());

  $('#btnRefreshAll').addEventListener('click', (e) => {
    const b = e.currentTarget;
    b.classList.add('is-busy');
    Promise.allSettled([
      loadQuotes(),
      loadNews({ quiet: true, force: true }),
      loadChart(app.market.symbol, app.market.range),
      app.nav?.current === 'analysis' ? loadAnalysis({ force: true }) : null,
    ]).then(() => b.classList.remove('is-busy'));
  });

  $('#autoRefresh').checked = !!store.get('autoRefresh');
  $('#autoRefresh').addEventListener('change', (e) => {
    store.set('autoRefresh', e.target.checked);
    scheduleRefresh();
  });

  $('#btnSettings').addEventListener('click', () => app.settings.open());

  // 시장 폭을 누르면 그 숫자가 나온 자리로 간다
  $('#breadth')?.addEventListener('click', () => app.nav.show('market'));

  /* 지표·비교 서랍 — 둘 다 차트 아래에 있고, 한 번에 하나만 편다.
     둘 다 펴면 차트가 화면 밖으로 밀려난다. */
  const drawer = (mine, other) => {
    const a = $(mine), b = $(other);
    b.hidden = true;
    a.hidden = !a.hidden;
    if (!a.hidden) a.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  $('#btnIndicators').addEventListener('click', () => drawer('#inds', '#cmp'));
  $('#btnCompare').addEventListener('click', () => drawer('#cmp', '#inds'));
  $('#btnProfile').addEventListener('click', () => app.market.toggleProfile());
  $('#btnRatio').addEventListener('click', () => app.market.toggleRatio());
  $('#btnFin').addEventListener('click', () => app.fin.toggle(app.market.symbol));
  $('#btnFx').addEventListener('click', () => app.fx.toggle());
  $('#btnDiv').addEventListener('click', () => app.divs.toggle(app.market.symbol));

  /* 관심종목에 더하기 — 머리띠의 고르개를 그대로 쓴다.
     찾는 자리를 두 곳에 두면 둘 다 반쯤만 좋아진다. */
  $('#btnWatchAdd').addEventListener('click', () => {
    app.pick.open();
    app.pick.hooks.onPick = (sym, meta) => {
      const added = app.watch.add(sym, meta);
      app.breaking.notice(
        added ? `${meta?.ko || nameOf(sym)}을(를) 관심종목에 넣었습니다.` : '이미 목록에 있습니다.',
        { kind: '관심종목', ms: 4000 },
      );
      // 한 번 쓰고 원래 하던 일로 되돌린다
      app.pick.hooks.onPick = (s, m) => goSymbol(s, m);
    };
  });

  $('#btnWatchReset').addEventListener('click', () => app.watch.reset());

  $('#btnJournalOut').addEventListener('click', () => app.journal.exportFile());
  $('#btnJournalIn').addEventListener('click', () => app.journal.importFile());

  $('#brand').addEventListener('click', (e) => {
    e.preventDefault();
    app.nav.show('chart');
  });

  // 자판 — 도구에는 손이 빠른 길이 있어야 한다
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === '/') { e.preventDefault(); app.pick.open(); return; }
    if (e.key === 'r') loadNews();

    const jump = { c: 'chart', m: 'market', a: 'analysis', n: 'news', j: 'journal', b: 'backtest' };
    if (jump[e.key]) app.nav.show(jump[e.key]);
  });
}

/* ═══════════════════ 시험 화면의 갈래 ═══════════════════

   규칙·비중·지도는 묻는 것이 서로 다르다. 한 쪽에 다 쌓으면 아래로
   끝없이 길어지고, 지도는 규칙이 짜 놓은 것을 받아야 하므로 순서도
   있다. 그래서 갈래로 나누되 왼쪽부터 오른쪽으로 읽히게 두었다. */

const BT_TABS = [
  { id: 'rules', gr: 'Κανών',   ko: '규칙', pane: '#btPaneRules',
    note: '언제 사고 언제 파나' },
  { id: 'mix',   gr: 'Μερίς',   ko: '비중', pane: '#btPaneMix',
    note: '무엇을 얼마나, 얼마 만에 되돌리나' },
  { id: 'map',   gr: 'Χάρτης',  ko: '지도', pane: '#btPaneMap',
    note: '그 좋아 보이는 숫자가 우연인가' },
];

function buildBtTabs() {
  const host = $('#btTabs');
  if (!host) return;

  const show = (id) => {
    store.set('btTab', id);
    for (const t of BT_TABS) {
      $(t.pane).hidden = t.id !== id;
      host.querySelector(`[data-tab="${t.id}"]`)?.classList.toggle('is-on', t.id === id);
    }
    // '보기 전략'과 '시험한다'는 규칙 갈래의 것이다
    $('#btTools').hidden = id !== 'rules';
    // 규칙이 그새 바뀌었으면 다시 짓고, 안 바뀌었으면 돌려 둔 지도를
    // 그대로 둔다. 이십 초 걸린 것이 갈래를 오갔다고 사라지면 안 된다.
    if (id === 'map') app.map.refresh();
  };

  host.replaceChildren(...BT_TABS.map((t) => el('button', {
    type: 'button',
    role: 'tab',
    title: t.note,
    data: { tab: t.id },
    onclick: () => show(t.id),
  }, [
    el('span.tab__gr', { text: t.gr }),
    el('span.tab__ko', { text: t.ko }),
  ])));

  show(store.get('btTab') || 'rules');
}

function wireBus() {
  // 펼쳐 본 것은 목록에서도 읽은 것으로 흐려진다
  on('news:open', ({ item }) => app.news?.markRead(item.id));

  // 관심종목이 갈리면 분석은 낡은 것이 된다
  on('settings:changed', ({ key }) => {
    if (key === 'watch') app.anaAt = 0;
  });

  // 창을 덮어 두었을 때는 부르지 않는다. 돌아오면 한 번 부른다.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { app.veil?.pause(); return; }
    if (store.get('motion') && !calmly()) app.veil?.start();
    if (Date.now() - (app.quotesAt || 0) > 90_000) loadQuotes({ quiet: true });
  });
}

/* ═══════════════════ 설정 심기 ═══════════════════

   폴더에 settings.json 이 놓여 있으면 켜질 때 알아서 물어들인다.
   다른 PC 로 옮겨 갈 때 설정 화면을 열어 손으로 가져오지 않아도
   되게 하려는 것이다 — 파일만 폴더에 넣어 두면 된다.

   같은 파일을 볼 때마다 덮어쓰면, 새 PC 에서 취향을 바꿔 놓아도
   다음에 켤 때 도로 돌아가 버린다. 그래서 한 번 심은 파일은
   표시해 두고 두 번 심지 않는다. */

const SEED_MARK = 'ktema.seed.v1';

async function seedSettings() {
  try {
    const res = await fetch('settings.json', { cache: 'no-store' });
    if (!res.ok) return null;                       // 없으면 그냥 넘어간다

    const data = await res.json();
    const mark = `${data.savedAt || ''}|${data.version || 1}`;

    let already = null;
    try { already = localStorage.getItem(SEED_MARK); } catch { /* 무시 */ }
    if (already === mark) return null;              // 이미 심은 파일이다

    const { applied } = store.importAll(data);
    try { localStorage.setItem(SEED_MARK, mark); } catch { /* 무시 */ }
    return applied;
  } catch {
    return null;                                    // 파일이 깨졌어도 사이트는 뜬다
  }
}

/* ═══════════════════ 관문 ═══════════════════

   오늘 날짜의 월일이 열쇠다. 8월 27일이면 0827, 12월 12일이면 1212.

   이것은 자물쇠가 아니다. 답이 달력에 적혀 있으니 들어오려는 자를
   막지 못한다. 막을 셈이었다면 서버가 있어야 하고, 이 사이트에는
   서버가 없다. 이것은 문턱이다 — 오늘을 알고 온 이에게 열리는.

   날짜는 보는 사람의 기기 시각으로 셈한다. 시차가 있는 곳에서는
   그 기기의 오늘이 답이다. */

/** 오늘의 넉 자 — MMDD */
function todayCode(now = new Date()) {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return mm + dd;
}

function wireGate() {
  const form = $('#gateForm');
  const hint = $('#gateHint');
  const code = $('#gateCode');
  const digits = [0, 1, 2, 3].map((i) => $('#gateD' + i));

  const value = () => digits.map((d) => d.value).join('');
  const paint = () => { for (const d of digits) d.classList.toggle('is-filled', !!d.value); };

  digits.forEach((d, i) => {
    d.addEventListener('input', () => {
      d.value = d.value.replace(/\D/g, '').slice(0, 1);
      paint();
      if (d.value && i < 3) digits[i + 1].focus();
      if (i === 3 && value().length === 4) form.requestSubmit();
    });

    d.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !d.value && i > 0) {
        digits[i - 1].focus();
        digits[i - 1].value = '';
        paint();
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft' && i > 0) digits[i - 1].focus();
      if (e.key === 'ArrowRight' && i < 3) digits[i + 1].focus();
    });

    // 붙여넣기 — 0827 을 통째로 넣는 사람이 있다
    d.addEventListener('paste', (e) => {
      const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
      if (!text) return;
      e.preventDefault();
      text.slice(0, 4).split('').forEach((ch, n) => { if (digits[n]) digits[n].value = ch; });
      paint();
      digits[Math.min(3, text.length - 1)].focus();
      if (value().length === 4) form.requestSubmit();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const got = value();

    if (got.length < 4) {
      hint.textContent = '넉 자를 다 넣어 주십시오.';
      hint.className = 'gate__hint is-wrong';
      digits.find((d) => !d.value)?.focus();
      return;
    }

    if (got !== todayCode()) {
      code.classList.add('is-wrong');
      hint.textContent = '오늘이 아닙니다. 월과 일, 넉 자입니다.';
      hint.className = 'gate__hint is-wrong';
      setTimeout(() => {
        code.classList.remove('is-wrong');
        for (const d of digits) d.value = '';
        paint();
        digits[0].focus();
      }, 420);
      return;
    }

    hint.textContent = '열립니다.';
    hint.className = 'gate__hint is-open';
    enter();
  });

  digits[0].focus();
}

/**
 * 관문을 연다.
 *
 * 여기서 무엇이 잘못되든 화면은 반드시 나와야 한다. 예전에는 중간에
 * 하나만 어긋나도 관문이 흐려진 채 굳어 버려 아무것도 할 수 없었다.
 * 그래서 화면을 드러내는 일을 가장 먼저, 되돌릴 수 없게 해 둔다.
 */
async function enter() {
  const gate = $('#gate');
  $('#enter').classList.add('is-waking');

  // ── 1. 무슨 일이 있어도 화면부터 드러낸다 ──
  document.body.dataset.phase = 'app';
  $('#app').hidden = false;
  gate.classList.add('is-gone');
  // 애니메이션이 돌지 못하는 창(뒤에 있거나 최소화)에서도 관문이
  // 남지 않도록 시간으로 한 번 더 치운다. setTimeout 은 rAF 와 달리
  // 창이 보이지 않아도 돈다.
  setTimeout(() => { gate.hidden = true; }, 1000);

  try {
    // 폴더에 놓인 설정 파일이 있으면 화면을 짓기 전에 먼저 심는다.
    // 짓고 나서 심으면 이미 그려진 값들이 옛 설정으로 남는다.
    const seeded = await app.seeding;

    build();
    store.set('seen', true);

    if (seeded) {
      app.breaking.notice(`가져온 설정 ${seeded}가지를 적용했습니다.`, { kind: '설정', ms: 8000 });
    }

    // 숫자가 먼저다. 소식은 그 뒤에 조용히 채워 넣는다.
    await loadQuotes({ quiet: true });
    app.quotesAt = Date.now();
    loadChart(app.market.symbol, app.market.range);
    loadNews({ quiet: true });
    loadBookQuotes();

    setInterval(() => {
      if (document.hidden) return;
      app.quotesAt = Date.now();
      loadQuotes({ quiet: true });
    }, 90_000);
  } catch (err) {
    console.error('[enter]', err);
    fail(err);
  }
}

/** 켜는 중에 넘어졌을 때 — 조용히 죽지 말고 무엇이 잘못됐는지 보여 준다 */
function fail(err) {
  document.body.appendChild(el('div.bootfail', [
    el('strong', { text: '켜는 중에 문제가 생겼습니다.' }),
    el('code', { text: String(err?.message || err) }),
    el('span', { text: '새로 고침(F5)을 해 보시고, 그래도 같으면 진단.html 을 열어 보십시오.' }),
  ]));
}

/* ═══════════════════ 켜기 ═══════════════════ */

(function boot() {
  // 관문을 지나기 전에 미리 시작해 둔다. 사람이 넉 자를 넣을 때쯤이면
  // 대개 끝나 있어서 기다리는 느낌이 없다.
  app.seeding = seedSettings();
  checkSelfProxy();

  gateFilm($('#gateFilm'));
  wireGate();
}());
