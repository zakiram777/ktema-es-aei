/* ═══════════════════════════════════════════════════════════════
   script.js — 자키람이 무슨 말을 하는가

   목소리보다 말투가 사람을 만든다. 자키람은 값을 읽어 주는
   비서지 점쟁이가 아니다. 그래서 규칙을 셋 두었다.

     1. 본 것만 말한다. 사지도 팔지도 권하지 않는다.
     2. 짧게 말한다. 한 문장에 하나씩.
     3. 기분은 말투에 스밀 뿐, 판단을 물들이지 않는다.

   여기서 만든 글이 곧 tts 로 간다. 화면에도 같은 글이 뜬다.
   ═══════════════════════════════════════════════════════════════ */

import { sayNum, sayPrice, sayChange, sayBig, sayDate, speakable, isKorean } from '../core/fmt.js';

/* ─────────────── 인사 ─────────────── */

const HELLO_KO = [
  '자키람입니다. 시장을 보고 있습니다.',
  '자키람입니다. 무엇을 읽어 드릴까요.',
  '자키람입니다. 오늘의 소식이 모였습니다.',
];
const HELLO_EN = [
  'I am Zakiram. I am watching the market.',
  'I am Zakiram. What shall I read for you.',
];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const greeting = (lang = 'ko') => pick(lang === 'en' ? HELLO_EN : HELLO_KO);

/* ─────────────── 기사 읽기 ───────────────

   제목 → (있으면) 머리표 → 요약. 출처와 시각을 앞에 붙여
   지금 무엇을 듣고 있는지 알 수 있게 한다. */

export function forArticle(item, { lang = 'auto', withBody = true } = {}) {
  const L = lang === 'auto' ? (isKorean(item.fullTitle || item.title) ? 'ko' : 'en') : lang;
  const lines = [];

  if (L === 'ko') {
    const head = item.flag ? `${item.flag}입니다.` : `${item.srcName} 소식입니다.`;
    lines.push(head);
    lines.push(speakable(item.title, 'ko'));
    if (withBody && item.summary) {
      const body = speakable(item.summary, 'ko');
      if (body && body.length > 24) lines.push(body);
    }
  } else {
    lines.push(item.flag ? `${item.flag}.` : `From ${item.srcName}.`);
    lines.push(speakable(item.title, 'en'));
    if (withBody && item.summary) {
      const body = speakable(item.summary, 'en');
      if (body && body.length > 24) lines.push(body);
    }
  }

  return { lang: L, lines: lines.filter(Boolean) };
}

/* ─────────────── 속보 ───────────────

   스스로 끼어들어 말하는 자리다. 그러니 더 짧아야 한다.
   제목 하나와 출처만. 나머지는 눌러 보면 된다. */

export function forBreaking(item) {
  const L = isKorean(item.fullTitle || item.title) ? 'ko' : 'en';
  const head = L === 'ko'
    ? (item.flag ? `${item.flag}.` : '속보입니다.')
    : (item.flag ? `${item.flag}.` : 'Breaking news.');
  return {
    lang: L,
    lines: [head, speakable(item.title, L)],
  };
}

/* ─────────────── 값 하나 ───────────────

   숫자를 눌렀을 때. 무엇의 값인지 → 얼마인지 → 어떻게 움직였는지. */

export function forValue({ label, value, unit, change, changePct, lang = 'ko' }) {
  const L = lang;
  const parts = [];

  if (L === 'ko') {
    let head = label ? `${label},` : '';
    if (typeof value === 'number') {
      head += ` ${sayPrice(value, 'ko')}`;
      if (unit) head += ` ${unit}`;
      head += '입니다.';
    } else if (value != null) {
      head += ` ${value}입니다.`;
    }
    parts.push(head.trim());
    if (Number.isFinite(changePct)) {
      parts.push(sayChange(change ?? 0, changePct, 'ko'));
    }
  } else {
    let head = label ? `${label},` : '';
    if (typeof value === 'number') {
      head += ` ${sayPrice(value, 'en')}`;
      if (unit) head += ` ${unit}`;
      head += '.';
    } else if (value != null) head += ` ${value}.`;
    parts.push(head.trim());
    if (Number.isFinite(changePct)) parts.push(sayChange(change ?? 0, changePct, 'en'));
  }

  return { lang: L, lines: parts.filter(Boolean) };
}

