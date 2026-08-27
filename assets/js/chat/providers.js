/* ═══════════════════════════════════════════════════════════════
   providers.js — 유리아의 머리를 바깥에 잇는 자리

   유리아는 지금 스스로 생각하지 않는다. 시세와 소식을 보고 정해진
   말을 할 뿐이다. 그 뒤에 큰 모형(Claude·GPT·Grok)을 이어 붙이면
   진짜 묻고 답할 수 있다. 이 파일은 그 자리를 미리 파 둔 것이다.

   ── 어떻게 이어지나 ──
   이 사이트에는 서버가 없다. 그래서 브라우저가 직접 그 집의 문을
   두드린다. 열쇠(API key)는 보는 사람이 자기 설정에 넣고, 그 열쇠는
   이 브라우저 밖으로 나가지 않는다 — 우리에게도 오지 않는다.

   ── 열쇠를 브라우저에 두는 일에 대하여 ──
   이것은 안전한 방식이 아니다. 브라우저에 둔 열쇠는 그 기기를 쓰는
   사람이면 누구나 꺼내 볼 수 있고, 이 페이지에 끼어든 다른 스크립트도
   읽을 수 있다. 혼자 쓰는 기기에서, 쓴 만큼만 청구되는 열쇠로,
   한도를 걸어 두고 쓰기를 권한다. 여러 사람이 보는 사이트라면
   열쇠는 서버 뒤에 두어야 한다 (아래 'proxy' 길).

   ── 길 넷 ──
   local     아무 데도 잇지 않는다. 시세와 소식만 보고 답한다 (기본값)
   claude    api.anthropic.com
   openai    api.openai.com
   grok      api.x.ai
   proxy     내가 세운 서버. 열쇠를 브라우저에 두지 않아도 된다
   ═══════════════════════════════════════════════════════════════ */

/** 유리아가 자기가 누구인지 아는 말 */
export const PERSONA = [
  '너는 유리아(Ὑρία)이다. 시장의 소식과 시세를 읽어 주는 자다.',
  '보이는 것을 말하되, 사거나 팔라고 권하지 않는다. 값을 지어내지 않는다.',
  '모르는 것은 모른다고 한다. 짧고 곧게 말한다. 세 문장을 넘기지 않는다.',
  '한국어로 묻거든 한국어로, 영어로 묻거든 영어로 답한다.',
].join(' ');

/* ─────────────── 길의 생김새 ─────────────── */

export const PROVIDERS = [
  {
    id: 'local',
    ko: '잇지 않음',
    gr: 'Αὐτός',
    note: '바깥에 잇지 않고, 지금 화면에 있는 시세와 소식만 보고 답합니다. '
        + '열쇠가 필요 없고 값도 들지 않습니다.',
    needsKey: false,
    models: [],
  },
  {
    id: 'claude',
    ko: 'Claude',
    gr: 'Ἀνθρωπικός',
    note: 'api.anthropic.com. 열쇠는 console.anthropic.com 에서 만듭니다.',
    needsKey: true,
    keyHint: 'sk-ant-…',
    models: [
      { id: 'claude-sonnet-5', ko: 'Sonnet 5 — 고르게 좋다' },
      { id: 'claude-opus-5', ko: 'Opus 5 — 가장 깊다' },
      { id: 'claude-haiku-4-5-20251001', ko: 'Haiku 4.5 — 가장 빠르다' },
    ],
    def: 'claude-sonnet-5',
  },
  {
    id: 'openai',
    ko: 'GPT',
    gr: 'Ἀνοικτός',
    note: 'api.openai.com. 열쇠는 platform.openai.com 에서 만듭니다.',
    needsKey: true,
    keyHint: 'sk-…',
    models: [
      { id: 'gpt-4o', ko: 'GPT-4o' },
      { id: 'gpt-4o-mini', ko: 'GPT-4o mini — 싸고 빠르다' },
    ],
    def: 'gpt-4o-mini',
  },
  {
    id: 'grok',
    ko: 'Grok',
    gr: 'Ξένος',
    note: 'api.x.ai. 열쇠는 console.x.ai 에서 만듭니다.',
    needsKey: true,
    keyHint: 'xai-…',
    models: [
      { id: 'grok-2-latest', ko: 'Grok 2' },
      { id: 'grok-beta', ko: 'Grok beta' },
    ],
    def: 'grok-2-latest',
  },
  {
    id: 'proxy',
    ko: '내 서버',
    gr: 'Δίοδος',
    note: '열쇠를 브라우저에 두지 않는 길입니다. 내가 세운 주소로 물음을 보내면, '
        + '그 서버가 열쇠를 들고 대신 물어 답만 돌려줍니다. 여러 사람이 보는 '
        + '사이트라면 이 길이 맞습니다.',
    needsKey: false,
    needsUrl: true,
    models: [],
  },
];

export const byId = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

/* ─────────────── 묻고 답하기 ─────────────── */

/**
 * @param {object} cfg   { provider, key, model, url }
 * @param {{role:'user'|'assistant', text:string}[]} history
 * @param {string} ask   이번에 묻는 말
 * @param {string} facts 지금 화면에 있는 사실 (시세·소식 요약)
 * @param {{signal?:AbortSignal}} opts
 * @returns {Promise<{text:string, via:string}>}
 */
