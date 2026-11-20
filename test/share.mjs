// 공유 링크 회귀 확인: 같은 탭 전환, 잘못된 링크, 원래 집 저장 보호.
// 실행: node tools/shot.mjs / shots/share 390 844 test/share.mjs
export default async function shareTour(page, { out, logs }) {
  const say = (name, passed, detail = '') => logs.push(`${passed ? '통과' : '실패'}  ${name} ${detail}`);
  const wait = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 20000 });

  // 원래 집 B를 저장한다.
  await page.evaluate(() => {
    window.__game.store.dispatch({ type: 'setExterior', slot: 'roof', value: 'slate' });
    window.__game.saveNow();
  });
  const original = await page.evaluate(() => localStorage.getItem('house-lab-web:save'));
  // 내 집을 벗어날 때 기존 저장기가 savedAt과 위치를 다시 기록할 수 있으므로,
  // 소유자 상태는 내용으로 비교한다. 구경 모드 중 저장 안 됨은 원문 그대로 비교한다.
  // 불러오기는 벽걸이와 탁자 소품의 객체 삽입 순서를 바꿀 수 있다.
  // 저장 내용의 의미가 같은지 검사하되, 객체 키의 나열 순서는 무시한다.
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])) : value;
  const sameHouse = (a, b) => JSON.stringify(canonical(JSON.parse(a).state))
    === JSON.stringify(canonical(JSON.parse(b).state));

  // A의 집 링크를 같은 탭에서 연다. B와 구별되도록 지붕색을 바꿔 둔다.
  const link = await page.evaluate(async () => {
    const { makeShareLink, PUBLIC_SHARE_URL } = await import('./src/share.js');
    const copy = structuredClone(window.__game.store.state);
    copy.house.roof = 'terracotta';
    return makeShareLink(copy, PUBLIC_SHARE_URL);
  });
  say('공유 주소는 GitHub Pages 주소', link.startsWith('https://sylbster-cpu.github.io/maeul/#home='));
  await Promise.all([page.waitForEvent('load'), page.evaluate((hash) => { location.hash = hash; }, new URL(link).hash)]);
  await wait(() => window.__ready === true && window.__game?.store.state.house.roof === 'terracotta'
    && document.getElementById('my-home').hidden === false);

  const guest = await page.evaluate(() => ({
    buildHidden: document.getElementById('mode-build').hidden,
    saved: localStorage.getItem('house-lab-web:save'),
    guest: document.getElementById('my-home').hidden === false,
  }));
  say('같은 탭에서 방문자 집이 보이며 편집이 차단된다', guest.guest && guest.buildHidden);
  say('방문해도 내 집의 외관·가구 상태는 보존된다', sameHouse(guest.saved, original));
  const guestKept = await page.evaluate(() => {
    const before = localStorage.getItem('house-lab-web:save');
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('visibilitychange'));
    const refused = window.__game.saveNow() === false;
    return refused && localStorage.getItem('house-lab-web:save') === before;
  });
  say('구경 중 페이지를 떠나거나 저장을 호출해도 저장 글자는 바뀌지 않는다', guestKept);

  // 내 집으로 돌아오면 B의 지붕색이 다시 보인다.
  await Promise.all([page.waitForEvent('load'), page.click('#my-home')]);
  await wait(() => window.__ready === true && window.__game?.store.state.house.roof === 'slate'
    && document.getElementById('my-home').hidden === true);
  say('내 집으로 돌아오면 원래 집이 보인다', await page.evaluate(() => !location.hash.startsWith('#home=')
    && window.__game.store.state.house.roof === 'slate'));
  const afterHome = await page.evaluate(() => localStorage.getItem('house-lab-web:save'));
  say('내 집 복귀 후에도 원래 배치가 보존된다', sameHouse(afterHome, original));
  say('구경을 끝내고 돌아와도 구경 중 저장 글자는 유지된다', afterHome === guest.saved);

  // 가짜 바닥재 이름으로 조작된 링크는 내 집으로 열리고 로딩에서 멈추지 않는다.
  const altered = await page.evaluate(async () => {
    const { makeShareLink, PUBLIC_SHARE_URL } = await import('./src/share.js');
    const copy = structuredClone(window.__game.store.state);
    copy.spaces.main.floor = 'constructor';
    return makeShareLink(copy, PUBLIC_SHARE_URL);
  });
  await Promise.all([page.waitForEvent('load'), page.evaluate((hash) => { location.hash = hash; }, new URL(altered).hash)]);
  await wait(() => window.__ready === true && document.getElementById('loading').hidden
    && document.getElementById('my-home').hidden === true);
  const result = await page.evaluate(() => ({
    roof: window.__game.store.state.house.roof,
    floor: window.__game.store.state.spaces.main.floor,
    toast: document.getElementById('toast').textContent,
    saved: localStorage.getItem('house-lab-web:save'),
  }));
  say('조작된 링크가 로딩을 멈추지 않고 내 집으로 열린다',
    result.roof === 'slate' && result.floor !== 'constructor' && result.toast.includes('공유 링크'));
  say('조작된 링크도 내 집의 배치를 훼손하지 않는다', sameHouse(result.saved, original));
  await page.screenshot({ path: `${out}-final.png` });
}
