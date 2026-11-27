// 의자에 앉기 확인.
//   마우스: node tools/shot.mjs / <출력> 1280 800 test/sit.mjs
//   터치:   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/sit.mjs
export default async function sitTour(page, { out, logs }) {
  const cdp = process.env.TOUCH === '1' ? await page.context().newCDPSession(page) : null;
  const tapXY = async (p) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(70);
  };
  const g = (fn, arg) => page.evaluate(fn, arg);
  // 세계의 한 점이 화면의 어디인지
  const at = (x, y, z) => g(([a, b, c]) => {
    const { view } = window.__game;
    const v = new view.scene.position.constructor(a, b, c).project(view.camera);
    const r = document.getElementById('scene').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, [x, y, z]);
  const onScene = (p) => g(([a, b]) => document.elementFromPoint(a, b)?.id === 'scene', [p.x, p.y]);
  const tapFloor = async (x, z) => tapXY(await at(x, 0, z));
  // 의자의 앉는 면을 누른다. 화면에서 가려져 있으면 기록에 남긴다
  const tapSeat = async (x, z) => { const p = await at(x, 0.52, z); if (!(await onScene(p))) logs.push(`가려진 지점: 의자 (${x}, ${z})`); await tapXY(p); };
  const tapEl = async (sel) => {
    await g((s) => document.querySelector(s).scrollIntoView({ block: 'nearest', inline: 'center' }), sel);
    await page.waitForTimeout(40);
    const b = await page.locator(sel).boundingBox();
    await tapXY({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  };
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const waitPlace = (place) => page.waitForFunction((p) => window.__game.character.place === p, place, { timeout: 8000 }).then(() => page.waitForTimeout(350)).catch(() => {});
  // 다 앉았는지(true), 다 일어났는지(false) 기다린다
  const waitSit = (want) => page.waitForFunction((w) => {
    const c = window.__game.character;
    return w ? !!c.seated && c.sitAmount === 1 : !c.seated && c.sitAmount === 0 && !c.walking;
  }, want, { timeout: 7000 }).then(() => true).catch(() => false);
  const who = () => g(() => {
    const c = window.__game.character;
    const occ = window.__game.store.derived.occ[c.place].furniture;
    return {
      seat: c.seated, k: c.sitAmount, place: c.place,
      pos: [c.pos.x, c.pos.z], fig: [c.figure.position.x, c.figure.position.y, c.figure.position.z], turn: c.figure.rotation.y,
      standsOnFurniture: occ.has(`${Math.floor(c.pos.x)},${Math.floor(c.pos.z)}`),
    };
  });
  const near = (a, b, tol = 0.02) => Math.abs(a - b) < tol;
  const hint = () => g(() => document.getElementById('hint').textContent);
  const idAt = (space, x, y) => g(([s, a, b]) => window.__game.store.derived.occ[s].furniture.get(`${a},${b}`), [space, x, y]);
  const put = (space, part, x, y, rot = 0) => g(([s, p, a, b, r]) => {
    const { store } = window.__game;
    const id = store.nextId();
    return store.dispatch({ type: 'placeObject', space: s, id, part: p, x: a, y: b, rot: r, by: store.playerId }).ok ? id : null;
  }, [space, part, x, y, rot]);

  await page.waitForTimeout(400);
  await tapEl('#place-toggle');
  await waitPlace('main');
  const walkHint = await hint();
  // 안내나 알림이 바뀌어도 방이 화면에서 움직이지 않아야 한다. 방의 한 점이 화면의 어디인지로 본다
  const still = async (from) => { const now = await at(3, 0, 3); return Math.abs(now.x - from.x) < 0.5 && Math.abs(now.y - from.y) < 0.5; };
  const roomAt = await at(3, 0, 3);
  const chairA = await idAt('main', 2, 2); // 동쪽을 보는 의자 (탁자 쪽)
  const chairB = await idAt('main', 4, 4); // 탁자 앞쪽에서 안쪽을 보는 의자. 오른쪽 통로는 비워 둔다

  // 1) 의자를 누르면 걸어가서 앉는다
  await tapSeat(2.5, 2.5);
  let ok = await waitSit(true);
  let w = await who();
  say('의자를 눌러 앉기', ok && w.seat?.id === chairA && near(w.fig[0], 2.5) && near(w.fig[2], 2.5) && w.fig[1] > 0.2, JSON.stringify(w.fig.map((n) => +n.toFixed(2))));
  say('의자가 보는 쪽을 보고 앉는다', near(Math.cos(w.turn), Math.cos(Math.PI / 2)) && near(Math.sin(w.turn), Math.sin(Math.PI / 2)), w.turn.toFixed(2));
  say('서 있는 자리는 의자 옆의 빈 칸으로 남는다', !w.standsOnFurniture && Math.hypot(w.pos[0] - 2.5, w.pos[1] - 2.5) < 1.1, JSON.stringify(w.pos));
  // 입구에서 오면 바로 옆인 남쪽 칸(2,3)에 선다. 탁자를 돌아 북쪽 칸(2,1)까지 가지 않는다
  say('가까운 쪽 옆 칸에서 앉는다', near(w.pos[0], 2.5, 0.15) && near(w.pos[1], 3.5, 0.15), JSON.stringify(w.pos.map((n) => +n.toFixed(2))));
  say('앉으면 안내가 바뀐다', (await hint()).startsWith('앉았습니다'), await hint());
  say('안내가 바뀌어도 화면이 움직이지 않는다', await still(roomAt));
  await page.screenshot({ path: `${out}-1-seated.png` });

  // 2) 다른 곳을 누르면 일어나 걸어간다
  await tapFloor(1.5, 4.5);
  ok = await waitSit(false);
  w = await who();
  say('바닥을 눌러 일어나 걷기', ok && near(w.fig[1], 0) && Math.hypot(w.pos[0] - 1.5, w.pos[1] - 4.5) < 0.4, JSON.stringify(w.pos.map((n) => +n.toFixed(2))));
  // 6단계 HUD A: 의자를 눌러 앉아 보았으므로 이번 접속에서는 방의 걷기 안내를 접는다(처음 접속의 걷기 안내는 첫 걸음까지)
  const afterStand = await hint();
  say('일어나면 앉기 안내가 사라지고, 해 본 걷기 안내는 다시 뜨지 않는다', walkHint.includes('의자를 누르면') && !afterStand.startsWith('앉았습니다') && afterStand === '', JSON.stringify({ walkHint, afterStand }));

  // 3) 앉은 의자를 다시 누르면 일어난다
  await tapSeat(2.5, 2.5);
  await waitSit(true);
  const before = (await who()).pos;
  await tapSeat(2.5, 2.5);
  ok = await waitSit(false);
  w = await who();
  say('앉은 의자를 다시 눌러 일어나기', ok && near(w.pos[0], before[0]) && near(w.pos[1], before[1]));

  // 4) 앉은 채 다른 의자를 누르면 옮겨 앉는다
  await tapSeat(2.5, 2.5);
  await waitSit(true);
  await tapSeat(4.5, 4.5);
  ok = await page.waitForFunction((id) => { const c = window.__game.character; return c.seated?.id === id && c.sitAmount === 1; }, chairB, { timeout: 7000 }).then(() => true).catch(() => false);
  say('다른 의자로 옮겨 앉기', ok, JSON.stringify((await who()).seat));
  await page.screenshot({ path: `${out}-2-other-chair.png` });

  // 5) 꾸미기로 바꾸면 일어난다
  await tapEl('#mode-build');
  ok = await waitSit(false);
  say('꾸미기로 바꾸면 일어난다', ok);
  await tapEl('#mode-walk');

  // 6) 앉은 의자가 옮겨지면 일어난다
  await tapSeat(2.5, 2.5);
  await waitSit(true);
  const moved = await g((id) => window.__game.store.dispatch({ type: 'moveObject', space: 'main', id, x: 1, y: 4, rot: 0 }).ok, chairA);
  w = await who();
  say('앉은 의자가 옮겨지면 일어난다', moved && !w.seat && w.k === 0 && !w.standsOnFurniture);
  await g((id) => window.__game.store.dispatch({ type: 'moveObject', space: 'main', id, x: 2, y: 2, rot: 1 }), chairA);

  // 7) 깔개를 누른 뒤 곧바로 의자를 누르면 나가지 않고 앉는다
  // 깔개에서 먼 칸(탁자 뒤 오른쪽)에서 시작한다. 깔개 가까이 서 있으면 둘째 누름이 닿기 전에
  // 정말로 밖에 나가 버려(터치 흉내에서는 둘째 누름이 0.4초쯤 뒤에 닿는다) 시험이 까닭 없이 실패한다
  await g(() => window.__game.character.teleport(5.5, 1.5));
  await page.waitForTimeout(150);
  await tapFloor(3, 5.5);
  await tapSeat(2.5, 2.5);
  ok = await waitSit(true);
  await page.waitForTimeout(400);
  w = await who();
  say('깔개를 누른 뒤 의자를 누르면 나가지 않고 앉는다', ok && w.place === 'main' && w.seat?.id === chairA);

  // 8) 둘레가 모두 막힌 의자에는 앉지 않고 알린다
  const stool = await put('main', 'stool', 5, 5);
  await put('main', 'plant', 4, 5);
  await put('main', 'drawer', 5, 4);
  await page.waitForTimeout(150);
  await tapSeat(5.5, 5.5);
  await page.waitForTimeout(200);
  w = await who();
  const toast = await g(() => { const t = document.getElementById('toast'); return t.hidden ? '' : t.textContent; });
  say('막힌 의자는 알리고 앉지 않는다', !!stool && toast.includes('설 자리가 없습니다') && w.seat?.id === chairA, toast);
  await page.waitForTimeout(150);
  say('알림이 떠 있어도 화면이 움직이지 않는다', toast !== '' && await still(roomAt));
  await page.screenshot({ path: `${out}-2b-toast.png` });

  // 9) 마당의 스툴에 앉은 채 저장하고 다시 열면, 의자 옆에 서 있다
  await tapEl('#place-toggle');
  await waitPlace('yard');
  const yardStool = await put('yard', 'stool', 14, 11);
  await page.waitForTimeout(150);
  await tapSeat(14.5, 11.5);
  ok = await waitSit(true);
  w = await who();
  say('마당의 스툴에 앉기', ok && w.seat?.id === yardStool, JSON.stringify(w.fig.map((n) => +n.toFixed(2))));
  await page.screenshot({ path: `${out}-3-yard.png` });
  await g(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const after = await who();
  say('다시 열면 의자 옆 빈 칸에 서 있다', after.place === 'yard' && !after.seat && !after.standsOnFurniture && near(after.pos[0], w.pos[0], 0.01) && near(after.pos[1], w.pos[1], 0.01), JSON.stringify(after.pos));

  // 10) 키보드로 걸으면 일어난다 (마우스로 쓰는 화면에서만)
  if (!cdp) {
    await tapSeat(14.5, 11.5);
    await waitSit(true);
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(250);
    await page.keyboard.up('KeyS');
    ok = await waitSit(false);
    say('키보드로 걸으면 일어난다', ok);
  }
  logs.push('가로로 넘치는지: 문서 너비 ' + await g(() => document.documentElement.scrollWidth) + ' / 화면 ' + await g(() => innerWidth));
}
