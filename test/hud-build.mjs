// 6단계 HUD B: 꾸미기 하단 시트(목록), 같은 높이의 아래 막대, 이어 놓기와 완료.
// 흉내 낸 입력이며 실제 휴대폰 확인을 대신하지 않는다.
//   TOUCH=1 node tools/shot.mjs / shots/hud-build 360 640 test/hud-build.mjs
import { openMenu, closeMenu } from './helpers/menu.mjs';

export default async function hudBuild(page, { out, logs }) {
  const cdp = process.env.TOUCH === '1' ? await page.context().newCDPSession(page) : null;
  const tap = async (x, y) => {
    if (cdp) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.mouse.click(x, y);
    await page.waitForTimeout(80);
  };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const say = (name, ok, details = '') => logs.push(`${ok ? '통과' : '실패'}  ${name} ${details}`);
  const frames = (n) => g((k) => new Promise((done) => { let i = 0; const step = () => (++i >= k ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
  const tapEl = async (sel) => { const b = await page.locator(sel).boundingBox(); await tap(b.x + b.width / 2, b.y + b.height / 2); };
  // 같은 3D 지점이 화면의 어디인지. 카메라가 멈춘 뒤에 잰다
  const P = [14, 14];
  const spot = async () => {
    let p = await g((q) => window.__game.view.screenPoint(q[0], q[1]), P);
    for (let i = 0; i < 30; i++) {
      await frames(3);
      const q = await g((r) => window.__game.view.screenPoint(r[0], r[1]), P);
      const still = Math.hypot(q.x - p.x, q.y - p.y) < 0.2;
      p = q;
      if (still) break;
    }
    return p;
  };
  const drift = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const bar = () => g(() => {
    const d = document.querySelector('.dock');
    return {
      h: Math.round(d.getBoundingClientRect().height),
      buttons: [...d.querySelectorAll('.bar-btn')].filter((b) => !b.hidden).map((b) => b.id),
      minW: Math.min(...[...d.querySelectorAll('.bar-btn')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect().width)),
      overflow: d.scrollWidth > d.clientWidth + 1,
    };
  });
  const sheet = () => g(() => ({ open: !document.getElementById('sheet').hidden, backdrop: !document.getElementById('sheet-backdrop').hidden, expanded: document.getElementById('open-catalog').getAttribute('aria-expanded') }));
  const stools = () => g(() => Object.values(window.__game.store.state.spaces.yard.objects).filter((o) => o.part === 'stool').length);
  const mode = () => g(() => ({ mode: window.__game.input.state.mode, tool: window.__game.input.state.tool }));

  await page.waitForTimeout(400);
  // 1) 걷기 막대
  const p0 = await spot();
  const walkBar = await bar();
  say('걷기 막대는 [꾸미기][수첩] 한 줄이다', walkBar.buttons.join() === 'mode-build,fish-log' && !walkBar.overflow, JSON.stringify(walkBar));

  // 2) 꾸미기를 누르면 목록이 열린다. 3D 화면은 움직이지 않는다
  await page.click('#mode-build');
  const s1 = await sheet();
  const p1 = await spot();
  const catBar = await bar();
  const hint1 = await g(() => document.getElementById('hint').hidden);
  say('꾸미기를 누르면 목록이 막대 위에 열리고, 그동안 안내는 감춘다', s1.open && s1.backdrop && s1.expanded === 'true' && hint1, JSON.stringify({ s1, hint1 }));
  say('목록을 열어도 같은 지점이 화면에서 2px 넘게 움직이지 않고 막대 높이가 같다', drift(p0, p1) <= 2 && catBar.h === walkBar.h, JSON.stringify({ p0, p1, walkH: walkBar.h, catH: catBar.h }));
  await page.screenshot({ path: `${out}-1-catalog.png` });

  // 3) 목록 바깥(3D 화면)을 누르면 목록만 접힌다. 걷거나 놓지 않는다
  const before = { stools: await stools(), pos: await g(() => ({ ...window.__game.character.pos })) };
  const outside = await g(() => { const top = document.querySelector('.top').getBoundingClientRect().bottom; const sh = document.getElementById('sheet').getBoundingClientRect().top; const p = { x: 60, y: (top + sh) / 2 }; return { ...p, under: document.elementFromPoint(p.x, p.y)?.id }; });
  await tap(outside.x, outside.y);
  await frames(6);
  const after = { sheet: await sheet(), stools: await stools(), pos: await g(() => ({ ...window.__game.character.pos })), mode: await mode() };
  say('목록 바깥을 누르면 목록만 접히고 아무것도 놓거나 걷지 않는다', outside.under === 'sheet-backdrop' && !after.sheet.open && after.stools === before.stools && after.mode.mode === 'build' && Math.hypot(after.pos.x - before.pos.x, after.pos.z - before.pos.z) < 0.01, JSON.stringify({ outside, after }));

  // 4) 고른 것 버튼으로 다시 열고 스툴을 고른다 → 목록이 접히고 놓을 차례
  await tapEl('#open-catalog');
  const reopened = (await sheet()).open;
  await tapEl('#tool-stool');
  const placingBar = await bar();
  const chip = await g(() => document.getElementById('catalog-label').textContent);
  const p2 = await spot();
  say('고른 것 버튼으로 목록을 다시 열고, 스툴을 고르면 목록이 접힌다', reopened && !(await sheet()).open && (await mode()).tool === 'stool', JSON.stringify(await mode()));
  say('놓는 막대는 [스툴▴][돌리기][되돌리기][수첩][완료] 한 줄이고 높이가 같다', placingBar.buttons.join() === 'open-catalog,rotate-part,undo,fish-log,mode-walk' && chip === '스툴' && placingBar.h === walkBar.h && !placingBar.overflow && placingBar.minW >= 44, JSON.stringify({ placingBar, chip }));
  say('놓는 막대로 바뀌어도 같은 지점이 2px 넘게 움직이지 않는다', drift(p0, p2) <= 2, JSON.stringify({ p0, p2 }));
  await page.screenshot({ path: `${out}-2-placing.png` });

  // 5) 이어 놓기: 스툴 셋을 차례로 놓는다. 도구는 그대로 스툴이다
  const start = await stools();
  const cells = [[9.5, 15.5], [11.5, 15.5], [13.5, 15.5], [9.5, 17.5], [11.5, 17.5], [13.5, 17.5]];
  for (const [x, z] of cells) {
    if ((await stools()) - start >= 3) break;
    const p = await g((c) => window.__game.view.screenPoint(c[0], c[1]), [x, z]);
    await tap(p.x, p.y);
    await frames(4);
  }
  const three = await stools();
  say('스툴 셋을 이어서 놓는다(고를 때마다 목록을 다시 열지 않는다)', three - start === 3 && (await mode()).tool === 'stool', JSON.stringify({ start, three, tool: (await mode()).tool }));
  await tapEl('#undo');
  const two = await stools();
  say('되돌리기 한 번으로 마지막 하나만 치운다', two === three - 1, JSON.stringify({ three, two }));
  await page.screenshot({ path: `${out}-3-three.png` });

  // 6) 꾸미는 중에만 ☰ 에 다시 하기·가구 치우기·처음 배치로가 있다
  await openMenu(page);
  const buildMenu = await g(() => ['redo', 'clear-all', 'sample'].map((id) => !!document.getElementById(id).offsetParent));
  await closeMenu(page);

  // 7) 완료 한 번으로 걷기로 돌아간다. 3D 화면은 그대로다
  await tapEl('#mode-walk');
  const done = { mode: await mode(), bar: await bar(), p: await spot(), stools: await stools() };
  say('완료 한 번으로 걷기로 돌아가고, 놓은 것은 남는다', done.mode.mode === 'walk' && done.bar.buttons.join() === 'mode-build,fish-log' && done.stools === two, JSON.stringify(done));
  say('완료 뒤에도 같은 지점이 2px 넘게 움직이지 않는다', drift(p0, done.p) <= 2, JSON.stringify({ p0, p: done.p }));
  await openMenu(page);
  const walkMenu = await g(() => ['redo', 'clear-all', 'sample'].map((id) => !!document.getElementById(id).offsetParent));
  await closeMenu(page);
  say('다시 하기·가구 치우기·처음 배치로는 꾸미는 중에만 메뉴에 있다', buildMenu.every(Boolean) && !walkMenu.some(Boolean), JSON.stringify({ buildMenu, walkMenu }));

  // 8) 옮기기: 놓은 스툴을 집으면 막대가 [그만두기][돌리기][되돌리기][완료] 로 바뀐다(수첩과 고른 것은 감춘다)
  await page.click('#mode-build');
  await tapEl('#tool-select');
  const pSelect = await spot();
  const placed = await g(() => Object.values(window.__game.store.state.spaces.yard.objects).find((o) => o.part === 'stool' && o.y === 15));
  const at = await g((o) => window.__game.view.screenPoint(o.x + 0.5, o.y + 0.5), placed);
  await tap(at.x, at.y);
  await frames(4);
  const carryBar = await bar();
  const carrying = await g(() => window.__game.input.state.carry?.part);
  const pCarry = await spot();
  // 들고 있을 때는 완료를 감춘다(옮기기를 마치는 것인지 꾸미기를 끝내는 것인지 헷갈리지 않게, GPT 글 7211434874)
  say('놓인 것을 집으면 막대가 [그만두기][돌리기][되돌리기] 로 바뀐다(완료는 감춤)', carrying === 'stool' && carryBar.buttons.join() === 'cancel-carry,rotate-part,undo' && carryBar.h === walkBar.h, JSON.stringify({ carrying, carryBar }));
  say('옮기기를 고르거나 집어 들어도 같은 지점이 2px 넘게 움직이지 않는다', drift(p0, pSelect) <= 2 && drift(p0, pCarry) <= 2, JSON.stringify({ p0, pSelect, pCarry }));
  await page.screenshot({ path: `${out}-4-carry.png` });
  await tapEl('#cancel-carry');
  const back = await g((o) => { const n = window.__game.store.state.spaces.yard.objects[o.id]; return n && { x: n.x, y: n.y, rot: n.rot }; }, placed);
  say('그만두기를 누르면 들고 있던 것은 제자리에 남고, 고른 것 버튼과 완료가 돌아온다', !(await g(() => window.__game.input.state.carry)) && back && back.x === placed.x && back.y === placed.y && back.rot === placed.rot && (await bar()).buttons.join() === 'open-catalog,undo,fish-log,mode-walk', JSON.stringify({ back, bar: (await bar()).buttons }));

  // 9) Esc 로 목록을 접는다
  await tapEl('#open-catalog');
  await page.keyboard.press('Escape');
  const esc = { sheet: await sheet(), mode: await mode(), focus: await g(() => document.activeElement?.id) };
  say('Esc 는 목록만 접고 꾸미기는 그대로다', !esc.sheet.open && esc.mode.mode === 'build' && esc.focus === 'open-catalog', JSON.stringify(esc));

  // 10) 320px: 꾸미기 막대가 한 줄에 들고 걷기와 높이가 같다
  await tapEl('#tool-stool').catch(() => {});
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(300);
  await tapEl('#open-catalog');
  await tapEl('#tool-stool');
  const narrow = await bar();
  await page.screenshot({ path: `${out}-5-320.png` });
  await tapEl('#mode-walk');
  const narrowWalk = await bar();
  say('320px: 꾸미기 막대가 넘치지 않고, 버튼은 44px 이상이며 걷기 막대와 높이가 같다', !narrow.overflow && narrow.minW >= 44 && narrow.h === narrowWalk.h && narrow.buttons.length === 5, JSON.stringify({ narrow, narrowWalk }));
}
