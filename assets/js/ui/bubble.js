/* ═══════════════════════════════════════════════════════════════
   bubble.js — 유리아의 말풍선

   유리아가 스스로 입을 열 때(속보) 와 물음에 답할 때(대화), 그 말의
   요지를 그의 곁에 띄운다. 전문은 넣지 않는다 — 얼굴을 가리고,
   길면 읽지 않는다. 요지는 core/summary.js 가 뽑는다.

   ── 왜 따라다니나 ──
   유리아는 한자리에 있지 않다. 말풍선이 곁칸에 붙박여 있으면 그가
   화면 왼쪽에 나타났는데 말은 오른쪽에서 나오는 꼴이 된다. 그래서
   그가 선 자리를 물어 그 곁에 붙는다 (follow). 그가 없으면 화면
   아래에 조용히 뜬다.

   속보 말풍선은 누를 수 있다. 누르면 그 기사로 간다.
   대화 말풍선은 누르면 대화창의 그 자리로 간다 (전문은 거기 있다).

   한 번에 하나만 띄운다. 겹쳐 놓으면 어느 것이 지금 말인지 알 수 없다.
   ═══════════════════════════════════════════════════════════════ */

import { el, clear } from '../core/dom.js';
import { calmly } from '../core/dom.js';

/** 스스로 사라지기까지 (ms). 글이 길수록 오래 둔다. */
const BASE_MS = 6500;
const PER_CHAR_MS = 55;
const MAX_MS = 20_000;

export class Bubble {
  /**
   * @param {HTMLElement} host  말풍선이 살 자리 (#yuriaSay)
   * @param {{rect:()=>DOMRect|null}} who  누구를 따라다니나
   */
  constructor(host, who = null) {
    this.host = host;
    this.who = who;
    this.timer = 0;
    this.current = null;
    this.tracker = 0;

    // 창이 바뀌면 자리도 다시 잡는다
    window.addEventListener('resize', () => this.follow());
    window.addEventListener('scroll', () => this.follow(), { passive: true });
  }

  /**
   * 유리아가 선 자리 곁으로 옮긴다.
   *
   * 위에 놓는 것을 먼저 본다 — 말은 머리 위에서 나오는 것이 자연스럽다.
   * 위가 좁으면 아래로 내린다. 좌우는 화면 밖으로 나가지 않게 민다.
   */
  follow() {
    if (!this.current) return;

    const box = this.host.getBoundingClientRect();
    const w = box.width || 280;
    const h = box.height || 90;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;
    const pad = 10;

    const at = this.who?.rect?.();

    if (!at) {
      // 그가 없다 — 화면 아래 가운데에 조용히
      this.host.style.left = Math.round((vw - w) / 2) + 'px';
      this.host.style.top = Math.round(vh - h - 28) + 'px';
      this.host.dataset.side = 'below';
      return;
    }

    const above = at.top - h - gap;
    const below = at.bottom + gap;
    const useAbove = above > 70;

    this.host.style.left = Math.round(
      Math.max(pad, Math.min(vw - w - pad, at.left + at.width / 2 - w / 2)),
    ) + 'px';
    this.host.style.top = Math.round(
      useAbove ? above : Math.min(vh - h - pad, below),
    ) + 'px';
    this.host.dataset.side = useAbove ? 'above' : 'below';
  }

  /**
   * 말풍선을 띄운다.
   * @param {string} text  이미 요약된 글
   * @param {{kind?:string, onClick?:()=>void, hint?:string, ms?:number, tone?:'urgent'|'talk'}} opts
   */
  show(text, opts = {}) {
    const body = String(text || '').trim();
    if (!body) return this.hide();

    clearTimeout(this.timer);
    clear(this.host);

    const clickable = typeof opts.onClick === 'function';

    const node = el(clickable ? 'button.bubble' : 'div.bubble', {
      class: [
        opts.tone === 'urgent' ? 'bubble--urgent' : '',
        clickable ? 'bubble--link' : '',
      ].filter(Boolean).join(' '),
      ...(clickable ? { type: 'button', onclick: () => opts.onClick() } : { role: 'status' }),
    }, [
      opts.kind ? el('span.bubble__kind', { text: opts.kind }) : null,
      el('p.bubble__text', { text: body }),
      opts.hint ? el('span.bubble__hint', { text: opts.hint }) : null,
    ]);

    this.host.appendChild(node);
    this.host.hidden = false;
    this.current = node;

    // 자리를 먼저 잡고 드러낸다 — 엉뚱한 데 떴다가 옮겨 가면 눈에 띈다
    this.follow();

    // 유리아가 아주 살짝 흔들리므로 말풍선도 따라 흔들려야 붙어 보인다
    clearInterval(this.tracker);
    this.tracker = setInterval(() => this.follow(), 260);

    // 들어오는 결. 동작 줄이기를 켜 두었으면 그냥 나타난다.
    if (!calmly()) {
      requestAnimationFrame(() => node.classList.add('is-in'));
    } else {
      node.classList.add('is-in');
    }

    const ms = opts.ms ?? Math.min(MAX_MS, BASE_MS + body.length * PER_CHAR_MS);
    this.timer = setTimeout(() => this.hide(), ms);

    // 손이 올라와 있는 동안에는 사라지지 않는다 — 읽는 중일 수 있다
    node.addEventListener('pointerenter', () => clearTimeout(this.timer));
    node.addEventListener('pointerleave', () => {
      this.timer = setTimeout(() => this.hide(), 3500);
    });

    return node;
  }

  hide() {
    clearTimeout(this.timer);
    clearInterval(this.tracker);
    const node = this.current;
    if (!node) { this.host.hidden = true; return; }
    node.classList.remove('is-in');
    this.current = null;
    setTimeout(() => {
      if (!this.current) { clear(this.host); this.host.hidden = true; }
    }, 320);
  }
}
