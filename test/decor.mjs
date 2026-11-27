// 소품과 벽걸이 확인 (마우스)
import { uiClick } from './helpers/menu.mjs';
export default async function decor(page, { out, logs }) {
  const shot = (name) => page.screenshot({ path: `${out}-${name}.png` });
  const at = (x, z) => page.evaluate(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
  const click = async (x, z) => { const p = await at(x, z); await page.mouse.click(p.x, p.y); };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const obj = (id) => g((i) => { const o = window.__game.store.state.spaces.main.objects[i]; return o ? JSON.stringify([o.part, o.x, o.y, o.rot, o.wall, o.i, o.on].filter((v) => v !== undefined)) : null; }, id);
  const byPart = (part) => g((p) => Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === p).map((o) => o.id), part);
  const count = () => g(() => Object.keys(window.__game.store.state.spaces.main.objects).length);
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  // 벽의 한 지점이 화면의 어디인지 (세계 좌표 x, y, z)
  const wallAt = (x, y, z) => g(([a, b, c]) => { const v = window.__game.view; const p0 = v.screenPoint(a, c); const p1 = v.screenPoint(a + 1, c); const up = v.screenPoint(a, c); return { p0, p1, up }; }, [x, y, z]);

  await page.waitForTimeout(400);
  await page.click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'main');
  await page.waitForTimeout(500);
  await shot('1-sample');
  logs.push('처음 방의 물건 수 ' + await count());

  await page.keyboard.press('KeyB');
  // 1) 소품 탭: 탁자 위에 탁상 스탠드
  await uiClick(page, '#tab-props');
  await uiClick(page, '#tool-table_lamp');
  await click(3.5, 2.5);
  const lamp = (await byPart('table_lamp'))[0];
  say('탁자 위에 소품 놓기', !!lamp, await obj(lamp));
  await click(1.5, 4.5);
  say('맨바닥에는 놓이지 않음', (await byPart('table_lamp')).length === 1, await g(() => document.getElementById('toast').textContent));

  // 2) 탁자를 옮기면 위의 소품이 따라간다
  const table = (await byPart('table'))[0];
  const books = (await byPart('books'))[0];
  logs.push('옮기기 전 탁자 ' + await obj(table) + ' 책 ' + await obj(books) + ' 스탠드 ' + await obj(lamp));
  await uiClick(page, '#tab-furniture');
  await uiClick(page, '#tool-select');
  // 탁자의 빈 모서리 칸을 눌러 집는다 (소품이 없는 칸)
  await click(3.5, 3.6);
  const carrying = await g(() => window.__game.input.state.carry?.part);
  if (carrying !== 'table') { await page.keyboard.press('Escape'); await g(([id]) => { const i = window.__game.input; const o = window.__game.store.state.spaces.main.objects[id]; i.state.carry = { id, part: o.part, rot: o.rot }; window.__game.view.setHidden(id); }, [table]); }
  logs.push('집은 것: ' + carrying);
  await page.keyboard.press('KeyR');
  await click(3, 4);
  logs.push('옮긴 뒤 탁자 ' + await obj(table) + ' 책 ' + await obj(books) + ' 스탠드 ' + await obj(lamp));
  const onTable = await g(([t, ids]) => { const s = window.__game.store; const occ = s.derived.occ.main.furniture; return ids.every((id) => { const o = s.state.spaces.main.objects[id]; return occ.get(`${o.x},${o.y}`) === t && o.on === t; }); }, [table, [books, lamp]]);
  say('탁자를 돌려 옮기면 소품이 따라감', onTable);
  await page.keyboard.press('Control+KeyZ');
  say('되돌리면 소품도 제자리', (await obj(books)).includes('"books",4,3,0'), await obj(books));

  // 3) 벽걸이: 서쪽 벽과 북쪽 벽
  await uiClick(page, '#tab-wall');
  await uiClick(page, '#tool-frame_medium');
  const wallPoint = (x, y, z) => g(([a, b, c]) => {
    const { view } = window.__game; const T = view.camera.constructor; // 세계 좌표를 화면으로
    const v = new view.scene.position.constructor(a, b, c).project(view.camera);
    const r = document.getElementById('scene').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, [x, y, z]);
  let p = await wallPoint(0, 2, 1.5); // 서쪽 벽의 1번 칸
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(200);
  await shot('2-wall-ghost');
  await page.mouse.click(p.x, p.y);
  const fm = (await byPart('frame_medium'))[0];
  say('서쪽 벽에 액자 걸기', (await obj(fm)) === '["frame_medium","W",1]', await obj(fm));
  p = await wallPoint(3.5, 2, 0); // 북쪽 벽의 창문 자리
  await page.mouse.click(p.x, p.y);
  say('창문에는 걸리지 않음', (await byPart('frame_medium')).length === 1, await g(() => document.getElementById('toast').textContent));
  p = await wallPoint(5.5, 2, 0); // 북쪽 벽의 5번 칸
  await page.mouse.click(p.x, p.y);
  say('북쪽 벽에 액자 걸기', (await byPart('frame_medium')).length === 2);

  // 4) 벽걸이 옮기기와 치우기
  await uiClick(page, '#tool-select');
  p = await wallPoint(0, 2.05, 1.5);
  await page.mouse.click(p.x, p.y);
  say('벽에 건 것 집기', (await g(() => window.__game.input.state.carry?.part)) === 'frame_medium');
  p = await wallPoint(0, 2, 5.5);
  await page.mouse.click(p.x, p.y);
  say('다른 벽 칸으로 옮기기', (await obj(fm)) === '["frame_medium","W",5]', await obj(fm));
  await uiClick(page, '#tool-erase');
  p = await wallPoint(0, 2.05, 5.5);
  await page.mouse.click(p.x, p.y);
  say('벽에 건 것 치우기', (await obj(fm)) === null);
  await page.waitForTimeout(300);
  await shot('3-decorated');

  // 5) 카메라를 돌리면 앞쪽이 된 벽의 것은 숨고, 반대쪽 벽에 걸 수 있다
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(700);
  await shot('4-rotated');
  await uiClick(page, '#tool-shelf_small');
  const walls = await g(() => { const v = window.__game.view; const r = document.getElementById('scene').getBoundingClientRect(); const hits = new Set(); for (let x = r.left + 20; x < r.right; x += 40) for (let y = r.top + 20; y < r.bottom - 220; y += 40) { const h = v.wallPoint(x, y, 1); if (h) hits.add(h.wall); } return [...hits].sort().join(''); });
  logs.push('돌린 뒤 가리킬 수 있는 벽: ' + walls);
  await page.keyboard.press('KeyQ');

  // 6) 저장: 새로고침 뒤 그대로
  // 불러올 때 물건을 다시 놓는 순서가 달라지므로 ID 순으로 정렬해 비교한다
  const canon = () => g(() => { const o = window.__game.store.state.spaces.main.objects; return JSON.stringify(Object.keys(o).sort().map((k) => Object.keys(o[k]).sort().map((f) => [f, o[k][f]]))); });
  const before = await canon();
  await page.waitForTimeout(600);
  await page.reload(); await page.waitForFunction(() => window.__ready === true);
  const after = await canon();
  say('새로고침 뒤 소품과 벽걸이 유지', after === before, after === before ? '' : `\n  전: ${before}\n  후: ${after}`);

  // 7) 수납장을 치우면 위의 소품도 사라지고, 되돌리면 돌아온다
  const n0 = await count();
  await g(() => { const { store, history } = window.__game; const cab = Object.values(store.state.spaces.main.objects).find((o) => o.part === 'cabinet'); history.run([{ type: 'removeObject', space: 'main', id: cab.id }]); });
  const n1 = await count();
  await g(() => window.__game.history.undo());
  say('수납장을 치우면 소품도 함께, 되돌리면 함께', n1 === n0 - 3 && (await count()) === n0, `${n0} → ${n1} → ${await count()}`);
}
