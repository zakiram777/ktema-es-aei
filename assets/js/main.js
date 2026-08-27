/* ═══════════════════════════════════════════════════════════════
   main.js — 모든 것을 잇는 자리

   각 조각은 서로를 모른다. 여기서만 서로를 안다. 그래서 조각 하나를
   갈아 끼워도 나머지는 그대로 둘 수 있다.

   흐름
     관문을 지난다 → 자키람이 깨어난다 → 소식과 시세를 부른다
     → 시세로 낯빛을 정한다 → 소식이 오면 속보를 가려 외친다
   ═══════════════════════════════════════════════════════════════ */

import { $, el, wait, calmly } from './core/dom.js';
import { on, emit } from './core/bus.js';
import * as store from './core/store.js';
import { until, isKorean } from './core/fmt.js';

import { checkSelfProxy } from './net/proxy.js';

import * as feed from './news/feed.js';
import { NewsView } from './news/view.js';
import { Reader } from './news/reader.js';
import { Breaking } from './news/breaking.js';

import * as quotes from './market/quotes.js';
import { MarketView } from './market/view.js';
import { DEFAULT_WATCH, RANGES } from './market/symbols.js';

import * as tts from './voice/tts.js';
import * as script from './voice/script.js';

import { Stage } from './zakiram/stage.js';
import { Mouth } from './zakiram/mouth.js';
import * as mood from './zakiram/mood.js';

import { Ambience, drawSealTicks } from './ui/ambience.js';
import { Settings } from './ui/settings.js';

/* ═══════════════════ 상태 ═══════════════════ */

const app = {
  stage: null,
  mouth: null,
  ambience: null,
  news: null,
  reader: null,
  breaking: null,
  market: null,
  settings: null,
  timer: 0,
  countdown: 0,
  seeding: null,
  quotes: [],
  chartQ: null,
};

/* ═══════════════════ 자키람의 말 ═══════════════════ */

const sayEl = $('#sayText');
const btnStop = $('#btnSpeakStop');

/**
 * 지금 하는 말을 적어 둔다 — 눈에 보이지 않는 자리에.
 *
 * 예전에는 자키람 옆에 그 말을 그대로 띄웠다. 그런데 글자가 뜨면
 * 사람의 눈이 그리로 가서, 정작 자키람의 얼굴을 보지 않게 된다.
 * 읽는 것은 귀로 듣고 얼굴로 보는 편이 낫다. 다만 화면 낭독기를
 * 쓰는 사람에게는 남겨 두어야 하므로 sr-only 자리에 적는다.
 */
function showSaying(text) {
  if (sayEl) sayEl.textContent = text || '';
}

/**
 * 자키람이 말하게 하는 하나뿐인 문. 어디서 부르든 여기를 지난다.
 * @param {string[]|string} lines
 */
function speak(lines, opts = {}) {
  const arr = [].concat(lines).filter(Boolean);
  if (!arr.length) return;

  const lang = opts.lang || (isKorean(arr.join(' ')) ? 'ko' : 'en');

  // 말하는 동안에는 입이 살아 있는 구간으로
  app.stage?.setMood(mood.speakingMood(opts.mood || mood.mood()));

  tts.speak(arr, {
    lang,
    onstart: () => {
      app.stage?.setSpeaking(true);
      btnStop.hidden = false;
    },
    onchunk: (i, text) => showSaying(text),
    onend: () => {
      app.stage?.setSpeaking(false);
      btnStop.hidden = true;
      setTimeout(() => { if (!tts.speaking()) showSaying(''); }, 2600);
      app.stage?.setMood(mood.mood());
      opts.onend?.();
    },
  });
}

function hush() {
  tts.stop();
  app.stage?.setSpeaking(false);
  btnStop.hidden = true;
  showSaying('');
}

/* ═══════════════════ 소식 ═══════════════════ */

