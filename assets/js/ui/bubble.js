/* ═══════════════════════════════════════════════════════════════
   bubble.js — 자키람의 말풍선

   자키람이 스스로 입을 열 때(속보) 와 물음에 답할 때(대화), 그 말의
   요지를 얼굴 곁에 띄운다. 전문은 넣지 않는다 — 얼굴을 가리고,
   길면 읽지 않는다. 요지는 core/summary.js 가 뽑는다.

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
  /** @param {HTMLElement} host  말풍선이 살 자리 (#zakBubble) */
  constructor(host) {
    this.host = host;
    this.timer = 0;
    this.current = null;
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
    const node = this.current;
    if (!node) { this.host.hidden = true; return; }
    node.classList.remove('is-in');
    this.current = null;
    setTimeout(() => {
      if (!this.current) { clear(this.host); this.host.hidden = true; }
    }, 320);
  }
}
