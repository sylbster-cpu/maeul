// 집 공유 링크를 다른 브라우저의 내 집으로 안전하게 복원하고 이전 집으로 되돌린다.
// 실제 Firebase에 연결하거나 온라인 집·방명록을 고치지 않는다.
export default async function transferTour(page, { out, logs }) {
  const say = (name, ok, details = '') => logs.push(`${ok ? '통과' : '실패'}  ${name} ${details}`);
  const ready = () => page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const save = () => page.evaluate(() => localStorage.getItem('house-lab-web:save'));
  const backup = () => page.evaluate(() => localStorage.getItem('house-lab-web:before-import'));
  const roof = () => page.evaluate(() => window.__game.store.state.house.roof);
  let lastDialog = '';
  page.on('dialog', async (dialog) => { lastDialog = dialog.message(); await dialog.accept(); });

  await ready();
  await page.evaluate(() => {
    window.__game.store.dispatch({ type: 'setExterior', slot: 'roof', value: 'slate' });
    window.__game.saveNow();
    localStorage.setItem('firebase:test-owner-key', 'untouched');
  });

  const link = await page.evaluate(async () => {
    const { makeShareLink, PUBLIC_SHARE_URL } = await import('./src/share.js');
    const sample = structuredClone(window.__game.store.state);
    sample.house.roof = 'moss';
    return makeShareLink(sample, PUBLIC_SHARE_URL);
  });
  say('다른 브라우저로 보낼 집 공유 링크가 생성된다', link.includes('#home='));

  await Promise.all([page.waitForEvent('load'), page.evaluate((hash) => { location.hash = hash; }, new URL(link).hash)]);
  await ready();
  say('공유 집은 먼저 읽기 전용으로 열린다',
    await page.locator('#mode-build').isHidden() && await page.locator('#share-house').isVisible());
  say('공유 집에 집 가져오기 버튼이 나타난다',
    (await page.locator('#share-house').textContent()).includes('집 가져오기'));
  const oldSave = await save();
  say('구경하기만 할 때 기존 저장 집은 그대로다', (await roof()) === 'moss' && oldSave !== null);

  await Promise.all([page.waitForEvent('load'), page.locator('#share-house').click()]);
  await ready();
  const imported = await save(), oldBackup = await backup();
  const data = JSON.parse(imported);
  say('확인 후 공유 집이 이 브라우저의 내 집이 된다',
    (await roof()) === 'moss' && data.state.house.roof === 'moss' && await page.locator('#mode-build').isVisible());
  say('복사하기 전 내 집의 원본이 안전하게 백업된다',
    !!oldBackup && JSON.parse(oldBackup).previous === oldSave);
  say('Firebase 익명 사용자나 온라인 집 관련 저장은 변경되지 않는다',
    await page.evaluate(() => localStorage.getItem('firebase:test-owner-key') === 'untouched'));

  await page.locator('#share-house').click();
  await page.waitForFunction(() => !document.getElementById('share-layer').hidden);
  say('내 집 공유 창에 되돌리기 버튼이 나타난다', await page.locator('#share-restore-previous').isVisible());
  await Promise.all([page.waitForEvent('load'), page.locator('#share-restore-previous').click()]);
  await ready();
  say('이전 집으로 되돌리면 원래 외관이 복구된다', (await roof()) === 'slate');
  say('맞바꾸면 원래 집은 되돌아오고 가져왔던 집은 백업으로 남는다',
    (await save()) === oldSave && JSON.parse(await backup()).previous === imported);
  say('맞바꾼 뒤에도 복구 버튼은 남아 있다', await page.locator('#share-house').isVisible());
  say('맞바꾼 뒤 온라인 사용자 관련 저장은 그대로다',
    await page.evaluate(() => localStorage.getItem('firebase:test-owner-key') === 'untouched'));
  await page.screenshot({ path: `${out}-restored.png` });

  // 이전에 Claude가 재현한 0.4초 간격의 두 번 누르기 문제를 방지한다.
  await page.locator('#share-house').click();
  await page.waitForFunction(() => !document.getElementById('share-layer').hidden);
  const previous = await save();
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => {
      const button = document.getElementById('share-restore-previous');
      button.click();
      button.click(); // 새로고침되기 전 같은 버튼을 또 눌러도 두 번째 교환은 불가
    }).catch((error) => {
      if (!/navigation|context.*destroyed/i.test(String(error))) throw error;
    }),
  ]);
  await ready();
  say('복구 버튼을 빠르게 두 번 눌러도 한 번만 맞바뀐다', (await roof()) === 'moss');
  say('두 번 누른 뒤에도 두 집의 원본을 보관한다',
    JSON.parse(await backup()).previous === previous);
  say('작은 휴대폰 화면에서 가로 넘침이 없다',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${out}-swapped-back.png` });

  // 보관 칸이 차 있어도 새 링크를 가져올 수 있다(2026-11-22 고침, PR #15 Claude 검토 1번).
  // 보관된 집은 그대로 두고 지금 집이 바뀐다는 것을 확인 창에서 알린다
  const keptBackup = await backup();
  const link3 = await page.evaluate(async () => {
    const { makeShareLink, PUBLIC_SHARE_URL } = await import('./src/share.js');
    const sample = structuredClone(window.__game.store.state);
    sample.house.roof = 'terracotta';
    return makeShareLink(sample, PUBLIC_SHARE_URL);
  });
  await Promise.all([page.waitForEvent('load'), page.evaluate((hash) => { location.hash = hash; }, new URL(link3).hash)]);
  await ready();
  await Promise.all([page.waitForEvent('load'), page.locator('#share-house').click()]);
  await ready();
  say('보관된 집이 있어도 새 링크의 집을 가져올 수 있다',
    (await roof()) === 'terracotta' && JSON.parse(await save()).state.house.roof === 'terracotta', lastDialog.slice(0, 60));
  say('가져오기 전에 지금 집이 바뀌고 보관된 집은 남는다고 알린다',
    lastDialog.includes('보관해 둔 다른 집은 그대로') && lastDialog.includes('되살릴 수 없습니다'));
  say('새로 가져와도 보관된 집의 원본은 그대로다', (await backup()) === keptBackup);
}
