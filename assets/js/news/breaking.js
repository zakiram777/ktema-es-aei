/* ═══════════════════════════════════════════════════════════════
   breaking.js — 스스로 말을 거는 유일한 자리

   사람이 시키지 않았는데 화면에 무언가가 뜨는 곳은 여기뿐이다.
   그러니 인색해야 한다.

     · 같은 것을 두 번 외치지 않는다
     · 한 번에 넷까지만 쌓인다. 넘치면 오래된 것부터 버린다
     · 마우스를 얹으면 사라지지 않는다 — 읽는 중에 없어지면 화가 난다
     · 급하지 않은 것은 조용한 모양으로 뜬다

   ── 종소리 ──
   속보에만 짧게 울린다. 파일을 받지 않고 그 자리에서 만든다. 두 음을
   겹쳐 두면 놋쇠 그릇을 친 것처럼 들린다.
   ═══════════════════════════════════════════════════════════════ */

import { $, el, ico } from '../core/dom.js';
import { on } from '../core/bus.js';
import * as store from '../core/store.js';

/** 알림이 스스로 사라지는 데 걸리는 시간 */
const LIVE_MS = 22_000;

export class Breaking {
  /** @param {{onOpen:(item)=>void, onUrgent:(item)=>void}} hooks */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.host = $('#alerts');
    this.said = new Set();

    on('news:urgent', ({ item }) => this.push(item));
  }

  push(item) {
    if (this.said.has(item.id)) return;
    this.said.add(item.id);
    if (!store.get('breaking')) return;

    this.card(item, { urgent: true });
    if (store.get('chime')) chime();
    this.hooks.onUrgent?.(item);
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
      el('span.alert__ico', [ico(urgent ? 'bolt' : 'info')]),
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
    function dismiss() {
      clearTimeout(timer);
      if (!node.isConnected) return;
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 400);
    }
    node.addEventListener('pointerenter', () => clearTimeout(timer));
    node.addEventListener('pointerleave', () => { timer = setTimeout(dismiss, 4000); });

    while (this.host.children.length > 4) this.host.firstChild.remove();
    return node;
  }
}

/* ─────────────── 종 ─────────────── */

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
      g.gain.exponentialRampToValueAtTime(0.13 * level, now + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.5);
      osc.connect(g); g.connect(out);
      osc.start(now + delay);
      osc.stop(now + delay + 1.7);
    }
    out.gain.setValueAtTime(1, now);
  } catch { /* 소리를 못 내도 그만이다 */ }
}
