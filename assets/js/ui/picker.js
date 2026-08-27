/* ═══════════════════════════════════════════════════════════════
   picker.js — 무엇을 볼 것인가

   이 화면에서 가장 자주 하는 일이다. 그래서 머리띠의 왼쪽, 로고 바로
   옆에 둔다. 무엇을 보고 있는지가 늘 그 자리에 적혀 있고, 누르면
   바꿀 수 있다.

   ── 세 갈래로 찾는다 ──
     1. 기호를 아는 사람   005930.KS 를 그대로 적는다
     2. 이름만 아는 사람   "삼성" 이라고 적으면 야후에 물어본다
     3. 아무것도 모르는 사람  자주 보는 것들이 처음부터 놓여 있다

   ── 왜 물어보기를 눌러 두나 ──
   한 글자 칠 때마다 밖에 묻지 않는다. 손이 멎고 나서 260밀리초 뒤에
   한 번 묻는다. 공개 프록시에는 문턱이 있고, "삼성전자" 를 치는 동안
   다섯 번 물으면 그 문턱에 걸린다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, clear, debounce } from '../core/dom.js';
import { QUICK, nameOf } from '../market/symbols.js';
import { search } from '../market/quotes.js';

export class Picker {
  /** @param {{onPick:(sym, meta)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.root = $('#pick');
    this.btn = $('#pickBtn');
    this.symEl = $('#pickSym');
    this.nameEl = $('#pickName');
    this.pop = $('#pickPop');
    this.input = $('#pickSearch');
    this.list = $('#pickList');

    this.btn.addEventListener('click', () => (this.pop.hidden ? this.open() : this.close()));

    document.addEventListener('click', (e) => {
      if (!this.pop.hidden && !this.root.contains(e.target)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.pop.hidden) { this.close(); this.btn.focus(); }
    });

    const ask = debounce(() => this.#lookup(), 260);
    this.input.addEventListener('input', () => {
      this.#paintQuick();          // 아는 것부터 곧바로 좁혀 보인다
      ask();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      // 기호를 그대로 적었으면 묻지 않고 곧장 간다
      const raw = this.input.value.trim();
      const first = this.list.querySelector('.pick__row');
      if (looksLikeSymbol(raw)) this.pick(raw.toUpperCase());
      else first?.click();
    });

    this.#paintQuick();
  }

  open() {
    this.pop.hidden = false;
    this.root.classList.add('is-open');
    this.btn.setAttribute('aria-expanded', 'true');
    this.input.value = '';
    this.#paintQuick();
    requestAnimationFrame(() => this.input.focus());
  }

  close() {
    this.pop.hidden = true;
    this.root.classList.remove('is-open');
    this.btn.setAttribute('aria-expanded', 'false');
  }

  /** 머리띠에 적힌 것을 바꾼다 */
  show(sym, name) {
    this.symbol = sym;
    this.symEl.textContent = sym;
    this.nameEl.textContent = name || nameOf(sym);
  }

  pick(sym, meta) {
    this.close();
    this.hooks.onPick?.(sym, meta);
  }

  /* ─────────────── 목록 ─────────────── */

  #paintQuick() {
    const q = this.input.value.trim().toLowerCase();
    const rows = QUICK
      .map((s) => ({ symbol: s, ko: nameOf(s), where: '자주 보는 것' }))
      .filter((r) => !q
        || r.symbol.toLowerCase().includes(q)
        || r.ko.toLowerCase().includes(q));

    this.#rows(rows, q ? '아는 것 중에서' : '자주 보는 것');
  }

  async #lookup() {
    const q = this.input.value.trim();
    if (q.length < 2) return;

    this.list.dataset.busy = '1';
    const found = await search(q);
    this.list.dataset.busy = '';

    // 그새 다른 것을 치고 있으면 옛 답은 버린다
    if (this.input.value.trim() !== q) return;

    const quick = QUICK
      .map((s) => ({ symbol: s, ko: nameOf(s), where: '자주 보는 것' }))
      .filter((r) => r.symbol.toLowerCase().includes(q.toLowerCase())
        || r.ko.toLowerCase().includes(q.toLowerCase()));

    const seen = new Set(quick.map((r) => r.symbol));
    const rest = found.filter((r) => !seen.has(r.symbol));

    if (!quick.length && !rest.length) {
      clear(this.list);
      this.list.appendChild(el('p.pick__empty', {
        text: looksLikeSymbol(q)
          ? `찾지 못했습니다. ${q.toUpperCase()} 를 그대로 열려면 Enter.`
          : '찾지 못했습니다. 기호를 알고 있다면 그대로 적어 보십시오.',
      }));
      return;
    }

    clear(this.list);
    if (quick.length) this.#group('자주 보는 것', quick);
    if (rest.length) this.#group('찾은 것', rest);
  }

  #rows(rows, label) {
    clear(this.list);
    if (!rows.length) {
      this.list.appendChild(el('p.pick__empty', { text: '이름이나 기호를 적어 보십시오.' }));
      return;
    }
    this.#group(label, rows);
  }

  #group(label, rows) {
    this.list.appendChild(el('h6.pick__gr', { text: label }));
    for (const r of rows) {
      this.list.appendChild(el('button.pick__row', {
        type: 'button',
        class: r.symbol === this.symbol ? 'is-on' : '',
        onclick: () => this.pick(r.symbol, r),
      }, [
        el('code', { text: r.symbol }),
        el('span', { text: r.ko || r.name || r.symbol }),
        el('small', { text: r.where || '' }),
      ]));
    }
  }
}

/** 사람이 적은 것이 기호처럼 생겼나 — ^KS11, 005930.KS, AAPL, BTC-USD */
export function looksLikeSymbol(s) {
  return /^[\^]?[A-Za-z0-9]{1,10}([.\-=][A-Za-z0-9]{1,6})?$/.test(String(s || '').trim());
}
