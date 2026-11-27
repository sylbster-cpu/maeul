// 4단계 "집에 놓기"(2026-11-25 사용자 결정)의 확인. 숲에서 주운 것을 가진 만큼만 마당과 방에 놓는다.
//   TOUCH=1 node tools/shot.mjs / <출력> 390 844 test/found.mjs
// 1. 꾸미기 소품 탭에 "숲에서 주운 것" 칸이 있고, 그림과 더 놓을 수 있는 수가 보인다 (가진 것 0 이면 흐리게)
// 2. 가진 만큼 마당에 놓고, 그 뒤로는 놓이지 않으며 왜 안 되는지 알린다
// 3. 치우면 다시 놓을 수 있다. 되돌리기는 막지 않는다(이번 접속에서 있었던 상태로만 돌아감, PR #42 GPT 검토 2)
// 4. 새로 열어도 놓인 것과 수가 그대로다. 주운 적 없는 것은 방에서도 놓이지 않는다
// 5. 버튼 아래 줄에 남은 수를 적고 0 은 "다 놓음"과 "아직 없음"으로 가른다. 고르면 안내 줄에 가진 수·놓인 수·남은 수가 나온다 (2026-11-26 사용자 결정 "가진 수 고쳐요")
import { uiClick, closeCatalog } from './helpers/menu.mjs';
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
  const tile = (part) => g((id) => {
    const b = document.getElementById(`tool-${id}`);
    if (!b) return null;
    const c = b.querySelector('.tool-count'), br = b.getBoundingClientRect(), cr = c?.getBoundingClientRect();
    return {
      label: b.querySelector('.tool-label').textContent, count: c?.textContent || '', empty: b.classList.contains('empty'), img: !!b.querySelector('img'), hidden: !!b.closest('.tool-group')?.hidden,
      // 남은 수 줄이 버튼 안에 다 보이는지
      countInside: !!cr && cr.width > 0 && cr.left >= br.left - 1 && cr.right <= br.right + 1 && cr.bottom <= br.bottom + 1,
    };
  }, part);
  const hint = () => g(() => document.getElementById('hint')?.textContent || '');
  const placed = (space, part) => g(([s, p]) => Object.values(window.__game.store.state.spaces[s].objects).filter((o) => o.part === p).map((o) => ({ id: o.id, x: o.x, y: o.y })), [space, part]);
  const toast = () => g(() => document.getElementById('toast')?.textContent || '');

  // 솔방울 둘을 주운 기록으로 시작한다 (채집 기록은 집과 따로 된 열쇠)
  await g(() => localStorage.setItem('maeul:gathering', JSON.stringify({ format: 'gather-log', version: 2, log: { pinecone: { best: 9.5, first: '2026-11-25', count: 2 } }, day: null, picked: [] })));
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);

  // 1. 꾸미기 → 소품 탭
  await page.click('#mode-build');
  await uiClick(page, '#tab-props');
  const pine = await tile('found_pinecone'), feather = await tile('found_feather');
  say('소품 탭에 숲에서 주운 것이 그림과 함께 보이고, 이름 아래에 남은 수가 적힌다',
    pine && !pine.hidden && pine.img && pine.label === '솔방울' && pine.count === '남은 2개' && !pine.empty && pine.countInside, JSON.stringify(pine));
  say('주운 적 없는 것은 "아직 없음"으로 흐리게 보인다', feather.label === '새 깃털' && feather.count === '아직 없음' && feather.empty && feather.countInside, JSON.stringify(feather));
  await uiClick(page, '#tool-found_feather');
  const featherHint = await hint();
  say('주운 적 없는 것을 고르면 안내 줄이 숲에서 주워 오라고 알린다', featherHint.includes('아직 주운 새 깃털이 없습니다'), featherHint);

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
  await uiClick(page, '#tool-found_pinecone');
  const before = await hint();
  say('고르면 안내 줄에 가진 수가 나온다', before === '가진 솔방울 2개를 놓을 수 있습니다.', before);
  await groundTap(cells[0].x + 0.5, cells[0].y + 0.5);
  const one = await hint();
  say('하나 놓으면 안내 줄이 가진 수·놓인 수·남은 수로 바뀐다', one === '가진 솔방울 2개 가운데 1개를 놓았습니다. 1개 더 놓을 수 있습니다.' && (await tile('found_pinecone')).count === '남은 1개', one);
  await groundTap(cells[1].x + 0.5, cells[1].y + 0.5);
  const two = await placed('yard', 'found_pinecone');
  say('가진 만큼(둘) 마당에 놓인다', two.length === 2, JSON.stringify({ cells: cells.slice(0, 2), two }));
  const allDown = { tile: await tile('found_pinecone'), hint: await hint() };
  say('가진 것을 모두 놓으면 "다 놓음"으로 흐리게 보이고, 안내 줄이 치우면 다시 놓을 수 있다고 알린다',
    allDown.tile.count === '다 놓음' && allDown.tile.empty && allDown.hint.includes('가진 솔방울 2개를 모두 놓았습니다'), JSON.stringify(allDown));
  await page.screenshot({ path: `${out}-1-yard.png` });
  await groundTap(cells[2].x + 0.5, cells[2].y + 0.5);
  const third = await placed('yard', 'found_pinecone');
  const why = await toast();
  say('가진 것보다 많이는 놓이지 않고 왜 안 되는지 알린다', third.length === 2 && why.includes('더 주워 와야'), why);

  // 3. 치우면 다시 놓을 수 있다. 되돌리기는 막지 않는다
  await uiClick(page, '#tool-erase');
  await groundTap(two[0].x + 0.5, two[0].y + 0.5);
  const afterErase = await placed('yard', 'found_pinecone');
  say('치우면 하나 줄고 다시 놓을 수 있다', afterErase.length === 1 && (await tile('found_pinecone')).count === '남은 1개', JSON.stringify(afterErase));
  // 그사이 가진 수가 하나로 줄었다고 쳐도(예: 다른 탭에서 기록이 바뀜) 치우기를 되돌리면 그대로 돌아온다. 새로 놓기만 막힌다
  await g(() => { const s = window.__game.gathering.store; s.replace({ ...s.state, log: { pinecone: { best: 9.5, first: '2026-11-25', count: 1 } } }); });
  await page.click('#undo');
  await frames(3);
  const restored = { n: (await placed('yard', 'found_pinecone')).length, count: (await tile('found_pinecone')).count };
  say('가진 수가 줄었어도 되돌리기로 치운 것이 돌아온다', restored.n === 2 && restored.count === '다 놓음', JSON.stringify(restored));
  await uiClick(page, '#tool-found_pinecone');
  const over = await hint();
  say('가진 것보다 많이 놓여 있으면 안내 줄이 그렇게 알린다', over.includes('놓인 솔방울 2개가 가진 1개보다 많습니다'), over);
  await g(() => { const t = document.getElementById('toast'); if (t) t.textContent = ''; }); // 앞의 알림과 섞이지 않게
  await groundTap(cells[2].x + 0.5, cells[2].y + 0.5);
  const still = { n: (await placed('yard', 'found_pinecone')).length, toast: await toast() };
  say('그 상태에서 새로 놓기는 막힌다', still.n === 2 && still.toast.includes('더 주워 와야'), JSON.stringify(still));
  await g(() => { const s = window.__game.gathering.store; s.replace({ ...s.state, log: { pinecone: { best: 9.5, first: '2026-11-25', count: 2 } } }); });

  // 4. 새로 열어도 그대로. 걸어 다녀도 오류가 없다(모델 없는 물건의 충돌 상자)
  await g(() => window.__game.saveNow());
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  const kept = await placed('yard', 'found_pinecone');
  await page.click('#mode-build');
  await uiClick(page, '#tab-props');
  say('새로 열어도 놓인 것과 수가 그대로다', kept.length === 2 && (await tile('found_pinecone')).count === '다 놓음', JSON.stringify({ n: kept.length, count: (await tile('found_pinecone')).count }));
  // 방에서는 주운 적 없는 버섯이 놓이지 않는다. 목록이 열린 채로는 위쪽 버튼을 눌러도 목록만 접히므로 먼저 접는다(6단계 HUD B)
  await closeCatalog(page);
  await page.click('#place-toggle');
  await page.waitForFunction(() => window.__game.character.place === 'main', null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await uiClick(page, '#tab-props');
  const room = await g(() => {
    const { store, view } = window.__game;
    const [w, h] = [6, 6];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if (store.can({ type: 'placeObject', space: 'main', id: '-', part: 'found_mushroom', x, y, rot: 0 }).ok) { const p = view.screenPoint(x + 0.5, y + 0.5); return { x, y, p }; }
    }
    return null;
  });
  await uiClick(page, '#tool-found_mushroom');
  await groundTap(room.x + 0.5, room.y + 0.5);
  const mush = { n: (await placed('main', 'found_mushroom')).length, toast: await toast() };
  say('주운 적 없는 것은 방에서도 놓이지 않는다', mush.n === 0 && mush.toast.includes('아직 주운 적이 없습니다'), JSON.stringify(mush));
  await page.screenshot({ path: `${out}-2-room.png` });
}
