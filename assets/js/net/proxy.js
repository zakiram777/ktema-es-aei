/* ═══════════════════════════════════════════════════════════════
   proxy.js — 남의 집 문을 두드리는 법

   정적 사이트에는 서버가 없다. 그런데 언론사 RSS 와 시세 API 는
   대개 CORS 를 열어 주지 않는다. 그래서 길이 여럿 필요하다.

     0) 같은 집에 올려 둔 프록시   api/proxy.php  (있으면 가장 좋다)
     1) 곧바로                     CORS 를 열어 둔 곳 (마켓워치, 야후 뉴스)
     2) 공개 프록시 몇 곳          나머지 전부

   야후 시세(query1.finance.yahoo.com)는 예전에는 곧바로 열렸으나 지금은
   CORS 를 닫았다. 그래서 시세도 프록시를 거친다.

   처음 한 번은 여러 길로 동시에 두드려 보고, 먼저 열리는 길을
   그 집(host)의 길로 기억한다. 다음부터는 곧장 그 길로 간다.
   길이 막히면 기억을 지우고 다시 찾는다.
   ═══════════════════════════════════════════════════════════════ */

const enc = encodeURIComponent;

/** 길목들. 순서가 곧 선호도다.

    공개 프록시는 남의 호의로 도는 것이라 오래 두면 하나씩 문을 닫는다.
    2026년 8월에 다시 두드려 보고 살아 있는 곳으로 갈아 끼웠다.
    (corsproxy.io 는 열쇠를 요구하게 되었고, api.cors.lol 은 문을 닫았다.)
    이 목록이 통째로 막히는 날이 와도 api/proxy.php 를 올려 두면 그 길로
    다닌다. 오래 쓸 것이라면 그쪽이 낫다. */
export const ROUTES = [
  {
    id: 'self',
    label: '이 사이트의 프록시',
    make: (u) => `api/proxy.php?url=${enc(u)}`,
    // 파일이 실제로 있는지 확인되기 전에는 쓰지 않는다
    enabled: false,
  },
  { id: 'direct',     label: '곧바로',       make: (u) => u },
  { id: 'corssh',     label: 'cors.sh',      make: (u) => `https://proxy.cors.sh/${u}` },
  { id: 'corsfix',    label: 'corsfix',      make: (u) => `https://proxy.corsfix.com/?${u}` },
  { id: 'corseu',     label: 'cors.eu.org',  make: (u) => `https://cors.eu.org/${u}` },
  { id: 'allorigins', label: 'allorigins',   make: (u) => `https://api.allorigins.win/raw?url=${enc(u)}` },
  { id: 'codetabs',   label: 'codetabs',     make: (u) => `https://api.codetabs.com/v1/proxy?quest=${enc(u)}` },
];

/* ── 배운 길을 기억한다 ──
   길 찾기는 여러 곳을 동시에 두드려 보는 일이라, 진 쪽이 콘솔에
   CORS 오류를 남기고 남의 프록시도 괜히 한 번씩 부른다. 한 번 배운
   길을 브라우저에 적어 두면 다음 방문에는 그 일을 통째로 건너뛴다.
   길이 막히면 그때 지우고 다시 찾으므로 굳어 버릴 걱정은 없다. */

const LEARNED_KEY = 'ktema.routes.v1';
const LEARNED_TTL = 24 * 60 * 60 * 1000;   // 하루

/** host → 통했던 길 id */
const learned = new Map(loadLearned());
/** 최근에 실패한 길 — 잠시 쉬게 한다 */
const resting = new Map();

const REST_MS = 60_000;

function loadLearned() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEARNED_KEY) || 'null');
    if (!raw || Date.now() - raw.at > LEARNED_TTL) return [];
    return Object.entries(raw.map || {});
  } catch { return []; }
}

let saveTimer = 0;
function saveLearned() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LEARNED_KEY, JSON.stringify({
        at: Date.now(),
        map: Object.fromEntries(learned),
      }));
    } catch { /* 사생활 보호 창 — 이번 방문에만 기억한다 */ }
  }, 1200);
}

function usable(r) {
  if (r.enabled === false) return false;
  const until = resting.get(r.id) || 0;
  return Date.now() >= until;
}

function rest(id) { resting.set(id, Date.now() + REST_MS); }

/** api/proxy.php 가 올라와 있으면 그 길을 켠다 (한 번만 확인) */
let selfChecked = null;
export function checkSelfProxy() {
  if (selfChecked) return selfChecked;
  selfChecked = (async () => {
    if (location.protocol === 'file:') return false;
    try {
      const r = await fetch('api/proxy.php?ping=1', { cache: 'no-store' });
      if (!r.ok) return false;
      const t = (await r.text()).trim();
      if (t !== 'ktema-proxy') return false;
      ROUTES[0].enabled = true;
      return true;
    } catch { return false; }
  })();
  return selfChecked;
}

