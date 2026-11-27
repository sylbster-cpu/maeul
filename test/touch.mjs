// 휴대폰 터치 조작 확인. 실행: TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/touch.mjs
import { uiClick } from './helpers/menu.mjs';
export default async function touchTour(page, { out, logs }) {
  const cdp = await page.context().newCDPSession(page);
  const at = (x, z) => page.evaluate(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
  const pts = (list) => list.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: i + 1 }));
  const touch = (type, list) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts(list) });
  const tapXY = async (p) => { await touch('touchStart', [p]); await touch('touchEnd', []); await page.waitForTimeout(70); };
  const tap = async (x, z) => tapXY(await at(x, z));
  const tapRaw = async (sel) => {
    await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'nearest', inline: 'center' }), sel);
    await page.waitForTimeout(40);
    const b = await page.locator(sel).boundingBox();
    await tapXY({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  };
  // 꾸미기 목록 안의 버튼이면 목록이 닫혀 있을 때 손가락으로 연 뒤에 누른다(6단계 HUD B)
  const tapEl = (sel) => uiClick(page, sel, tapRaw);
  const swipe = async (a, b, steps = 6) => {
    const p = await at(...a), q = await at(...b);
    await touch('touchStart', [p]);
    for (let i = 1; i <= steps; i++) await touch('touchMove', [{ x: p.x + (q.x - p.x) * i / steps, y: p.y + (q.y - p.y) * i / steps }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(70);
  };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const parts = (space, part) => g(([s, p]) => JSON.stringify(Object.values(window.__game.store.state.spaces[s].objects).filter((o) => o.part === p).map((o) => [o.x, o.y, o.rot])), [space, part]);
  const seen = async (x, z) => { const p = await at(x, z); return g(([a, b]) => document.elementFromPoint(a, b)?.id === 'scene', [p.x, p.y]); };
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const waitPlace = (place) => page.waitForFunction((p) => window.__game.character.place === p, place, { timeout: 8000 }).then(() => page.waitForTimeout(350)).catch(() => {});

  await page.waitForTimeout(400);
  logs.push('터치 기기로 인식: ' + await g(() => matchMedia('(pointer: coarse)').matches) + ' / 안내: ' + await g(() => document.getElementById('hint').textContent));
  await page.screenshot({ path: `${out}-1-yard.png` });

  // 1) 마당: 땅을 눌러 걷고, 집을 눌러 들어간다
  const p0 = await g(() => ({ ...window.__game.character.pos }));
  await tap(14.5, 13);
  await page.waitForTimeout(1200);
  const p1 = await g(() => ({ ...window.__game.character.pos }));
  say('땅을 눌러 걷기', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 1);
  const house = await at(12, 8.6);
  await tapXY({ x: house.x, y: house.y - 30 });
  await waitPlace('main');
  say('집을 눌러 들어가기', (await g(() => window.__game.character.place)) === 'main');
  await page.screenshot({ path: `${out}-2-room.png` });

  // 2) 방: 꾸미기
  await tapEl('#mode-build');
  await page.waitForTimeout(300);
  const hidden = [];
  for (const c of [[4.5, 4.5], [5.5, 5.5], [0.5, 4.5], [1.5, 3.5], [3, 5.5]]) if (!(await seen(...c))) hidden.push(c.join(','));
  logs.push('가려진 시험 지점: ' + (hidden.length ? hidden.join(' / ') : '없음'));
  await tapEl('#tool-stool');
  await swipe([4.5, 4.5], [5.5, 5.5]);
  say('누른 채 움직여 뗀 자리에 놓기', (await parts('main', 'stool')) === '[[5,5,0]]', await parts('main', 'stool'));
  await tapEl('#rotate-part');
  say('돌리기 버튼', (await parts('main', 'stool')) === '[[5,5,1]]', await parts('main', 'stool'));
  await tapEl('#tool-select');
  await tap(5.5, 5.5);
  const carrying = await g(() => ({ carry: !!window.__game.input.state.carry, shown: !document.getElementById('cancel-carry').hidden }));
  say('눌러서 집기와 그만두기 버튼', carrying.carry && carrying.shown);
  await tapEl('#cancel-carry');
  await tap(5.5, 5.5);
  await tap(0.5, 4.5);
  say('두 번 눌러 옮기기', (await parts('main', 'stool')) === '[[0,4,1]]', await parts('main', 'stool'));
  await swipe([0.5, 4.5], [1.5, 3.5]);
  say('끌어서 옮기기', (await parts('main', 'stool')) === '[[1,3,1]]', await parts('main', 'stool'));
  await tapEl('#undo');
  say('되돌리기 버튼', (await parts('main', 'stool')) === '[[0,4,1]]', await parts('main', 'stool'));

  // 2-1) 소품: 탁자 위를 눌러 올려놓는다
  await tapEl('#tab-props');
  await page.waitForTimeout(80);
  await tapEl('#tool-table_lamp');
  await tap(3.5, 2.5);
  // 방향은 앞에서 돌리기 버튼으로 바꾼 값이 이어지므로 자리만 본다
  say('탁자 위를 눌러 소품 놓기', (await parts('main', 'table_lamp')).startsWith('[[3,2,'), await parts('main', 'table_lamp'));
  // 2-2) 벽걸이: 벽을 눌러 건다
  await tapEl('#tab-wall');
  await page.waitForTimeout(80);
  await tapEl('#tool-frame_small');
  const wallXY = (x, y, z) => g(([a, b, c]) => {
    const { view } = window.__game;
    const v = new view.scene.position.constructor(a, b, c).project(view.camera);
    const r = document.getElementById('scene').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, [x, y, z]);
  const onScene = (p) => g(([a, b]) => document.elementFromPoint(a, b)?.id === 'scene', [p.x, p.y]);
  const wp = await wallXY(0, 2, 1.5);
  if (!(await onScene(wp))) logs.push('벽 시험 지점이 가려짐');
  await tapXY(wp);
  const hung = () => g(() => JSON.stringify(Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'frame_small').map((o) => [o.wall, o.i])));
  say('벽을 눌러 액자 걸기', (await hung()) === '[["W",1]]', await hung());
  // 누른 채 벽을 따라 움직여 다른 칸에 건다
  const w1 = await wallXY(0, 2, 2.5), w2 = await wallXY(0, 2, 4.5);
  await touch('touchStart', [w1]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: w1.x + (w2.x - w1.x) * i / 5, y: w1.y + (w2.y - w1.y) * i / 5 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(70);
  say('벽을 따라 움직여 뗀 자리에 걸기', (await hung()) === '[["W",1],["W",4]]', await hung());
  await page.screenshot({ path: `${out}-2b-decor.png` });
  await tapEl('#tab-furniture');

  // 3) 바닥재와 벽지
  await tapEl('#tab-style');
  await page.waitForTimeout(100);
  await tapEl('#floor-walnut');
  await tapEl('#wall-rose');
  say('바닥재와 벽지 고르기', (await g(() => window.__game.store.state.spaces.main.floor + '/' + window.__game.store.state.spaces.main.wall)) === 'walnut/rose');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}-3-room-style.png` });

  // 4) 두 손가락 확대와 축소: 아무것도 놓이지 않아야 한다
  await tapEl('#tab-furniture');
  await tapEl('#tool-chair');
  const z0 = await g(() => window.__game.view.viewSize);
  const n0 = await g(() => Object.keys(window.__game.store.state.spaces.main.objects).length);
  const a = { x: 150, y: 330 }, b = { x: 240, y: 330 };
  await touch('touchStart', [a]);
  await touch('touchStart', [a, b]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [{ x: a.x - i * 8, y: a.y }, { x: b.x + i * 8, y: b.y }]);
  await touch('touchEnd', [{ x: a.x - 40, y: a.y }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const z1 = await g(() => window.__game.view.viewSize);
  say('두 손가락으로 확대', z1 < z0 * 0.85 && (await g(() => Object.keys(window.__game.store.state.spaces.main.objects).length)) === n0, `${z0.toFixed(1)} → ${z1.toFixed(1)}`);
  await g(() => window.__game.view.zoomBy(1.6));

  // 5) 깔개를 눌러 나간 뒤, 마당에서 겉모습을 바꾸고 집을 키운다
  await tapEl('#mode-walk');
  await page.waitForTimeout(200);
  await tap(3, 5.5);
  await waitPlace('yard');
  say('깔개를 눌러 나가기', (await g(() => window.__game.character.place)) === 'yard');
  await tapEl('#mode-build');
  await tapEl('#tab-style');
  await page.waitForTimeout(100);
  await tapEl('#roof-moss');
  await tapEl('#upgrade');
  say('지붕 색 고르기와 집 키우기', (await g(() => window.__game.store.state.house.roof + window.__game.store.state.house.level)) === 'moss2');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}-4-yard-style.png` });

  // 6) 마당에 가구 놓기
  await tapEl('#tab-furniture');
  await tapEl('#tool-plant');
  const spot = await g(() => { const c = window.__game.character.pos; return [Math.floor(c.x) + 2.5, Math.floor(c.z) + 1.5]; });
  if (await seen(...spot)) await tap(...spot); else logs.push('마당 시험 지점이 가려짐');
  say('마당에 화분 놓기', JSON.parse(await parts('yard', 'plant')).length === 2, await parts('yard', 'plant'));
  logs.push('가로로 넘치는지: 문서 너비 ' + await g(() => document.documentElement.scrollWidth) + ' / 화면 ' + await g(() => innerWidth));
}
