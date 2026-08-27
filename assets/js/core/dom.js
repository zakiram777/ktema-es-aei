/* ═══════════════════════════════════════════════════════════════
   dom.js — 화면을 만지는 손
   ═══════════════════════════════════════════════════════════════ */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * 요소 하나를 만든다.
 *   el('div.card', { onclick }, ['글', el('b', '굵게')])
 * 태그 문자열에 .클래스 와 #아이디 를 붙일 수 있다.
 */
export function el(spec, props, kids) {
  const m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(spec);
  const node = document.createElement(m?.[1] || 'div');

  for (const bit of (m?.[2] || '').match(/[.#][\w-]+/g) || []) {
    if (bit[0] === '.') node.classList.add(bit.slice(1));
    else node.id = bit.slice(1);
  }

  // 두 번째 인자가 자식이면 속성은 건너뛴 것
  if (Array.isArray(props) || typeof props === 'string' || props instanceof Node) {
    kids = props; props = null;
  }

  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'data' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) if (dv != null) node.dataset[dk] = dv;
    }
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }

  append(node, kids);
  return node;
}

export function append(node, kids) {
  if (kids == null) return node;
  for (const k of [].concat(kids)) {
    if (k == null || k === false) continue;
    node.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** 아이콘 한 조각 */
export const ico = (name) => el('span.ico', { data: { ico: name } });

/** 다음 그림 프레임까지 */
export const frame = () => new Promise(requestAnimationFrame);

/** 잠깐 쉼 */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 너무 자주 부르는 것을 눌러 준다 */
export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** 일정 간격보다 자주는 부르지 않는다 */
export function throttle(fn, ms = 120) {
  let last = 0, timer = 0, lastArgs;
  return (...a) => {
    lastArgs = a;
    const now = Date.now();
    const left = ms - (now - last);
    if (left <= 0) { last = now; fn(...a); }
    else if (!timer) {
      timer = setTimeout(() => { timer = 0; last = Date.now(); fn(...lastArgs); }, left);
    }
  };
}

/** 움직임을 줄여 달라는 설정 */
export const calmly = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** 서랍 같은 것을 열고 닫는다. 닫힘 애니메이션을 기다렸다가 숨긴다 */
export function openPane(node) {
  node.classList.remove('is-out');
  node.hidden = false;
  document.body.classList.add('is-locked');
  // 안쪽 첫 단추로 초점을 옮긴다
  requestAnimationFrame(() => {
    const first = node.querySelector('button, a[href], input, select, [tabindex]');
    first?.focus?.({ preventScroll: true });
  });
}

export function closePane(node, after) {
  if (node.hidden) return;
  node.classList.add('is-out');
  const done = () => {
    node.hidden = true;
    node.classList.remove('is-out');
    document.body.classList.remove('is-locked');
    after?.();
  };
  if (calmly()) { done(); return; }
  setTimeout(done, 300);
}

/** HTML 을 안전한 글로 되돌린다 (피드 요약에 태그가 섞여 온다) */
export function stripTags(html) {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('script, style, iframe, noscript').forEach((n) => n.remove());
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