function timed(url, ms, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { signal: ctl.signal, cache: 'no-store', redirect: 'follow', ...init })
    .then(async (res) => {
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text || text.length < 24) throw new Error('빈 응답');
      return text;
    })
    .catch((e) => { clearTimeout(t); throw e; });
}

/**
 * 글 하나를 받아 온다.
 * @param {string} url
 * @param {{timeout?:number, validate?:(t:string)=>boolean}} opts
 * @returns {Promise<{text:string, route:string}>}
 */
export async function fetchText(url, opts = {}) {
  const { timeout = 11_000, validate } = opts;
  const host = safeHost(url);
  const ok = (t) => (validate ? validate(t) : true);

  // 이미 아는 길이 있으면 그 길로 먼저
  const known = learned.get(host);
  if (known) {
    const route = ROUTES.find((r) => r.id === known);
    if (route && usable(route)) {
      try {
        const text = await timed(route.make(url), timeout);
        if (ok(text)) return { text, route: route.id };
      } catch {
        learned.delete(host); saveLearned();   // 길이 막혔다. 다시 찾자
      }
    } else {
      learned.delete(host);
      saveLearned();
    }
  }

  // 아직 모르는 집이면 몇 갈래로 동시에 두드린다. 먼저 열리는 길이 이긴다.
  //
  // 다만 일곱 길을 한꺼번에 두드리면, 이기지 못한 여섯이 저마다
  // CORS 오류를 콘솔에 쏟는다. 그래서 두 물결로 나눈다. 앞 물결
  // 셋이면 대개 하나는 열리고, 그러면 뒤 물결은 아예 나서지 않는다.
  const all = ROUTES.filter(usable);
  if (!all.length) throw new Error('열린 길이 없습니다');

  const first = all.slice(0, 3);
  const second = all.slice(3);

  try {
    return await race(first, url, timeout, ok, host);
  } catch (e) {
    if (!second.length) throw e;
    return race(second, url, timeout, ok, host);
  }
}

/** 여러 길을 한꺼번에 두드려 먼저 열리는 것을 쓴다 */
function race(routes, url, timeout, ok, host) {
  return new Promise((resolve, reject) => {
    let left = routes.length;
    let firstErr = null;
    let settled = false;

    for (const route of routes) {
      timed(route.make(url), timeout)
        .then((text) => {
          if (settled) return;
          if (!ok(text)) throw new Error('받은 내용을 알아볼 수 없습니다');
          settled = true;
          learned.set(host, route.id);
          saveLearned();
          resolve({ text, route: route.id });
        })
        .catch((e) => {
          firstErr ||= e;
          if (route.id !== 'direct') rest(route.id);
          if (--left === 0 && !settled) {
            reject(new Error(`길이 막혔습니다 (${firstErr?.message || '알 수 없음'})`));
          }
        });
    }
  });
}

/** JSON 을 받아 온다 */
export async function fetchJSON(url, opts = {}) {
  const { text, route } = await fetchText(url, {
    ...opts,
    validate: (t) => {
      const s = t.trimStart();
      return s.startsWith('{') || s.startsWith('[');
    },
  });
  return { data: JSON.parse(text), route };
}

/** XML(RSS/Atom) 을 받아 파싱한다 */
export async function fetchXML(url, opts = {}) {
  const { text, route } = await fetchText(url, {
    ...opts,
    validate: (t) => /<(rss|feed|rdf:RDF)[\s>]/i.test(t) || /<item[\s>]/i.test(t),
  });
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    // 프록시가 앞에 잡소리를 붙였을 수 있다. 여는 태그부터 다시 잘라 본다
    const cut = text.slice(text.search(/<(\?xml|rss|feed|rdf:RDF)/i));
    const retry = new DOMParser().parseFromString(cut, 'application/xml');
    if (retry.querySelector('parsererror')) throw new Error('XML 을 읽지 못했습니다');
    return { doc: retry, route };
  }
  return { doc, route };
}

function safeHost(u) {
  try { return new URL(u, location.href).host; }
  catch { return u.slice(0, 40); }
}

/** 길 id 를 사람이 읽는 이름으로 */
export const routeLabel = (id) => ROUTES.find((r) => r.id === id)?.label || id;

/** 지금까지 어떤 길로 다녔는지 — 설정 화면에서 보여 준다 */
export function routeReport() {
  return [...learned.entries()].map(([host, route]) => ({
    host, route, label: routeLabel(route),
  }));
}

export function forgetRoutes() {
  learned.clear();
  resting.clear();
  try { localStorage.removeItem(LEARNED_KEY); } catch { /* 무시 */ }
}