/* ─────────────── 종목 하나 ─────────────── */

export function forQuote(q, lang = 'ko') {
  const L = lang;
  const name = L === 'ko' ? (q.ko || q.name || q.symbol) : (q.name || q.symbol);
  const lines = [];

  if (L === 'ko') {
    lines.push(`${name}, 현재 ${sayPrice(q.price, 'ko')}${q.currency === 'KRW' ? ' 원' : ''}입니다.`);
    if (Number.isFinite(q.changePct)) lines.push(sayChange(q.change, q.changePct, 'ko'));
  } else {
    lines.push(`${name} is at ${sayPrice(q.price, 'en')}.`);
    if (Number.isFinite(q.changePct)) lines.push(sayChange(q.change, q.changePct, 'en'));
  }
  return { lang: L, lines };
}

/* ─────────────── 차트 한 판 ───────────────

   눈에 보이는 것만 말한다. 추세가 어디로 향하는지는 말하되
   앞으로 어떻게 될지는 말하지 않는다. */

export function forChart(view, lang = 'ko') {
  const { symbol, name, bars, range, last, first, hi, lo, ma20, ma60 } = view;
  const L = lang;
  const lines = [];
  if (!bars?.length) {
    return { lang: L, lines: [L === 'ko' ? '아직 그릴 것이 없습니다.' : 'Nothing to read yet.'] };
  }

  const span = {
    '1mo': L === 'ko' ? '한 달' : 'one month',
    '3mo': L === 'ko' ? '석 달' : 'three months',
    '6mo': L === 'ko' ? '여섯 달' : 'six months',
    '1y':  L === 'ko' ? '한 해' : 'one year',
    '5y':  L === 'ko' ? '다섯 해' : 'five years',
    '5d':  L === 'ko' ? '닷새' : 'five days',
  }[range] || range;

  const total = ((last - first) / first) * 100;
  const fromHi = ((last - hi.v) / hi.v) * 100;
  const fromLo = ((last - lo.v) / lo.v) * 100;

  if (L === 'ko') {
    lines.push(`${name || symbol}, ${span} 차트입니다.`);
    lines.push(`지금 ${sayPrice(last, 'ko')}, 이 구간 처음보다 ${sayNum(Math.abs(total), 'ko')} 퍼센트 ${total >= 0 ? '높습니다' : '낮습니다'}.`);
    lines.push(`가장 높았던 자리는 ${sayDate(hi.t, 'ko')}의 ${sayPrice(hi.v, 'ko')}, 가장 낮았던 자리는 ${sayDate(lo.t, 'ko')}의 ${sayPrice(lo.v, 'ko')}입니다.`);
    lines.push(`고점에서 ${sayNum(Math.abs(fromHi), 'ko')} 퍼센트 아래, 저점에서 ${sayNum(Math.abs(fromLo), 'ko')} 퍼센트 위에 있습니다.`);

    if (Number.isFinite(ma20) && Number.isFinite(ma60)) {
      const above20 = last >= ma20, above60 = last >= ma60;
      if (above20 && above60) lines.push('가격이 20일선과 60일선 위에 있습니다.');
      else if (!above20 && !above60) lines.push('가격이 20일선과 60일선 아래에 있습니다.');
      else lines.push(`20일선 ${above20 ? '위' : '아래'}, 60일선 ${above60 ? '위' : '아래'}입니다.`);
    }
    lines.push('여기까지가 보이는 것입니다. 판단은 두고 갑니다.');
  } else {
    lines.push(`${name || symbol}, ${span} chart.`);
    lines.push(`Now at ${sayPrice(last, 'en')}, ${sayNum(Math.abs(total), 'en')} percent ${total >= 0 ? 'above' : 'below'} where this range began.`);
    lines.push(`The high was ${sayPrice(hi.v, 'en')} on ${sayDate(hi.t, 'en')}. The low was ${sayPrice(lo.v, 'en')} on ${sayDate(lo.t, 'en')}.`);
    lines.push('That is what I can see. The judgement I leave to you.');
  }

  return { lang: L, lines };
}

