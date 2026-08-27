/* ═══════════════════════════════════════════════════════════════
   breaking.js — 자키람이 먼저 입을 여는 자리

   속보가 오면 알림이 뜨고, 자키람이 낯빛을 바꾸고, 제목을 읽는다.
   이것은 사람이 시키지 않은 소리다. 그러니 조심스러워야 한다.

     · 지금 다른 것을 읽고 있으면 끼어들지 않고 기다린다
     · 한 번에 하나씩, 사이를 두고
     · 같은 것을 두 번 외치지 않는다
     · 소리를 꺼 두었으면 화면에만 띄운다
   ═══════════════════════════════════════════════════════════════ */

import { $, el, ico } from '../core/dom.js';
import { on } from '../core/bus.js';
import * as store from '../core/store.js';
import * as tts from '../voice/tts.js';
import { forBreaking } from '../voice/script.js';
import * as mood from '../zakiram/mood.js';

/** 알림이 스스로 사라지는 데 걸리는 시간 */
const LIVE_MS = 22_000;
/** 하나를 외치고 다음까지 쉬는 시간 */
const GAP_MS = 2200;

export class Breaking {
  /**
   * @param {{stage, onOpen:(item)=>void, onSpeak:(lines,lang)=>void}} hooks
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#alerts');
    this.queue = [];
    this.said = new Set();
    this.busy = false;

    on('news:urgent', ({ item }) => this.push(item));
  }

  push(item) {
    if (this.said.has(item.id)) return;
    this.said.add(item.id);

    this.card(item, { urgent: true });

    if (!store.get('breaking')) return;      // 화면에만 띄우고 입은 다문다
    this.queue.push(item);
    this.#drain();
  }

  /** 급하지 않은 알림 — 갱신 결과 같은 것 */
  notice(text, opts = {}) {
    this.card({ title: text, srcName: opts.kind || '알림' }, { urgent: false, ms: opts.ms });
  }

  card(item, { urgent = false, ms = LIVE_MS } = {}) {
    const node = el('div.alert', {
      class: urgent ? 'alert--urgent' : '',
      role: 'status',
      onclick: (e) => {
        if (e.target.closest('.alert__x')) return;
        if (item.link || item.id) this.hooks.onOpen?.(item);
        dismiss();
      },
    }, [
      el('span.alert__ico', [ico(urgent ? 'bolt' : 'voice')]),
      el('div.alert__body', [
        el('span.alert__kind', { text: urgent ? (item.flag || '속보') : (item.srcName || '알림') }),
        el('span.alert__title', { text: item.title }),
      ]),
      el('button.alert__x', {
        type: 'button', 'aria-label': '닫기',
        onclick: () => dismiss(),
      }, '×'),
    ]);

    this.host.appendChild(node);

    let timer = setTimeout(dismiss, ms);
    const self = this;
    function dismiss() {
      clearTimeout(timer);
      if (!node.isConnected) return;
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 400);
    }
    node.addEventListener('pointerenter', () => clearTimeout(timer));
    node.addEventListener('pointerleave', () => { timer = setTimeout(dismiss, 4000); });

    // 너무 많이 쌓이지 않게
    while (this.host.children.length > 4) this.host.firstChild.remove();
    return node;
  }

  /* ─────────────── 차례로 외치기 ─────────────── */

  async #drain() {
    if (this.busy) return;
    this.busy = true;

    while (this.queue.length) {
      // 사람이 무언가를 읽고 있으면 끝날 때까지 기다린다
      if (tts.speaking()) { await wait(900); continue; }
      if (store.get('muted')) break;

      const item = this.queue.shift();
      mood.startle();
      this.hooks.stage?.flash('alert');

      if (store.get('chime')) chime();

      const { lang, lines } = forBreaking(item);
      this.hooks.onSpeak?.(lines, lang);

      await new Promise((done) => {
        tts.speak(lines, { lang, onend: done });
      });

      await wait(GAP_MS);
    }

    this.busy = false;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────── 종 ───────────────
   짧은 종소리 하나. 파일을 받지 않고 그 자리에서 만든다.
   두 음을 겹쳐 두면 놋쇠 그릇을 친 것처럼 들린다. */

let ac = null;
function chime() {
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();

    const now = ac.currentTime;
    const out = ac.createGain();
    out.gain.value = 0.0001;
    out.connect(ac.destination);

    // 5도 위를 살짝 늦게 얹는다
    for (const [freq, delay, level] of [[784, 0, 1], [1175, 0.055, 0.55], [523, 0.02, 0.4]]) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + delay);
      g.gain.exponentialRampToValueAtTime(0.16 * level, now + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.5);
      osc.connect(g); g.connect(out);
      osc.start(now + delay);
      osc.stop(now + delay + 1.7);
    }
    out.gain.setValueAtTime(1, now);
  } catch { /* 소리를 못 내도 그만이다 */ }
}
