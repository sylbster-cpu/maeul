// 서로 다른 두 탭 중 오래된 탭이 새 집을 자동 저장으로 덮어쓰지 않는지 검증한다.
// Firebase 서버에 접속하지 않고 같은 출처의 localStorage만 사용한다.
export default async function transferTabsTour(page, { out, logs }) {
  const say = (name, ok, details = '') => logs.push(`${ok ? '통과' : '실패'}  ${name} ${details}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__game.store.dispatch({ type: 'setExterior', slot: 'roof', value: 'slate' });
    window.__game.saveNow();
    localStorage.setItem('firebase:separate-owner', 'unchanged');
  });

  // 다른 탭이 같은 저장 집을 읽어 둔다.
  const stale = await page.context().newPage();
  try {
    const origin = new URL(page.url()).origin;
    await stale.goto(origin + '/', { waitUntil: 'load' });
    await stale.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    const before = await page.evaluate(() => localStorage.getItem('house-lab-web:save'));
    const secondRoof = await stale.evaluate(() => window.__game.store.state.house.roof);
    say('두 번째 탭이 변경 전 집을 열었다', secondRoof === 'slate');

    // 첫 번째 탭이 집을 가져오면서 두 저장 키를 바꾼다.
    const imported = await page.evaluate(async () => {
      const { importSharedHouse } = await import('./src/house-transfer.js');
      const state = structuredClone(window.__game.store.state);
      state.house.roof = 'moss';
      importSharedHouse(localStorage, state);
      return localStorage.getItem('house-lab-web:save');
    });
    say('첫 번째 탭에서 집을 새 배치로 가져왔다', JSON.parse(imported).state.house.roof === 'moss');
    await stale.waitForFunction(() => document.getElementById('save-status').textContent.includes('다른 탭'), null, { timeout: 7000 });

    // 두 번째 탭이 화면을 떠날 때 이전 집을 저장하지 못해야 한다.
    const staleResult = await stale.evaluate(() => {
      const before = localStorage.getItem('house-lab-web:save');
      window.dispatchEvent(new Event('pagehide'));
      document.dispatchEvent(new Event('visibilitychange'));
      const attempted = window.__game.saveNow();
      return { attempted, unchanged: localStorage.getItem('house-lab-web:save') === before,
        label: document.getElementById('save-status').textContent };
    });
    say('오래된 탭의 pagehide와 직접 저장은 모두 차단된다',
      staleResult.attempted === false && staleResult.unchanged && staleResult.label.includes('다른 탭'));
    say('현재 집과 보관된 이전 집의 원본이 보존된다',
      await page.evaluate((original) =>
        JSON.parse(localStorage.getItem('house-lab-web:save')).state.house.roof === 'moss' &&
        JSON.parse(localStorage.getItem('house-lab-web:before-import')).previous === original, before));

    // 두 탭이 저장을 거절한 상태여도 교환 알고리즘은 양방향으로 안전하다.
    const swapped = await page.evaluate(async () => {
      const { restorePreviousHouse } = await import('./src/house-transfer.js');
      restorePreviousHouse(localStorage);
      return {
        now: localStorage.getItem('house-lab-web:save'),
        other: JSON.parse(localStorage.getItem('house-lab-web:before-import')).previous,
        firebase: localStorage.getItem('firebase:separate-owner'),
      };
    });
    say('맞바꾸기 후에도 두 집을 잃지 않는다',
      swapped.now === before && swapped.other === imported && swapped.firebase === 'unchanged');
    await stale.close();
    say('오래된 탭을 닫아도 교환 결과가 변하지 않는다',
      await page.evaluate((original) => localStorage.getItem('house-lab-web:save') === original, before));
    await page.screenshot({ path: `${out}-tabs.png` });
  } finally {
    if (!stale.isClosed()) await stale.close();
  }
}