async function loadNews({ quiet = false, force = false } = {}) {
  const btn = $('#btnRefresh');
  btn.classList.add('is-busy');
  if (!quiet && !feed.cached(app.news.cat)) app.news.loading();

  try {
    const { items, at } = await feed.load(app.news.cat, { force });
    app.news.set(items, at);

    if (!quiet) {
      const fresh = items.filter((x) => x.isNew).length;
      const line = script.forRefresh(items.length, fresh, 'ko');
      app.breaking.notice(line, { kind: '갱신', ms: 6000 });
      // 새 것이 없으면 굳이 말하지 않는다. 조용한 편이 낫다.
      if (fresh > 0 && !tts.speaking()) speak([line], { lang: 'ko' });
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
  btn.classList.add('is-busy');
  try {
    const watch = store.get('watch') || DEFAULT_WATCH;
    const { quotes: qs, at } = await quotes.fetchWatch(watch, { fresh: !quiet });
    app.quotes = qs;
    app.market.setQuotes(qs, at);

    const m = mood.read(qs);
    paintMood(m, mood.moodScore());
  } catch (err) {
    console.warn('[quotes]', err);
    if (!app.quotes.length) {
      app.breaking.notice('시세를 가져오지 못했습니다.', { kind: '알림' });
    }
  } finally {
    btn.classList.remove('is-busy');
  }
}

/* 차트는 시세와 소식을 다 부른 뒤에 마지막으로 나가는 부름이다. 그래서
   공개 프록시가 잠깐 문턱을 걸어 잠글 때 혼자 넘어지기 쉽다 — 목록은
   찼는데 차트만 "길이 막혔습니다" 로 남는 모양이 그것이다. 대개 한숨
   쉬었다 다시 물으면 열리므로, 사람이 단추를 누르기 전에 한 번은
   조용히 다시 물어본다.

   기다리는 시간을 늘려 가며 두 번 더 묻는다. 문턱은 "몇 초에 몇 번" 으로
   세어지므로, 두 번 다 같은 간격으로 물으면 둘 다 같은 창 안에 떨어져
   함께 넘어진다. 1.2초 뒤에 한 번, 그래도 안 되면 3.5초 뒤에 한 번이면
   대개 창이 지나가 있다. */
const CHART_RETRY_MS = [1200, 3500];

async function loadChart(symbol, rangeId) {
  const r = RANGES.find((x) => x.id === rangeId) || RANGES[3];
  app.market.chartLoading(true);

  for (let attempt = 0; attempt <= CHART_RETRY_MS.length; attempt++) {
    try {
      const q = await quotes.fetchOne(symbol, { range: r.id, interval: r.interval });
      app.chartQ = q;
      app.market.setChart(q, r.id);
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

/* ═══════════════════ 낯빛 ═══════════════════ */

function paintMood(m, score) {
  app.stage?.setMood(m);
  const bar = $('#moodBar');
  const val = $('#moodVal');
  if (bar) {
    const clamped = Math.max(-3, Math.min(3, score || 0));
    bar.style.left = `${50 + (clamped / 3) * 46}%`;
  }
  if (val) {
    val.textContent = Number.isFinite(score)
      ? `${score > 0 ? '+' : ''}${score.toFixed(2)}%`
      : '—';
    val.className = `meter__val ${score > 0.05 ? 'up' : score < -0.05 ? 'down' : ''}`;
  }
}

/* ═══════════════════ 짓기 ═══════════════════ */

function build() {
  document.documentElement.dataset.tint = store.get('tint') || 'kr';

  /* ── 배경 ── */
  drawSealTicks($('#sealTicks'));
  app.ambience = new Ambience($('#sky'));
  if (store.get('motion') && !calmly()) app.ambience.start();

  /* ── 자키람 ── */
  app.stage = new Stage($('#zak'));
  // 음소를 따라 움직이는 입. 스스로 bus 를 듣고 그린다.
  app.mouth = new Mouth($('#zak'));

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
    onStart: () => {
      app.stage?.setSpeaking(true);
      app.stage?.setMood(mood.speakingMood());
      btnStop.hidden = false;
    },
    onChunk: (text) => showSaying(text),
    onEnd: () => {
      app.stage?.setSpeaking(false);
      app.stage?.setMood(mood.mood());
      btnStop.hidden = true;
      setTimeout(() => { if (!tts.speaking()) showSaying(''); }, 2600);
    },
  });

  app.breaking = new Breaking({
    stage: app.stage,
    onOpen: (item) => { if (item?.id && item.title) app.reader.open(item); },
    onSpeak: (lines) => showSaying(lines.join(' ')),
  });

  /* ── 시장 ── */
  app.market = new MarketView({
    onSymbol: (sym) => {
      store.set('symbol', sym);
      app.market.setSymbol(sym);
      loadChart(sym, app.market.range);
      $('#market').scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    onRange: (r) => loadChart(app.market.symbol, r),

    // 숫자를 눌렀을 때
    onSpeakValue: (v) => {
      if (v.text) { speak([v.text], { lang: 'ko' }); return; }
      const { lines, lang } = script.forValue({ ...v, lang: 'ko' });
      speak(lines, { lang });
    },

    // 봉 하나를 눌렀을 때
    onSpeakBar: (bar, i, bars, sym) => {
      const prev = bars[i - 1];
      const ch = prev ? bar.c - prev.c : null;
      const chPct = prev ? ((bar.c - prev.c) / prev.c) * 100 : null;
      const when = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' })
        .format(new Date(bar.t));
      const name = app.chartQ?.ko || sym;
      const { lines, lang } = script.forValue({
        label: `${name} ${when} 종가`,
        value: bar.c,
        change: ch,
        changePct: chPct,
        lang: 'ko',
      });
      speak(lines, { lang });
    },
  });

  /* ── 설정 ── */
  app.settings = new Settings({
    onAutoRefresh: () => scheduleRefresh(),
    onRefresh: () => loadNews(),
    onMotion: (v) => (v ? app.ambience.start() : app.ambience.pause()),
    // 입 자리를 맞추는 동안에는 얼굴 위를 눌러 옮길 수 있다
    onAlign: (on) => {
      app.mouth?.setAlign(on);
      if (on) {
        $('#zak').scrollIntoView({ block: 'center', behavior: 'smooth' });
        app.breaking.notice('자키람의 입 위를 눌러 자리를 잡아 주십시오.', { kind: '입 맞추기', ms: 9000 });
      }
    },
    onTint: () => { app.market.chart.draw(); app.market.setQuotes(app.quotes); },
    // 다른 PC 에서 가져온 설정을 화면에 반영한다
    onImported: () => {
      document.documentElement.dataset.tint = store.get('tint') || 'kr';
      $('#autoRefresh').checked = !!store.get('autoRefresh');
      app.market.chart.draw();
      app.market.setQuotes(app.quotes);
      scheduleRefresh();
      loadNews({ quiet: true, force: true });
    },
  });

  wireButtons();
  wireBus();

  // 콘솔에서 속을 들여다볼 수 있게 열어 둔다. 고칠 때 쓴다.
  window.KTEMA = app;
}

function wireButtons() {
  $('#btnRefresh').addEventListener('click', () => loadNews());
  $('#btnQuotes').addEventListener('click', () => {
    loadQuotes();
    loadChart(app.market.symbol, app.market.range);
  });

  $('#autoRefresh').checked = !!store.get('autoRefresh');
  $('#autoRefresh').addEventListener('change', (e) => {
    store.set('autoRefresh', e.target.checked);
    scheduleRefresh();
  });

  btnStop.addEventListener('click', hush);

  $('#btnBrief').addEventListener('click', () => {
    if (tts.speaking()) { hush(); return; }
    const { lines, lang } = script.forBriefing(app.quotes, mood.mood(), 'ko');
    speak(lines, { lang });
  });

  $('#btnReadChart').addEventListener('click', () => {
    if (tts.speaking()) { hush(); return; }
    if (!app.chartQ) return;
    const view = app.market.chartView(app.chartQ);
    if (!view) return;
    const { lines, lang } = script.forChart(view, 'ko');
    speak(lines, { lang });
  });

  const btnMute = $('#btnMute');
  const paintMute = () => {
    const m = store.get('muted');
    btnMute.setAttribute('aria-pressed', m ? 'true' : 'false');
    btnMute.querySelector('.ico').dataset.ico = m ? 'mute' : 'sound';
    btnMute.querySelector('.btn__label').textContent = m ? '소리 꺼짐' : '소리';
    btnMute.classList.toggle('btn--gold', !m);
  };
  btnMute.addEventListener('click', () => {
    const next = !store.get('muted');
    store.set('muted', next);
    if (next) hush();
    paintMute();
  });
  paintMute();

  $('#btnVoice').addEventListener('click', () => app.settings.open('voice'));
  $('#btnSettings').addEventListener('click', () => app.settings.open());

  $('#brand').addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // 자판
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'r' && !e.metaKey && !e.ctrlKey) loadNews();
    if (e.key === 'm') $('#btnMute').click();
    if (e.key === 'Escape' && tts.speaking()) hush();
  });
}

function wireBus() {
  // 펼쳐 본 것은 목록에서도 읽은 것으로 흐려진다
  on('news:open', ({ item }) => app.news?.markRead(item.id));

  on('mood:changed', ({ mood: m, score }) => paintMood(m, score));

  // 속보로 곤두선 뒤에는 시세를 다시 보고 낯빛을 되돌린다
  setInterval(() => {
    const m = mood.settle(app.quotes);
    if (m !== app.stage?.mood) paintMood(m, mood.moodScore());
  }, 8000);

  on('settings:changed', ({ key }) => {
    if (key === 'voiceKo' || key === 'voiceEn') tts.refreshVoices();
  });
}

/* ═══════════════════ 설정 심기 ═══════════════════

   폴더에 settings.json 이 놓여 있으면 켜질 때 알아서 물어들인다.
   다른 PC 로 옮겨 갈 때 설정 화면을 열어 손으로 가져오지 않아도
   되게 하려는 것이다 — 파일만 폴더에 넣어 두면 된다.

   같은 파일을 볼 때마다 덮어쓰면, 새 PC 에서 취향을 바꿔 놓아도
   다음에 켤 때 도로 돌아가 버린다. 그래서 한 번 심은 파일은
   표시해 두고 두 번 심지 않는다. 파일을 새로 내보내 갈아 끼우면
   표시가 달라지므로 그때는 다시 심는다. */

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

   브라우저는 사람이 한 번 눌러 주기 전에는 소리를 내지 못하게
   막는다. 그래서 첫 누름이 필요하다. 그 필요를 사이트의 첫 장면으로
   삼았다 — 관문을 지나야 자키람이 깨어난다. */

/**
 * 관문을 연다.
 *
 * 여기서 무엇이 잘못되든 화면은 반드시 나와야 한다. 예전에는 중간에
 * 하나만 어긋나도 관문이 흐려진 채 굳어 버려 아무것도 할 수 없었다.
 * 그래서 화면을 드러내는 일을 가장 먼저, 되돌릴 수 없게 해 둔다.
 */
async function enter() {
  const gate = $('#gate');
  const btn = $('#enter');
  btn.classList.add('is-waking');

  // ── 1. 무슨 일이 있어도 화면부터 드러낸다 ──
  document.body.dataset.phase = 'app';
  $('#app').hidden = false;
  gate.classList.add('is-gone');
  // 애니메이션이 돌지 못하는 창(뒤에 있거나 최소화)에서도 관문이
  // 남지 않도록 시간으로 한 번 더 치운다. setTimeout 은 rAF 와 달리
  // 창이 보이지 않아도 돈다.
  setTimeout(() => { gate.hidden = true; }, 1000);

  try {
    // 이 누름이 소리의 문을 연다
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
    } catch { /* 무시 */ }

    // 폴더에 놓인 설정 파일이 있으면 화면을 짓기 전에 먼저 심는다.
    // 짓고 나서 심으면 이미 그려진 값들이 옛 설정으로 남는다.
    const seeded = await app.seeding;

    build();
    store.set('seen', true);

    if (seeded) {
      app.breaking.notice(
        `가져온 설정 ${seeded}가지를 적용했습니다.`,
        { kind: '설정', ms: 8000 },
      );
    }

    // 소식과 시세를 먼저 부른다. 자키람이 늦게 깨어나더라도
    // 글과 숫자는 그동안 채워진다.
    loadNews({ quiet: true });
    loadQuotes({ quiet: true }).then(() => {
      loadChart(app.market.symbol, app.market.range);
    });
    setInterval(() => loadQuotes({ quiet: true }), 90_000);

    // 자키람을 세운다. 여기서 넘어져도 나머지는 이미 살아 있다.
    try { await app.stage.start(); }
    catch (err) { console.error('[zakiram]', err); }

    await tts.warm();

    await wait(900);
    if (!store.get('muted')) speak([script.greeting('ko')], { lang: 'ko' });
  } catch (err) {
    console.error('[enter]', err);
    fail(err);
  }
}

