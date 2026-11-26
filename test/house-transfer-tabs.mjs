// 서로 다른 두 탭 중 오래된 탭이 새 집을 자동 저장으로 덮어쓰지 않는지 검증한다.
// Firebase 서버에 접속하지 않고 같은 출처의 localStorage만 사용한다.
// 끝에서는 가져오기·맞바꾸기 확인 창이 떠 있는 사이 다른 탭이 새 판의 집을 저장해도 그 원문을 잃지 않는지 본다.
// 확인 창은 브라우저의 진짜 창(window.confirm)이다. 창이 떠 있는 동안 이 탭은 다른 탭의 변경을 받지 못하고,
// 창을 닫은 바로 그 자리에서 읽으면 옛 내용이 나왔다(2026-11-26 GPT 재검토, 가짜 저장소 시험으로는 보이지 않음)
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

    // ---- 확인 창이 떠 있는 사이 다른 탭이 새 판의 집을 저장한다 ----
    const writer = await page.context().newPage();
    const ready = (p) => p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    await writer.goto(origin + '/', { waitUntil: 'load' });
    await ready(writer);
    // 다른 탭이 지금 집에 이 화면이 모르는 부품을 하나 더해 저장한다(새 판의 게임이 저장한 것처럼). 원문을 돌려준다
    const writeNewer = (id) => writer.evaluate((objId) => {
      const d = JSON.parse(localStorage.getItem('house-lab-web:save'));
      d.state.spaces.yard.objects[objId] = { id: objId, part: 'future_thing', x: 1, y: 1, rot: 0, by: 'p1' };
      const text = JSON.stringify(d);
      localStorage.setItem('house-lab-web:save', text);
      return text;
    }, id);
    const houseKeys = () => writer.evaluate(() => ({
      save: localStorage.getItem('house-lab-web:save'),
      previous: (() => { try { return JSON.parse(localStorage.getItem('house-lab-web:before-import')).previous; } catch { return null; } })(),
      journal: localStorage.getItem('house-lab-web:transfer-pending'),
    }));
    // 확인 창이 뜨면 다른 탭이 저장을 마친 뒤에 "예"를 누른다
    const acceptAfterWrite = (id) => new Promise((resolve) => {
      page.once('dialog', async (dialog) => {
        const text = await writeNewer(id);
        await new Promise((r) => setTimeout(r, 300));
        await dialog.accept();
        resolve(text);
      });
    });
    try {
      // 1) 가져오기: 보관된 집이 있는 채로, 공유 링크의 집을 가져오려 한다
      const link = await page.evaluate(async () => {
        const { makeShareLink } = await import('./src/share.js');
        const s = JSON.parse(JSON.stringify(window.__game.store.state));
        s.house.roof = 'terracotta';
        return makeShareLink(s, location.origin + '/');
      });
      await page.goto(link);
      await page.waitForFunction(() => window.__ready === true && document.getElementById('share-house').textContent === '집 가져오기', null, { timeout: 30000 });
      const accepted = acceptAfterWrite('zz-import');
      await page.click('#share-house');
      const newerImport = await accepted;
      await page.waitForFunction(() => (document.getElementById('toast')?.textContent || '').includes('더 새로운 판'), null, { timeout: 5000 }).catch(() => {});
      const afterImport = await houseKeys();
      const importToast = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
      say('가져오기 확인 창 사이 다른 탭이 저장한 새 판의 집을 덮어쓰지 않는다',
        afterImport.save === newerImport && afterImport.journal === null && importToast.includes('더 새로운 판'),
        JSON.stringify({ kept: afterImport.save === newerImport, toast: importToast.slice(0, 30) }));

      // 2) 맞바꾸기: 보통 집으로 열어 둔 탭에서 맞바꾸려 한다
      await writer.evaluate((t) => localStorage.setItem('house-lab-web:save', t), before);
      const kept = (await houseKeys()).previous;
      await page.goto(origin + '/');
      await page.waitForFunction(() => window.__ready === true && document.getElementById('share-house').textContent === '집 공유', null, { timeout: 30000 });
      await page.click('#share-house');
      await page.waitForSelector('#share-restore-previous:not([hidden])', { timeout: 10000 });
      const swapped = acceptAfterWrite('zz-swap');
      const reloaded = page.waitForEvent('load', { timeout: 15000 }).catch(() => null);
      await page.click('#share-restore-previous');
      const newerSwap = await swapped;
      await reloaded;
      const afterSwap = await houseKeys();
      say('맞바꾸기 확인 창 사이 다른 탭이 저장한 새 판의 집은 글자 그대로 보관된다',
        afterSwap.previous === newerSwap && afterSwap.save === kept && afterSwap.journal === null,
        JSON.stringify({ kept: afterSwap.previous === newerSwap, swapped: afterSwap.save === kept }));
    } finally {
      if (!writer.isClosed()) await writer.close();
    }
    await page.screenshot({ path: `${out}-tabs.png` });
  } finally {
    if (!stale.isClosed()) await stale.close();
  }
}
