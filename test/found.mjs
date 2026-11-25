// 4단계 "집에 놓기"(2026-11-25 사용자 결정)의 확인. 숲에서 주운 것을 가진 만큼만 마당과 방에 놓는다.
//   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/found.mjs
// 1. 꾸미기 소품 탭에 "숲에서 주운 것" 칸이 있고, 그림과 더 놓을 수 있는 수가 보인다 (가진 것 0 이면 흐리게)
// 2. 가진 만큼 마당에 놓고, 그 뒤로는 놓이지 않으며 왜 안 되는지 알린다
// 3. 치우면 다시 놓을 수 있고, 되돌리기로 다시 놓을 때도 가진 수를 넘지 않는다
// 4. 새로 열어도 놓인 것과 수가 그대로다. 주운 적 없는 것은 방에서도 놓이지 않는다
export default async function foundTour(page, { out, logs }) {
  const say = (label, ok, extra = '') => logs.push(`${ok ? '통과' : '실패'}  ${label} ${extra}`);
  const g = (fn, arg) => page.evaluate(fn, arg);
  const cdp = await page.context().newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const frames = (n) => g((k) => new Promise((done) => { let i = 0; const step = () => (++i >= k ? done() : requestAnimationFrame(step)); requestAnimationFrame(step); }), n);
  const groundTap = async (x, z) => {
    let p = await g(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
    for (let i = 0; i < 40; i++) {
      await frames(4);
      const q = await g(([a, b]) => window.__game.view.screenPoint(a, b), [x, z]);
      const still = Math.hypot(q.x - p.x, q.y - p.y) < 0.5;
      p = q;
      if (still) break;
    }
    await tap(p.x, p.y);
    await frames(3);
  };
  const tile = (part) => g((id) => { const b = document.getElementById(`tool-${id}`); return b ? { label: b.querySelector('.tool-label').textContent, empty: b.classList.contains('empty'), img: !!b.querySelector('img'), hidden: !!b.closest('.tool-group')?.hidden } : null; }, part);
  const placed = (space, part) => g(([s, p]) => Object.values(window.__game.store.state.spaces[s].objects).filter((o) => o.part === p).map((o) => ({ id: o.id, x: o.x, y: o.y })), [space, part]);
  const toast = () => g(() => document.getElementById('toast')?.textContent || '');

  // 솔방울 둘을 주운 기록으로 시작한다 (채집 기록은 집과 따로 된 열쇠)
  await g(() => localStorage.setItem('maeul:gathering', JSON.stringify({ format: 'gather-log', version: 2, log: { pinecone: { best: 9.5, first: '2026-11-25', count: 2 } }, day: null, picked: [] })));
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);

  // 1. 꾸미기 → 소품 탭
  await page.click('#mode-build');
  await page.click('#tab-props');
  const pine = await tile('found_pinecone'), feather = await tile('found_feather');
  say('소품 탭에 숲에서 주운 것이 그림과 함께 보이고, 더 놓을 수 있는 수가 적힌다',
    pine && !pine.hidden && pine.img && pine.label === '솔방울 ×2' && !pine.empty && feather.label === '새 깃털 ×0' && feather.empty, JSON.stringify({ pine, feather }));

  // 2. 마당의 빈 칸 셋을 찾는다 (집 앞 화면 안, 놓을 수 있는 곳)
  const cells = await g(() => {
    const { store, view, character } = window.__game;
    const out = [];
    const c = character.pos;
    for (let r = 2; r < 7 && out.length < 3; r++) {
      for (let dx = -r; dx <= r && out.length < 3; dx++) {
        for (const dz of [r, -r]) {
          const x = Math.floor(c.x) + dx, y = Math.floor(c.z) + dz;
          const ok = store.can({ type: 'placeObject', space: 'yard', id: '-', part: 'chair', x, y, rot: 0 }).ok;
          const p = view.screenPoint(x + 0.5, y + 0.5);
          if (ok && p.x > 30 && p.x < innerWidth - 30 && p.y > 200 && p.y < innerHeight - 220 && !out.some((q) => Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2)) out.push({ x, y });
          if (out.length >= 3) break;
        }
      }
    }
    return out;
  });
  await page.click('#tool-found_pinecone');
  await groundTap(cells[0].x + 0.5, cells[0].y + 0.5);
  await groundTap(cells[1].x + 0.5, cells[1].y + 0.5);
  const two = await placed('yard', 'found_pinecone');
  say('가진 만큼(둘) 마당에 놓인다', two.length === 2, JSON.stringify({ cells: cells.slice(0, 2), two }));
  say('놓으면 더 놓을 수 있는 수가 줄어든다', (await tile('found_pinecone')).label === '솔방울 ×0', (await tile('found_pinecone')).label);
  await page.screenshot({ path: `${out}-1-yard.png` });
  await groundTap(cells[2].x + 0.5, cells[2].y + 0.5);
  const third = await placed('yard', 'found_pinecone');
  const why = await toast();
  say('가진 것보다 많이는 놓이지 않고 왜 안 되는지 알린다', third.length === 2 && why.includes('더 주워 와야'), why);

  // 3. 치우면 다시 놓을 수 있다. 되돌리기로 다시 놓을 때도 가진 수를 넘지 않는다
  await page.click('#tool-erase');
  await groundTap(two[0].x + 0.5, two[0].y + 0.5);
  const afterErase = await placed('yard', 'found_pinecone');
  say('치우면 하나 줄고 다시 놓을 수 있다', afterErase.length === 1 && (await tile('found_pinecone')).label === '솔방울 ×1', JSON.stringify(afterErase));
  // 그사이 가진 수가 하나로 줄었다고 치고(예: 다른 탭에서 기록이 바뀜) 치우기를 되돌리면 막힌다
  await g(() => { const s = window.__game.gathering.store; s.replace({ ...s.state, log: { pinecone: { best: 9.5, first: '2026-11-25', count: 1 } } }); });
  await page.click('#undo');
  await frames(3);
  const blocked = { n: (await placed('yard', 'found_pinecone')).length, toast: await toast(), canUndo: await g(() => window.__game.history.status().canUndo) };
  say('되돌리기로 다시 놓을 때도 가진 수를 넘지 않고, 그 기록은 남는다', blocked.n === 1 && blocked.toast.includes('더 주워 와야') && blocked.canUndo, JSON.stringify(blocked));
  await g(() => { const s = window.__game.gathering.store; s.replace({ ...s.state, log: { pinecone: { best: 9.5, first: '2026-11-25', count: 2 } } }); });
  await page.click('#undo');
  await frames(3);
  say('가진 수가 넉넉하면 되돌리기로 다시 놓인다', (await placed('yard', 'found_pinecone')).length === 2, '');

  // 4. 새로 열어도 그대로. 걸어 다녀도 오류가 없다(모델 없는 물건의 충돌 상자)
  await g(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const kept = await placed('yard', 'found_pinecone');
  await page.click('#mode-build');
  await page.click('#tab-props');
  say('새로 열어도 놓인 것과 수가 그대로다', kept.length === 2 && (await tile('found_pinecone')).label === '솔방울 ×0', JSON.stringify({ n: kept.length, label: (await tile('found_pinecone')).label }));
  // 방에서는 주운 적 없는 버섯이 놓이지 않는다
  await page.click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'main', null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.click('#tab-props');
  const room = await g(() => {
    const { store, view } = window.__game;
    const [w, h] = [6, 6];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (store.can({ type: 'placeObject', space: 'main', id: '-', part: 'found_mushroom', x, y, rot: 0 }).ok) { const p = view.screenPoint(x + 0.5, y + 0.5); return { x, y, p }; }
    }
    return null;
  });
  await page.click('#tool-found_mushroom');
  await groundTap(room.x + 0.5, room.y + 0.5);
  const mush = { n: (await placed('main', 'found_mushroom')).length, toast: await toast() };
  say('주운 적 없는 것은 방에서도 놓이지 않는다', mush.n === 0 && mush.toast.includes('아직 주운 적이 없습니다'), JSON.stringify(mush));
  await page.screenshot({ path: `${out}-2-room.png` });
}