/** 켜는 중에 넘어졌을 때 — 조용히 죽지 말고 무엇이 잘못됐는지 보여 준다 */
function fail(err) {
  const box = el('div.bootfail', [
    el('strong', { text: '켜는 중에 문제가 생겼습니다.' }),
    el('code', { text: String(err?.message || err) }),
    el('span', { text: '새로 고침(F5)을 해 보시고, 그래도 같으면 진단.html 을 열어 보십시오.' }),
  ]);
  document.body.appendChild(box);
}

/* ═══════════════════ 켜기 ═══════════════════ */

(async function boot() {
  // 관문을 지나기 전에 미리 시작해 둔다. 사람이 단추를 누를 때쯤이면
  // 대개 끝나 있어서 기다리는 느낌이 없다.
  app.seeding = seedSettings();
  checkSelfProxy();

  const btn = $('#enter');
  btn.addEventListener('click', enter, { once: true });

  // 자판으로도 들어갈 수 있게
  document.addEventListener('keydown', function first(e) {
    if (document.body.dataset.phase !== 'gate') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      document.removeEventListener('keydown', first);
      btn.click();
    }
  });

  if (!tts.supported) {
    $('.gate__hint').textContent =
      '이 브라우저는 음성 합성을 지원하지 않습니다. 소식과 차트는 그대로 볼 수 있습니다.';
  }
})();
