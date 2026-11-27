// 5단계 작은 만들기(2026-11-26 사용자 결정)의 확인: 화환을 만들어 방의 벽에 걸고, 다시 고친다.
//   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/wreath.mjs
// 1. 방 → 꾸미기 → 벽걸이 탭의 "화환"을 누르면 만들기 창이 뜬다. 칸 여섯은 손가락으로 누를 만큼 크다
// 2. 그만두면 아무것도 바뀌지 않는다
// 3. 재료를 고르고 칸을 눌러 모양을 만들고, 리본을 고른다. "다 됐어요" 뒤 벽을 누르면 그 모양으로 걸린다
// 4. 새로 열어도 모양이 그대로다(저장 3판)
// 5. 걸린 화환을 집으면 "모양 고치기"가 나온다. 고치면 setLook 하나로 남고 되돌리기가 된다. 그만두면 그대로다
// 6. 360×640 에서도 만들기 창이 화면 안에 들어오고, 칸이 44px 넘는다
import { uiClick } from './helpers/menu.mjs';
export default async function wreathTour(page, { out, logs }) {
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const cdp = await page.context().newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const frames = (n) => g((k) => new Promise((done) => { let i = 0; const step = () => (++i >= k ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
  // 세계 좌표의 화면 자리. 카메라가 멈춘 뒤에 잰다
  const screenOf = (x, y, z) => g(([a, b, c]) => {
    const { view } = window.__game;
    const v = new view.scene.position.constructor(a, b, c).project(view.camera);
    const r = document.getElementById('scene').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }, [x, y, z]);
  const settled = async (x, y, z) => {
    let p = await screenOf(x, y, z);
    for (let i = 0; i < 40; i++) {
      await frames(4);
      const q = await screenOf(x, y, z);
      const still = Math.hypot(q.x - p.x, q.y - p.y) < 0.5;
      p = q;
      if (still) break;
    }
    return p;
  };
  const wreaths = () => g(() => Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'wreath').map((o) => ({ id: o.id, wall: o.wall, i: o.i, look: o.look })));
  const composer = () => g(() => ({ open: window.__game.wreathUI.isOpen, look: window.__game.wreathUI.look, title: document.getElementById('wreath-title').textContent }));
  const click = (sel) => uiClick(page, sel); // 꾸미기 목록 안의 버튼은 목록을 연 뒤에 누른다(6단계 HUD B)

  // 1. 방으로 들어가 꾸미기 → 벽걸이
  await click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'main', null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await click('#mode-build');
  await click('#tab-wall');
  const tile = await g(() => { const b = document.getElementById('tool-wreath'); return b ? { label: b.querySelector('.tool-label').textContent, img: !!b.querySelector('img'), hidden: !!b.closest('.tool-group')?.hidden } : null; });
  say('벽걸이 탭에 화환이 그림과 함께 있다', tile && tile.label === '화환' && tile.img && !tile.hidden, JSON.stringify(tile));
  await click('#tool-wreath');
  const first = await composer();
  const slots = await g(() => [...document.querySelectorAll('.wreath-slot')].map((b) => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), t: Math.round(r.top) }; }));
  say('화환을 누르면 만들기 창이 뜨고, 처음 모양이 보인다', first.open && first.title === '화환 만들기' && JSON.stringify(first.look) === JSON.stringify({ slots: ['pinecone', null, 'feather', null, 'mushroom', null], ribbon: 'red' }), JSON.stringify(first));
  const apart = slots.every((a, i) => slots.every((b, j) => i === j || Math.hypot(a.l - b.l, a.t - b.t) >= 44));
  say('칸 여섯은 44px 넘고 서로 겹치지 않는다', slots.length === 6 && slots.every((s) => s.w >= 44 && s.h >= 44) && apart, JSON.stringify(slots));
  await page.screenshot({ path: `${out}-1-composer.png` });

  // 2. 고치다 그만두면 아무것도 바뀌지 않는다
  await click('[data-fill="feather"]');
  await click('.wreath-slot[data-slot="0"]');
  await click('#wreath-cancel');
  const afterCancel = await g(() => ({ open: window.__game.wreathUI.isOpen, tool: window.__game.input.state.tool, wreaths: Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'wreath').length }));
  say('그만두면 창이 닫히고 도구도 집도 그대로다', !afterCancel.open && afterCancel.tool !== 'wreath' && afterCancel.wreaths === 0, JSON.stringify(afterCancel));

  // 3. 모양 만들기: 깃털·깃털·솔방울·빔·빔·빔, 파랑 리본
  await click('#tool-wreath');
  const reopened = await composer();
  say('그만둔 뒤 다시 열면 처음 모양부터다', reopened.look.slots[0] === 'pinecone', JSON.stringify(reopened.look));
  await click('[data-fill="feather"]');
  await click('.wreath-slot[data-slot="0"]');
  await click('.wreath-slot[data-slot="1"]');
  await click('[data-fill="pinecone"]');
  await click('.wreath-slot[data-slot="2"]');
  await click('[data-fill="none"]');
  await click('.wreath-slot[data-slot="4"]');
  await click('[data-ribbon="blue"]');
  const want = { slots: ['feather', 'feather', 'pinecone', null, null, null], ribbon: 'blue' };
  const made = await composer();
  const pressed = await g(() => ({ fill: document.querySelector('#wreath-fills [aria-pressed="true"]')?.dataset.fill, ribbon: document.querySelector('#wreath-ribbons [aria-pressed="true"]')?.dataset.ribbon, slot0: document.querySelector('.wreath-slot[data-slot="0"]').getAttribute('aria-label') }));
  say('재료를 고르고 칸을 누르면 꽂히고, 빼기로 뺀다. 고른 것은 눌린 모양과 이름으로 알린다',
    JSON.stringify(made.look) === JSON.stringify(want) && pressed.fill === 'none' && pressed.ribbon === 'blue' && pressed.slot0 === '칸 1: 새 깃털', JSON.stringify({ look: made.look, pressed }));
  // 같은 칸을 같은 재료로 다시 누르면 뺀다
  await click('[data-fill="pinecone"]');
  await click('.wreath-slot[data-slot="3"]');
  await click('.wreath-slot[data-slot="3"]');
  say('같은 칸을 같은 재료로 다시 누르면 뺀다', (await composer()).look.slots[3] === null, JSON.stringify((await composer()).look));
  await page.screenshot({ path: `${out}-2-made.png` });
  await click('#wreath-done');
  const ready = await g(() => ({ tool: window.__game.input.state.tool, hint: document.getElementById('hint').textContent, open: window.__game.wreathUI.isOpen }));
  say('"다 됐어요" 뒤에는 그 모양을 들고 벽에 걸 차례다', !ready.open && ready.tool === 'wreath' && ready.hint.includes('화환 버튼을 다시 누르면'), JSON.stringify(ready));
  const wallW1 = await settled(0, 1.9, 1.5); // 서쪽 벽의 1번 칸
  await tap(wallW1.x, wallW1.y);
  await frames(4);
  const hung = await wreaths();
  say('벽을 누르면 그 모양으로 걸린다', hung.length === 1 && hung[0].wall === 'W' && hung[0].i === 1 && JSON.stringify(hung[0].look) === JSON.stringify(want), JSON.stringify(hung));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}-3-hung.png` });

  // 4. 새로 열어도 그대로 (저장 3판)
  await g(() => window.__game.saveNow());
  const saved = await g(() => JSON.parse(localStorage.getItem('house-lab-web:save')));
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const kept = await wreaths();
  say('저장은 3판이고, 새로 열어도 화환의 모양이 그대로다', saved.version === 3 && kept.length === 1 && JSON.stringify(kept[0].look) === JSON.stringify(want), JSON.stringify({ version: saved.version, kept }));

  // 5. 집어서 모양 고치기
  if ((await g(() => window.__game.character.place)) !== 'main') {
    await click('#place-toggle');
    await page.waitForFunction(() => window.__game.character.place === 'main', null, { timeout: 20000 });
    await page.waitForTimeout(500);
  }
  await click('#mode-build');
  await click('#tool-select');
  const onWreath = await settled(0, 1.9, 1.5);
  await tap(onWreath.x, onWreath.y);
  await frames(3);
  const picked = await g(() => ({ carry: window.__game.input.state.carry?.part, edit: !document.getElementById('wreath-edit').hidden, hint: document.getElementById('hint').textContent }));
  say('걸린 화환을 누르면 집어 들고 "모양 고치기"가 나온다(옮기기는 그대로)', picked.carry === 'wreath' && picked.edit && picked.hint.includes('모양 고치기'), JSON.stringify(picked));
  await click('#wreath-edit');
  const editing = await composer();
  const putBack = await g(() => ({ carry: window.__game.input.state.carry, edit: !document.getElementById('wreath-edit').hidden }));
  say('"모양 고치기"를 누르면 화환은 제자리에 두고 지금 모양으로 창이 열린다', editing.open && editing.title === '화환 고치기' && JSON.stringify(editing.look) === JSON.stringify(want) && !putBack.carry && !putBack.edit, JSON.stringify({ editing, putBack }));
  await click('[data-ribbon="none"]');
  await click('#wreath-done');
  await frames(3);
  const changed = (await wreaths())[0];
  say('고친 모양이 바로 걸린 화환에 든다', changed.look.ribbon === null && changed.look.slots.join() === want.slots.join(), JSON.stringify(changed.look));
  await click('#undo');
  await frames(3);
  const undone = (await wreaths())[0];
  say('되돌리면 고치기 전 모양으로 돌아온다', undone.look.ribbon === 'blue', JSON.stringify(undone.look));
  // 고치다 그만두면 그대로이고, 되돌리기 기록도 늘지 않는다
  await tap(onWreath.x, onWreath.y);
  await frames(3);
  await click('#wreath-edit');
  await click('[data-fill="mushroom"]');
  await click('.wreath-slot[data-slot="5"]');
  await click('#wreath-cancel');
  await frames(3);
  const still = (await wreaths())[0];
  const redo = await g(() => !document.getElementById('redo').disabled);
  say('고치다 그만두면 모양도 되돌리기 기록도 그대로다', JSON.stringify(still.look) === JSON.stringify(want) && redo, JSON.stringify({ look: still.look, redo }));

  // 6. 360×640 에서 만들기 창
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(400);
  await click('#tab-wall');
  await click('#tool-wreath');
  const small = await g(() => {
    const p = document.querySelector('.wreath-panel').getBoundingClientRect();
    const slots = [...document.querySelectorAll('.wreath-slot')].map((b) => b.getBoundingClientRect());
    const done = document.getElementById('wreath-done').getBoundingClientRect();
    return { panel: [Math.round(p.left), Math.round(p.top), Math.round(p.right), Math.round(p.bottom)], vw: innerWidth, vh: innerHeight, slotMin: Math.round(Math.min(...slots.map((r) => Math.min(r.width, r.height)))), done: Math.round(done.bottom), scroll: document.querySelector('.wreath-panel').scrollHeight > document.querySelector('.wreath-panel').clientHeight + 1 };
  });
  say('360×640 에서도 만들기 창이 화면 안에 들어오고 칸이 44px 넘는다',
    small.panel[0] >= 0 && small.panel[1] >= 0 && small.panel[2] <= small.vw && small.panel[3] <= small.vh && small.slotMin >= 44 && small.done <= small.vh && !small.scroll, JSON.stringify(small));
  await page.screenshot({ path: `${out}-4-small.png` });
  await click('#wreath-cancel');
}