export async function ask(cfg, history, question, facts, opts = {}) {
  const p = byId(cfg.provider);
  const system = facts
    ? PERSONA + '\n\n지금 화면에 있는 것:\n' + facts
    : PERSONA;

  switch (p.id) {
    case 'claude': return askClaude(cfg, system, history, question, opts);
    case 'openai': return askOpenAI(cfg, system, history, question, opts, 'https://api.openai.com/v1/chat/completions');
    case 'grok': return askOpenAI(cfg, system, history, question, opts, 'https://api.x.ai/v1/chat/completions');
    case 'proxy': return askProxy(cfg, system, history, question, opts);
    default: return { text: '', via: 'local' };
  }
}

function turns(history, question) {
  const out = (history || [])
    .filter((m) => m && m.text)
    .slice(-8)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
  out.push({ role: 'user', content: question });
  return out;
}

async function askClaude(cfg, system, history, question, opts) {
  if (!cfg.key) throw new Error('Claude 열쇠가 없습니다.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.key,
      'anthropic-version': '2023-06-01',
      // 브라우저에서 곧바로 부를 때 필요하다. 이것이 없으면 CORS 로 막힌다.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model || byId('claude').def,
      max_tokens: 700,
      system,
      messages: turns(history, question),
    }),
  });
  const data = await readJSON(res, 'Claude');
  const text = (data.content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim();
  return { text, via: 'claude' };
}

async function askOpenAI(cfg, system, history, question, opts, url) {
  if (!cfg.key) throw new Error('열쇠가 없습니다.');
  const res = await fetch(url, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + cfg.key,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 700,
      messages: [{ role: 'system', content: system }, ...turns(history, question)],
    }),
  });
  const data = await readJSON(res, url.includes('x.ai') ? 'Grok' : 'GPT');
  const text = String(data.choices?.[0]?.message?.content || '').trim();
  return { text, via: url.includes('x.ai') ? 'grok' : 'openai' };
}

/**
 * 내가 세운 서버에 묻는다.
 * 그 서버는 { system, messages } 를 받아 { text } 를 돌려주면 된다.
 * 열쇠는 그 서버가 들고 있으므로 브라우저에는 없다.
 */
async function askProxy(cfg, system, history, question, opts) {
  if (!cfg.url) throw new Error('서버 주소가 없습니다.');
  const res = await fetch(cfg.url, {
    method: 'POST',
    signal: opts.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system, messages: turns(history, question) }),
  });
  const data = await readJSON(res, '내 서버');
  const text = String(data.text || data.content || data.answer || '').trim();
  return { text, via: 'proxy' };
}

async function readJSON(res, who) {
  const raw = await res.text();
  let data = null;
  try { data = JSON.parse(raw); } catch { /* 아래에서 다룬다 */ }

  if (!res.ok) {
    const why = data?.error?.message || data?.message || raw.slice(0, 160) || res.statusText;
    // 자주 나오는 것들은 사람의 말로 바꿔 준다
    if (res.status === 401) throw new Error(who + ' 열쇠가 틀렸습니다.');
    if (res.status === 429) throw new Error(who + ' 가 잠시 쉬라고 합니다 (한도 초과).');
    if (res.status === 400 && /model/i.test(why)) throw new Error(who + ' 가 그 모형을 모릅니다: ' + why);
    throw new Error(who + ' — ' + why);
  }
  if (!data) throw new Error(who + ' 가 알아볼 수 없는 것을 돌려주었습니다.');
  return data;
}

/* ─────────────── 잇지 않았을 때 ───────────────

   열쇠가 없어도 유리아가 아주 벙어리는 아니다. 지금 화면에 있는
   시세와 소식으로 답할 수 있는 물음이 꽤 있다. 지어내지는 않는다 —
   모르는 것은 모른다고 하고, 무엇을 이어야 더 답할 수 있는지 알려 준다. */

export function answerLocally(question, facts) {
  const q = String(question || '').trim();
  if (!q) return '';

  const f = facts || {};
  const has = (...words) => words.some((w) => q.includes(w));

  if (has('안녕', '누구', '뭐야', 'hello', 'who')) {
    return '유리아입니다. 시장의 소식과 시세를 읽어 드립니다. '
         + '무엇을 물으셔도 제가 지금 보고 있는 것 안에서 답하겠습니다.';
  }

  if (has('코스피', 'KOSPI', '지수', '시장', '오늘', '어때')) {
    if (f.quotesLine) return f.quotesLine + ' ' + (f.moodLine || '');
    return '아직 시세가 오지 않았습니다. 잠시 뒤에 다시 물어 주십시오.';
  }

  if (has('소식', '뉴스', '기사', 'news')) {
    if (f.newsLine) return f.newsLine;
    return '아직 소식이 오지 않았습니다.';
  }

  if (has('사', '팔', '매수', '매도', '추천', '종목')) {
    return '저는 보이는 것을 읽을 뿐, 사거나 팔라고 말하지 않습니다. '
         + '무엇이 얼마나 움직였는지는 말씀드릴 수 있습니다.';
  }

  return '아직 바깥의 머리에 이어져 있지 않아, 지금 화면에 있는 것만 말할 수 있습니다. '
       + '설정 → Διάλογος 에서 Claude·GPT·Grok 가운데 하나를 이어 주시면 '
       + '더 깊이 답하겠습니다.';
}
