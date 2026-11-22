// 자동 둘러보기 (마우스): 드나들기, 가구 놓기, 바닥재와 벽지, 겉모습, 집 키우기, 되돌리기, 저장
export default async function tour(page, { out, logs }) {
  const shot = (name) => page.screenshot({ path: `${out}-${name}.png` });
  const at = (x, z) => page.evaluate(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
  const click = async (x, z) => { const p = await at(x, z); await page.mouse.click(p.x, p.y); };
  const g = (fn) => page.evaluate(fn);
  const info = () => g(() => { const { store, character } = window.__game; const s = store.state; return `${character.place} 단계${s.house.level} 방가구${Object.keys(s.spaces.main.objects).length} 마당가구${Object.keys(s.spaces.yard.objects).length} ${s.spaces.main.floor}/${s.spaces.main.wall} ${s.house.roof}/${s.house.siding}/${s.house.door}`; });
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  // 마당과 방 사이를 옮겨 갔는지 기다린다. 느린 CI 에서는 8초로 모자랄 때가 있었다(2026-11-22 흔들림 고침).
  // 그래도 옮겨 가지 못하면 그냥 지나가지 않고, 그때의 상태와 함께 실패로 적는다
  const waitPlace = async (place) => {
    const ok = await page.waitForFunction((p) => window.__game.character.place === p, place, { timeout: 25000 }).then(() => true).catch(() => false);
    if (ok) { await page.waitForTimeout(350); return true; }
    const st = await page.evaluate(() => {
      const { character, input } = window.__game;
      return { place: character.place, mode: input.state.mode, pos: { ...character.pos }, walking: character.walking, fading: document.getElementById('scene').classList.contains('fading') };
    });
    logs.push(`실패  ${place}(으)로 옮겨 가지 않았다(25초) ${JSON.stringify(st)}`);
    return false;
  };
  const reload = async () => { await page.reload(); await page.waitForFunction(() => window.__ready === true); await page.waitForTimeout(300); };

  await page.waitForTimeout(400);
  logs.push('처음: ' + await info());

  // 1) 집을 눌러 걸어 들어간다
  const door = await g(() => { const v = window.__game.view; return v.screenPoint(12, 8.4); });
  await page.mouse.click(door.x, door.y - 40);
  await waitPlace('main');
  say('집을 눌러 들어가기', (await g(() => window.__game.character.place)) === 'main');

  // 2) 방에서 가구 놓기, 돌리기, 옮기기
  await page.keyboard.press('KeyB');
  await page.click('#tool-stool');
  // 기본 의자가 (4,4)를 차지하므로, 탁자 오른쪽 빈 칸에서 놓기 시험을 한다.
  await click(5.5, 4.5);
  const stool = () => g(() => Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'stool').map((o) => [o.x, o.y, o.rot]));
  say('방에 스툴 놓기', JSON.stringify(await stool()) === '[[5,4,0]]', JSON.stringify(await stool()));
  await page.click('#tool-select');
  await click(5.5, 4.5);
  await page.keyboard.press('KeyR');
  await click(0.5, 4.5);
  say('집어서 돌려 옮기기', JSON.stringify(await stool()) === '[[0,4,1]]', JSON.stringify(await stool()));
  await page.click('#tool-bed');
  await click(1, 1.5);
  say('겹치는 자리에는 놓이지 않음', (await g(() => Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'bed').length)) === 1, await g(() => document.getElementById('toast').textContent));
  await page.click('#tool-chair');
  await click(2.5, 5.5);
  say('현관 깔개에는 놓이지 않음', (await g(() => Object.values(window.__game.store.state.spaces.main.objects).filter((o) => o.part === 'chair').length)) === 2, await g(() => document.getElementById('toast').textContent));

  // 3) 바닥재와 벽지
  await page.click('#tab-style');
  await page.click('#floor-checker');
  await page.click('#wall-sky');
  say('바닥재와 벽지 고르기', (await g(() => window.__game.store.state.spaces.main.floor + '/' + window.__game.store.state.spaces.main.wall)) === 'checker/sky');
  await page.waitForTimeout(300);
  await shot('1-room-style');
  await page.keyboard.press('Control+KeyZ');
  say('벽지 되돌리기', (await g(() => window.__game.store.state.spaces.main.wall)) === 'sage');

  // 4) 현관 깔개를 눌러 나간다
  await page.keyboard.press('KeyB');
  await click(3, 5.5);
  await waitPlace('yard');
  say('깔개를 눌러 나가기', (await g(() => window.__game.character.place)) === 'yard');

  // 5) 마당: 겉모습 바꾸기, 가구 놓기, 집 키우기
  await page.keyboard.press('KeyB');
  await page.click('#tab-style');
  await page.click('#roof-slate');
  await page.click('#siding-sky');
  await page.click('#door-red');
  say('지붕, 외벽, 문 색 고르기', (await info()).endsWith('slate/sky/red'), await info());
  await page.click('#tab-furniture');
  await page.click('#tool-plant');
  await click(8.5, 7.5); // 집이 커지면 덮일 자리 (1단계 집은 x 9~14, 2단계 집은 x 8~15)
  await page.click('#tab-style');
  await page.click('#upgrade');
  say('커질 자리에 물건이 있으면 키우지 않음', (await g(() => window.__game.store.state.house.level)) === 1, await g(() => document.getElementById('toast').textContent));
  await page.keyboard.press('Control+KeyZ'); // 화분 놓기를 되돌린다
  await page.click('#upgrade');
  say('집 키우기', (await g(() => window.__game.store.state.house.level)) === 2);
  await page.waitForTimeout(400);
  await shot('2-yard-level2');
  await page.click('#upgrade');
  await page.waitForTimeout(400);
  await shot('3-yard-level3');
  say('세 단계까지 키움, 버튼 꺼짐', (await g(() => window.__game.store.state.house.level)) === 3 && await g(() => document.getElementById('upgrade').disabled));

  // 6) 큰 집의 방
  await page.keyboard.press('KeyB');
  await page.click('#place-toggle');
  await waitPlace('main');
  await shot('4-room-level3');
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(700);
  await shot('5-room-rotated');
  await page.keyboard.press('KeyQ');

  // 7) 저장: 새로고침 뒤 그대로, 방 안에서 시작
  const before = await info();
  await page.waitForTimeout(600);
  await reload();
  say('새로고침 뒤 그대로', (await info()) === before, await info());

  // 8) 방에서 걸어서 나가기 (키), 문 앞에서 걸어 들어가기 (키)
  await page.click('#scene');
  await g(() => { const c = window.__game.character; c.teleport(3, 8.8); });
  await page.keyboard.down('KeyS'); await page.keyboard.down('KeyA');
  await waitPlace('yard');
  await page.keyboard.up('KeyS'); await page.keyboard.up('KeyA');
  say('깔개 쪽으로 걸어 나가기', (await g(() => window.__game.character.place)) === 'yard');
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
  await waitPlace('main');
  await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
  say('문으로 걸어 들어가기', (await g(() => window.__game.character.place)) === 'main');
  logs.push('끝: ' + await info());
}
