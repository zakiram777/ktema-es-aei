/* ═══════════════════════════════════════════════════════════════
   bus.js — 모듈끼리 서로를 몰라도 되게 하는 전령

   news 가 시세를 모르고, 시세가 유리아를 몰라도 된다.
   모두 여기에 대고 말하고 여기서 듣는다.

   오가는 말
     news:loaded   {items, at, errors}   목록이 새로 왔다
     news:new      {items}               못 보던 것이 왔다
     news:urgent   {item}                속보다
     news:open     {item}                하나를 펼쳤다
     quotes:loaded {quotes, at}          시세가 왔다
     mood:changed  {mood, score}         시장 기분이 바뀌었다
     speak:start   {text, lang}          말하기 시작
     speak:word    {index, length}       지금 읽는 자리
     speak:end     {}                    다 말했다
     settings:changed {key, value}       설정이 바뀌었다
   ═══════════════════════════════════════════════════════════════ */

const map = new Map();

export function on(type, fn) {
  if (!map.has(type)) map.set(type, new Set());
  map.get(type).add(fn);
  return () => off(type, fn);
}

export function once(type, fn) {
  const undo = on(type, (payload) => { undo(); fn(payload); });
  return undo;
}

export function off(type, fn) {
  map.get(type)?.delete(fn);
}

export function emit(type, payload) {
  const set = map.get(type);
  if (!set) return;
  // 듣는 쪽이 중간에 빠져도 안전하도록 복사해 돈다
  for (const fn of [...set]) {
    try { fn(payload); }
    catch (err) { console.error(`[bus] ${type}`, err); }
  }
}
