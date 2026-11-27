// 6단계 HUD A: 위쪽 한 줄, ☰ 메뉴, 처음 몇 번만 보이는 걷기 안내, 어디서나 여는 수첩, 저장 경고 줄.
// 흉내 낸 입력이며 실제 휴대폰 확인을 대신하지 않는다.
//   TOUCH=1 node tools/shot.mjs / shots/hud 360 640 test/hud.mjs
import { menuClick, openMenu } from './helpers/menu.mjs';

export default async function hud(page, { out, logs }) {
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
  // 위쪽 줄: 보이는 버튼의 윗변이 모두 같은가(한 줄인가), 모두 44px 이상인가
  const topRow = () => g(() => {
    const rects = [...document.querySelectorAll('.top > .place-group > button, .top > .cam > button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
    const tops = rects.map((r) => Math.round(r.top));
    return { count: rects.length, rows: new Set(tops).size, minH: Math.min(...rects.map((r) => r.height)), minW: Math.min(...rects.map((r) => r.width)), right: Math.max(...rects.map((r) => r.right)), width: innerWidth };
  });
  // 가려지지 않는 화면 높이 비율: 위쪽 묶음 아래끝과 쟁반 위끝 사이. 안내가 떠 있으면 안내 위끝까지를 따로 잰다
  const visible = () => g(() => {
    const H = innerHeight;
    const top = document.querySelector('.top').getBoundingClientRect().bottom;
    const dock = document.querySelector('.dock').getBoundingClientRect().top;
    const hint = document.getElementById('hint');
    const upto = hint.hidden ? dock : hint.getBoundingClientRect().top;
    return { dock: (dock - top) / H, hint: (Math.min(upto, dock) - top) / H, hintShown: !hint.hidden };
  });
  const hintNow = () => g(() => ({ shown: !document.getElementById('hint').hidden, text: document.getElementById('hint').textContent }));

  await page.waitForTimeout(300);
  const home = await g(() => ({ x: window.__game.character.pos.x, z: window.__game.character.pos.z })); // 물가에서 먼 처음 자리
  // 1) 위쪽 한 줄 (360px)
  const row360 = await topRow();
  say('360px: 위쪽 버튼이 한 줄이고 모두 44px 이상이다', row360.rows === 1 && row360.minH >= 44 && row360.minW >= 44 && row360.right <= row360.width, JSON.stringify(row360));
  const place = await g(() => ({ now: document.getElementById('place-name').textContent, go: document.getElementById('place-go').textContent, label: document.getElementById('place-toggle').getAttribute('aria-label'), chip: document.getElementById('save-chip').textContent }));
  say('있는 곳 버튼이 지금 있는 곳과 누르면 갈 곳을 보이고, 읽어 주는 이름도 그렇다', place.now === '마당' && place.go.startsWith('집 안으로') && place.label.includes('집 안으로') && place.label.includes('마당'), JSON.stringify(place));
  say('평소 저장 상태는 위쪽 줄에 짧게 보인다', place.chip === '저장됨', place.chip);

  // 2) 처음 접속: 걷기 안내가 보이고 한 번 센다
  const first = await hintNow();
  const counted = await g(() => window.__game.hintMemory.counts);
  say('처음 접속에는 걷기 안내가 보인다', first.shown && first.text.includes('땅을 누르면'), JSON.stringify(first));
  say('걷기 안내가 나온 접속을 센다(집 저장과 따로)', counted.walkYard === 1, JSON.stringify(counted));
  const v1 = await visible();
  logs.push(`정보  360×640 처음 접속, 첫 걸음 전 걷기 화면 높이: 쟁반까지 ${Math.round(v1.dock * 100)}%, 안내까지 ${Math.round(v1.hint * 100)}% (75%에 못 미침)`);
  await page.screenshot({ path: `${out}-1-walk.png` });
  // 땅을 눌러 한 번 걸어 보면 이번 접속에서는 걷기 안내를 접는다(GPT 검토 PR #49)
  const step = await g((h) => window.__game.view.screenPoint(h.x - 1, h.z + 2), home);
  await tap(step.x, step.y);
  await frames(3);
  const folded = await hintNow();
  const v1b = await visible();
  say('처음 접속에도 한 번 걸어 보면 걷기 안내를 접어 75% 이상이 보인다', !folded.shown && v1b.hint >= 0.75, JSON.stringify({ folded, v1b }));
  await page.waitForFunction(() => !window.__game.character.walking, null, { timeout: 15000 }).catch(() => {});
  await g((h) => { window.__game.character.teleport(h.x, h.z); window.__game.view.snapFocus(h.x, h.z); }, home);
  await frames(3);

  // 3) ☰ 메뉴: 열고, 바깥(땅)을 눌러 닫는다. 그 누름으로 걷지 않는다
  await page.click('#menu-toggle');
  const opened = await g(() => ({ menu: !document.getElementById('menu').hidden, expanded: document.getElementById('menu-toggle').getAttribute('aria-expanded'), items: [...document.querySelectorAll('#menu button')].filter((b) => b.offsetParent).map((b) => b.id) }));
  say('☰ 를 누르면 메뉴가 열린다(공유·화면 크기·조작법·소리)', opened.menu && opened.expanded === 'true' && ['share-house', 'zoom-out', 'zoom-in', 'help-toggle', 'sound'].every((id) => opened.items.includes(id)), JSON.stringify(opened));
  await page.screenshot({ path: `${out}-2-menu.png` });
  const before = await g(() => ({ x: window.__game.character.pos.x, z: window.__game.character.pos.z }));
  // 메뉴 판 밖의 땅(화면 왼쪽 아래)을 누른다. 덮개가 없었다면 그리로 걸어갔을 자리다
  const ground = await g(() => {
    const m = document.getElementById('menu').getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const p = { x: Math.min(60, m.left - 20), y: Math.min(dock.top - 40, m.bottom + 60) };
    return { ...p, under: document.elementFromPoint(p.x, p.y)?.id };
  });
  await tap(ground.x, ground.y);
  await frames(10);
  const afterTap = await g(() => ({ menu: !document.getElementById('menu').hidden, walking: window.__game.character.walking, x: window.__game.character.pos.x, z: window.__game.character.pos.z }));
  const behind = await g((p) => document.elementFromPoint(p.x, p.y)?.id, ground);
  say('메뉴 바깥을 누르면 메뉴만 닫히고 걷지 않는다', ground.under === 'menu-backdrop' && behind === 'scene' && !afterTap.menu && !afterTap.walking && Math.hypot(afterTap.x - before.x, afterTap.z - before.z) < 0.01, JSON.stringify({ ground, behind, before, afterTap }));
  await page.click('#menu-toggle');
  await page.keyboard.press('Escape');
  say('Esc 로도 메뉴가 닫히고 메뉴 버튼으로 돌아간다', await g(() => document.getElementById('menu').hidden && document.activeElement?.id === 'menu-toggle'));

  // 4) 메뉴 항목이 실제로 동작한다: 화면 크기, 소리
  const span = () => g(() => { const v = window.__game.view; const a = v.screenPoint(30, 30), b = v.screenPoint(34, 30); return Math.hypot(a.x - b.x, a.y - b.y); });
  const s0 = await span();
  await menuClick(page, '#zoom-in');
  await frames(4);
  const s1 = await span();
  const stillOpen = await g(() => !document.getElementById('menu').hidden);
  await menuClick(page, '#zoom-out');
  await frames(4);
  say('메뉴의 화면 크기 단추로 확대하고, 메뉴는 이어서 누를 수 있게 열려 있다', s1 > s0 * 1.1 && stillOpen, JSON.stringify({ s0, s1, stillOpen }));
  await menuClick(page, '#sound');
  const muted = await g(() => ({ text: document.getElementById('sound').textContent, pressed: document.getElementById('sound').getAttribute('aria-pressed') }));
  await menuClick(page, '#sound');
  say('메뉴의 소리 단추가 켜고 끈다', muted.text === '소리 꺼짐' && muted.pressed === 'false' && await g(() => document.getElementById('sound').textContent === '소리 켜짐'), JSON.stringify(muted));
  await page.click('#menu-toggle');

  // 5) 수첩: 걷기에서 한 번에 연다. 처음에는 가진 것 칸
  await page.click('#fish-log');
  const j1 = await g(() => ({ open: !document.getElementById('fish-layer').hidden, title: document.getElementById('fish-title').textContent, owned: !document.getElementById('log-owned').hidden, summary: document.getElementById('owned-summary').textContent }));
  say('걷기에서 수첩을 한 번 누르면 열리고 가진 것 칸이 먼저 보인다', j1.open && j1.title === '수첩' && j1.owned && j1.summary.includes('아직 가진 것이 없습니다'), JSON.stringify(j1));
  await page.click('#fish-close');

  // 6) 꾸미기에서도 연다. 닫으면 고른 도구와 모드가 그대로다
  await page.click('#mode-build');
  await page.click('#tool-stool');
  await page.click('#fish-log');
  const j2 = await g(() => !document.getElementById('fish-layer').hidden);
  await page.screenshot({ path: `${out}-3-journal-build.png` });
  await page.keyboard.press('Escape');
  const kept = await g(() => ({ open: !document.getElementById('fish-layer').hidden, mode: window.__game.input.state.mode, tool: window.__game.input.state.tool }));
  say('꾸미기 중에도 수첩이 열리고, 닫으면 꾸미던 도구가 그대로다', j2 && !kept.open && kept.mode === 'build' && kept.tool === 'stool', JSON.stringify({ j2, kept }));
  await page.click('#mode-walk');

  // 7) 낚시하는 동안 수첩은 흐리게 두고, 누르면 왜 안 되는지 알린다
  await g(() => { window.__game.character.teleport(24.5, 18.5); window.__game.view.snapFocus(24.5, 18.5); });
  await frames(3);
  const nearHint = await hintNow();
  // 이 환경은 게임 시계가 느려 낚시 단계가 언제 넘어갈지 실제 시간으로 맞출 수 없다. 던진 직후 같은 순간에 누르고 읽는다
  const { lock, locked } = await g(() => {
    window.__game.fishing.start({ x: 26.5, z: 18.5 });
    const button = document.getElementById('fish-log');
    const lock = { phase: window.__game.fishing.phase, disabled: button.getAttribute('aria-disabled') };
    button.click();
    const locked = { open: !document.getElementById('fish-layer').hidden, toast: document.getElementById('toast').textContent, phase: window.__game.fishing.phase };
    return { lock, locked };
  });
  say('낚시하는 동안 수첩은 흐리게 보이고, 눌러도 열리지 않고 이유를 알린다', lock.phase !== 'idle' && lock.disabled === 'true' && !locked.open && locked.toast.includes('낚시가 끝나면') && locked.phase !== 'idle', JSON.stringify({ lock, locked }));
  await g(() => window.__game.fishing.cancel());
  await frames(2);
  say('낚시를 그만두면 수첩을 다시 열 수 있다', await g(() => document.getElementById('fish-log').getAttribute('aria-disabled') === 'false'));
  say('물가의 낚시 안내는 처음 접속이 아니어도 늘 보인다(이번에는 처음 접속)', nearHint.shown && nearHint.text.includes('물을 누르면'), JSON.stringify(nearHint));

  // 8) 저장이 멈추면 전체 문구가 둘째 줄에 숨김 없이 보인다
  await g(() => window.__game.ui.setSaveStatus('conflict'));
  const warn = await g(() => { const s = document.getElementById('save-status'); const r = s.getBoundingClientRect(); return { text: s.textContent, h: r.height, w: r.width, chip: document.getElementById('save-chip').textContent, top: document.querySelector('.place-group').getBoundingClientRect().bottom, at: r.top }; });
  const warnRow = await topRow();
  await page.screenshot({ path: `${out}-4-warn.png` });
  await g(() => window.__game.ui.setSaveStatus('saved'));
  const calm = await g(() => document.getElementById('save-status').getBoundingClientRect().height);
  say('저장이 멈추면 경고 문구가 위쪽 줄 아래에 보이고, 평소에는 보이지 않는다', warn.text.includes('다른 탭') && warn.h >= 20 && warn.w > 200 && warn.at >= warn.top && warn.chip === '저장 멈춤' && calm <= 1, JSON.stringify({ warn, calm }));
  say('저장 경고가 떠도 위쪽 버튼은 한 줄을 지킨다', warnRow.rows === 1 && warnRow.right <= warnRow.width, JSON.stringify(warnRow));

  // 9) 있는 곳 버튼으로 방에 들어간다
  await g((h) => { window.__game.character.teleport(h.x, h.z); window.__game.view.snapFocus(h.x, h.z); }, home);
  await page.click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'main', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const room = await g(() => ({ place: window.__game.character.place, now: document.getElementById('place-name').textContent, go: document.getElementById('place-go').textContent }));
  say('있는 곳 버튼을 누르면 방으로 들어가고, 버튼이 방과 밖으로를 보인다', room.place === 'main' && room.now.endsWith('방') && room.go.startsWith('밖으로'), JSON.stringify(room));

  // 10) 320px 에서도 위쪽은 한 줄이다
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(400);
  const row320 = await topRow();
  say('320px: 위쪽 버튼이 한 줄이고 화면 밖으로 넘치지 않는다', row320.rows === 1 && row320.minH >= 44 && row320.right <= row320.width, JSON.stringify(row320));
  await g(() => window.__game.ui.setSaveStatus('held'));
  const warn320 = await topRow();
  const held320 = await g(() => document.getElementById('save-status').getBoundingClientRect().height);
  await page.screenshot({ path: `${out}-5-320-warn.png` });
  await g(() => window.__game.ui.setSaveStatus('saved'));
  say('320px: 저장 경고가 떠도 위쪽 버튼은 한 줄이고, 경고 문구는 보인다', warn320.rows === 1 && warn320.right <= warn320.width && held320 >= 20, JSON.stringify({ warn320, held320 }));
  await page.screenshot({ path: `${out}-5-320.png` });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.waitForTimeout(300);

  // 11) 걷기 안내가 세 번의 접속에 나왔으면, 다음 접속부터는 감춘다. 화면이 더 넓게 보인다
  await g(() => localStorage.setItem('maeul.hints', JSON.stringify({ walkYard: 3, walkRoom: 3, seated: 3 })));
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  await g(() => { if (window.__game.character.place !== 'yard') window.__game.travel.toggle(); });
  await page.waitForTimeout(600);
  const later = await hintNow();
  const v2 = await visible();
  say('네 번째 접속부터는 걷기 안내를 감춘다', !later.shown, JSON.stringify(later));
  say('360×640 걷기에서 화면 높이의 75% 이상이 가려지지 않는다(안내를 감춘 뒤)', v2.dock >= 0.75 && v2.hint >= 0.75, JSON.stringify(v2));
  await page.screenshot({ path: `${out}-6-learned.png` });
  await g(() => { window.__game.character.teleport(24.5, 18.5); window.__game.view.snapFocus(24.5, 18.5); });
  await frames(3);
  const fishHint = await hintNow();
  say('걷기 안내를 감춘 뒤에도 물가의 낚시 안내는 보인다', fishHint.shown && fishHint.text.includes('물을 누르면'), JSON.stringify(fishHint));
  await g((h) => { window.__game.character.teleport(h.x, h.z); window.__game.view.snapFocus(h.x, h.z); }, home);
  await frames(3);

  // 12) 조작법의 "처음 안내 다시 보기"로 다시 보인다
  await openMenu(page);
  await page.click('#help-toggle');
  await page.click('#hints-again');
  await frames(3);
  const again = await hintNow();
  say('"처음 안내 다시 보기"를 누르면 걷기 안내가 다시 보인다', again.shown && again.text.includes('땅을 누르면'), JSON.stringify(again));
}