/* ─────────────── 시장 한 바퀴 ───────────────

   "지금 시장 브리핑" 단추. 지수 몇 개를 훑고 기분을 한 줄로. */

export function forBriefing(quotes, mood, lang = 'ko') {
  const L = lang;
  const lines = [];
  const list = quotes.filter((q) => Number.isFinite(q.changePct)).slice(0, 6);

  if (!list.length) {
    return { lang: L, lines: [L === 'ko' ? '아직 시세가 오지 않았습니다.' : 'No quotes yet.'] };
  }

  const now = new Date();
  if (L === 'ko') {
    lines.push(`${now.getHours()}시 ${now.getMinutes()}분 기준입니다.`);
    for (const q of list) {
      const nm = q.ko || q.name || q.symbol;
      const d = q.changePct > 0 ? '올랐습니다' : q.changePct < 0 ? '내렸습니다' : '그대로입니다';
      lines.push(`${nm} ${sayPrice(q.price, 'ko')}, ${sayNum(Math.abs(q.changePct), 'ko')} 퍼센트 ${d}.`);
    }
    lines.push(moodLine(mood, 'ko'));
  } else {
    lines.push('Here is where the market stands.');
    for (const q of list) {
      lines.push(`${q.name || q.symbol} at ${sayPrice(q.price, 'en')}, ${sayNum(Math.abs(q.changePct), 'en')} percent ${q.changePct >= 0 ? 'up' : 'down'}.`);
    }
    lines.push(moodLine(mood, 'en'));
  }
  return { lang: L, lines };
}

/* ─────────────── 기분을 한 줄로 ───────────────
   시장이 어떤 얼굴인지 말한다. 어떻게 하라는 말은 하지 않는다. */

const MOOD_LINE = {
  elated: {
    ko: ['넓게 오르고 있습니다. 이런 날일수록 값을 두 번 보십시오.'],
    en: ['A broad rise today. On days like this, look twice at the price.'],
  },
  bright: {
    ko: ['대체로 오르는 쪽입니다.'],
    en: ['Leaning green today.'],
  },
  serene: {
    ko: ['조용합니다. 크게 움직인 것이 없습니다.'],
    en: ['Quiet. Nothing has moved much.'],
  },
  grave: {
    ko: ['내리는 쪽이 많습니다.'],
    en: ['More red than green.'],
  },
  sorrow: {
    ko: ['깊게 내렸습니다. 오늘의 숫자는 오늘의 것입니다.'],
    en: ['A deep fall. Today’s numbers belong to today.'],
  },
  intense: {
    ko: ['방향이 엇갈립니다. 흔들림이 큽니다.'],
    en: ['Mixed and choppy.'],
  },
  alert: {
    ko: ['지금 급하게 움직이고 있습니다.'],
    en: ['Something is moving fast right now.'],
  },
  talk: { ko: ['시장을 보고 있습니다.'], en: ['Watching the market.'] },
};

export function moodLine(mood, lang = 'ko') {
  const set = MOOD_LINE[mood] || MOOD_LINE.talk;
  return pick(set[lang] || set.ko);
}

/* ─────────────── 갱신했을 때 한 마디 ─────────────── */

export function forRefresh(count, fresh, lang = 'ko') {
  if (lang === 'en') {
    return fresh > 0
      ? `${fresh} new ${fresh === 1 ? 'story' : 'stories'}.`
      : 'Nothing new yet.';
  }
  return fresh > 0 ? `새 소식 ${fresh}건입니다.` : '새로 온 것은 없습니다.';
}
