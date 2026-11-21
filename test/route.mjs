// 작은 집의 탁자 건너편 이동: 실제 터치와 길 안내를 확인한다.
//   TOUCH=1 node tools/shot.mjs / shots/route 390 844 test/route.mjs
export default async function routeTour(page, { out, logs }) {
  const cdp = process.env.TOUCH === '1' ? await page.context().newCDPSession(page) : null;
  const tap = async (x, y) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(x, y);
    await page.waitForTimeout(75);
  };
  const where = ([x, y, z]) => page.evaluate(([a, b, c]) => {
    const { view } = window.__game;
    const v = new view.scene.position.constructor(a, b, c).project(view.camera);
    const box = document.getElementById('scene').getBoundingClientRect();
    return { x: box.left + (v.x + 1) * box.width / 2,
      y: box.top + (1 - v.y) * box.height / 2 };
  }, [x, y, z]);
  const floorTap = async (x, z) => {
    const p = await where([x, 0, z]);
    logs.push(`바닥 터치 좌표: (${Math.round(p.x)}, ${Math.round(p.y)})`);
    await tap(p.x, p.y);
  };
  const seatTap = async (x, z) => {
    const p = await where([x, 0.52, z]);
    await tap(p.x, p.y);
  };
  const say = (name, ok, details = '') => logs.push(`${ok ? '통과' : '실패'}  ${name} ${details}`);
  await page.waitForFunction(() => window.__ready === true);
  await page.click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'main');
  await page.waitForTimeout(420);

  const initial = await page.evaluate(() => {
    const objects = Object.values(window.__game.store.state.spaces.main.objects);
    return {
      rightChair: objects.find((o) => o.part === 'chair' && o.x === 4 && o.y === 4)?.id || null,
      passageFree: !window.__game.store.derived.occ.main.furniture.has('5,3'),
    };
  });
  say('새 집은 탁자 오른쪽에 통로가 있고 의자가 앞쪽에 있다', !!initial.rightChair && initial.passageFree);
  await seatTap(4.5, 4.5);
  const sat = await page.waitForFunction(() => window.__game.character.seated?.id &&
    window.__game.character.sitAmount === 1, null, { timeout: 8500 }).then(() => true).catch(() => false);
  say('탁자 앞 의자에 터치로 앉는다', sat);
  await floorTap(3.5, 1.5);
  const crossed = await page.waitForFunction(() => {
    const c = window.__game.character;
    return Math.hypot(c.pos.x - 3.5, c.pos.z - 1.5) < 0.4;
  }, null, { timeout: 12500 }).then(() => true).catch(() => false);
  const pos = await page.evaluate(() => [window.__game.character.pos.x, window.__game.character.pos.z]);
  say('의자에서 일어나 탁자 반대편까지 돌아서 걸어간다', crossed, JSON.stringify(pos.map((n) => +n.toFixed(2))));
  await page.screenshot({ path: `${out}-open-passage.png` });

  // 탁자 뒤에서 탁자 앞 의자를 누르면 가까운 오른쪽 칸(5,4)으로 가서 앉는다. 탁자를 크게 돌아 왼쪽 칸(3,4)으로 가지 않는다
  await seatTap(4.5, 4.5);
  const satNear = await page.waitForFunction(() => window.__game.character.seated?.id &&
    window.__game.character.sitAmount === 1, null, { timeout: 8500 }).then(() => true).catch(() => false);
  const stand = await page.evaluate(() => [window.__game.character.pos.x, window.__game.character.pos.z]);
  say('탁자 뒤에서 앞 의자를 누르면 가까운 쪽에서 앉는다', satNear && Math.hypot(stand[0] - 5.5, stand[1] - 4.5) < 0.2,
    JSON.stringify(stand.map((n) => +n.toFixed(2))));

  // 가구나 벽, 바닥 바깥을 누르면 그 근처로 걸어갈 뿐 길이 막혔다고 하지 않는다
  const clearToast = () => page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = ''; t.hidden = true; });
  const quietWalk = async (label, x, z) => {
    await clearToast();
    await floorTap(x, z);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      blocked: window.__game.character.routeBlocked,
      toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent,
      seated: !!window.__game.character.seated,
    }));
    say(`${label} 누르면 막혔다고 하지 않는다`, !r.blocked && !r.toast.includes('가구 때문에') && !r.seated, JSON.stringify(r));
  };
  await quietWalk('탁자를', 3.5, 2.5);
  await quietWalk('화분을', 0.5, 5.5);
  await quietWalk('북쪽 벽 너머를', 3.5, -1.5);
  await quietWalk('방 바깥 오른쪽을', 7.5, 2.5);

  // 과거 초기 배치를 일부러 재현한다. 코드는 사용자의 이미 저장된 가구를 이동시키지 않는다.
  const recreated = await page.evaluate(() => {
    const { store, character } = window.__game;
    const chair = Object.values(store.state.spaces.main.objects).find((o) =>
      o.part === 'chair' && o.x === 4 && o.y === 4);
    const r = store.dispatch({ type: 'moveObject', space: 'main', id: chair.id, x: 5, y: 3, rot: 3 });
    character.teleport(3, 5.1);
    return r.ok;
  });
  say('기존에 통로를 가로막던 배치를 시험용으로 재현한다', recreated);
  await page.waitForTimeout(200);
  await floorTap(3.5, 1.5);
  const blocked = await page.waitForFunction(() => window.__game.character.routeBlocked &&
    document.getElementById('toast').textContent.includes('가구 때문에'), null, { timeout: 3500 })
    .then(() => true).catch(() => false);
  const actual = await page.evaluate(() => ({
    warning: document.getElementById('toast').textContent,
    oldChairKept: Object.values(window.__game.store.state.spaces.main.objects)
      .some((o) => o.part === 'chair' && o.x === 5 && o.y === 3),
  }));
  say('기존 배치에서 막힌 길을 누르면 이유를 안내한다', blocked, actual.warning);
  say('안내한다고 저장된 가구를 몰래 옮기지 않는다', actual.oldChairKept);
  await page.screenshot({ path: `${out}-blocked-passage.png` });
  say('휴대폰 화면에 가로 넘침이 없다',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  // 같은 막힌 집을 친구가 공유 링크로 구경할 때: 꾸미기를 쓸 수 없으니 꾸미기 안내를 하지 않는다
  const link = await page.evaluate(async () => {
    const { makeShareLink, PUBLIC_SHARE_URL } = await import('./src/share.js');
    return makeShareLink(window.__game.store.state, PUBLIC_SHARE_URL);
  });
  await Promise.all([page.waitForEvent('load'), page.evaluate((hash) => { location.hash = hash; }, new URL(link).hash)]);
  await page.waitForFunction(() => window.__ready === true && !document.getElementById('my-home').hidden, null, { timeout: 20000 });
  await page.waitForTimeout(420);
  const guestHouse = await page.evaluate(() => ({
    place: window.__game.character.place,
    oldChair: Object.values(window.__game.store.state.spaces.main.objects).some((o) => o.part === 'chair' && o.x === 5 && o.y === 3),
  }));
  await clearToast();
  await floorTap(3.5, 1.5);
  const guestToast = await page.waitForFunction(() => document.getElementById('toast').textContent.includes('가구 때문에'), null, { timeout: 3500 })
    .then(() => page.evaluate(() => document.getElementById('toast').textContent)).catch(() => '');
  say('구경하는 사람에게는 막힌 길만 알리고 꾸미기 안내는 하지 않는다',
    guestHouse.place === 'main' && guestHouse.oldChair && guestToast.includes('가구 때문에') && !guestToast.includes('꾸미기'),
    JSON.stringify({ ...guestHouse, guestToast }));
  await page.screenshot({ path: `${out}-guest-blocked.png` });
}
