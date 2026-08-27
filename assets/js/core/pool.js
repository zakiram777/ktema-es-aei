/* ═══════════════════════════════════════════════════════════════
   pool.js — 한꺼번에 몰려가지 않게

   켤 때 이 사이트는 소식 열여덟 곳과 시세 열두 개를 부른다. 그것을
   한 번에 다 던지면 서른 개의 부름이 같은 프록시로 동시에 몰린다.
   아직 길을 모르는 집은 길마다 두드려 보므로 실제로는 그 두세 배다.

   남의 호의로 도는 공개 프록시는 그 순간 문을 닫아 버린다. 그러면
   목록은 어찌어찌 채워지고 그다음에 부른 차트만 홀로 넘어진다 —
   "소식은 오는데 차트만 안 뜬다" 는 그 이상한 모양이 여기서 났다.

   그래서 줄을 세운다. 한 번에 몇 개까지만 나가고, 하나가 돌아오면
   다음 것이 나간다. 전체가 걸리는 시간은 크게 다르지 않으면서
   문턱에 걸리는 일이 사라진다.

   Promise.allSettled 과 같은 것을 돌려준다 — 차례도 그대로다.
   그래서 부르는 쪽은 allSettled 을 pool 로 바꾸기만 하면 된다.
   ═══════════════════════════════════════════════════════════════ */

/**
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} work
 * @param {number} limit 한 번에 몇 개까지 나갈 수 있나
 * @returns {Promise<PromiseSettledResult<R>[]>}
 */
export function pool(items, work, limit = 6) {
  const list = [...items];
  const out = new Array(list.length);
  const width = Math.max(1, Math.min(limit, list.length));
  let next = 0;

  async function lane() {
    while (next < list.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await work(list[i], i) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  }

  return Promise.all(Array.from({ length: width }, lane)).then(() => out);
}
