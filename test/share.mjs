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
  say('방문해도 내 집 저장 내용은 그대로다', guest.saved === original);

  // 내 집으로 돌아오면 B의 지붕색이 다시 보인다.
  await Promise.all([page.waitForEvent('load'), page.click('#my-home')]);
  await wait(() => window.__ready === true && window.__game?.store.state.house.roof === 'slate'
    && document.getElementById('my-home').hidden === true);
  say('내 집으로 돌아오면 원래 집이 보인다', await page.evaluate(() => !location.hash.startsWith('#home=')
    && window.__game.store.state.house.roof === 'slate'));
  say('내 집 복귀 후에도 저장 내용은 같다', (await page.evaluate(() => localStorage.getItem('house-lab-web:save'))) === original);

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
  say('조작된 링크도 내 집 저장 내용은 훼손하지 않는다', result.saved === original);
  await page.screenshot({ path: `${out}-final.png` });
}
