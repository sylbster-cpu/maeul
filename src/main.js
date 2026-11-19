// 시작점. 자료를 불러오고, 규칙(store)과 화면(view)과 조작(input)을 잇는다.
import { loadAssets } from './assets.js';
import { PARTS, HOUSE_CENTER_X, MAT_X, LEVELS, YARD } from './parts.js';
import { createState, createStore, houseRect } from './state.js';
import { createView } from './view.js';
import { createCharacter } from './character.js';
import { createInput } from './input.js';
import { createHistory } from './history.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createSaver } from './save.js';
import { sampleCommands } from './sample.js';

// 브라우저 저장소. 막혀 있는 환경(사생활 보호 창 등)에서는 null 을 돌려준다
function openStorage() {
  try {
    const storage = window.localStorage;
    storage.setItem('house-lab-web:probe', '1');
    storage.removeItem('house-lab-web:probe');
    return storage;
  } catch { return null; }
}

async function start(saved = {}) {
  let assets;
  try { assets = await loadAssets(); }
  catch (error) { document.getElementById('loading').textContent = '모델을 불러오지 못했습니다. 새로 고쳐 주세요.'; throw error; }

  // 불러오는 순서: 열어 둔 화면에서 넘겨받은 상태 → 브라우저에 저장된 집 → 처음 배치
  const saver = createSaver(openStorage());
  const handed = saved.state?.version === 2 ? saved : null;
  const loaded = handed ? null : saver.load();
  const kept = handed?.state || (loaded?.ok ? loaded.state : null);
  const store = createStore(kept || createState(), 'p1');
  if (!kept) for (const cmd of sampleCommands(store)) store.dispatch(cmd);

  // 드나드는 자리: 마당에서는 문 앞, 방에서는 현관 깔개 위
  const doorFront = () => { const r = houseRect(store.state.house.level); return { x: HOUSE_CENTER_X, z: r.z0 + r.d + 1.2 }; };
  const matSpot = () => ({ x: MAT_X + 1, z: LEVELS[store.state.house.level].room[1] - 0.9 });

  const canvas = document.getElementById('scene');
  const view = createView({ canvas, assets, store });
  const audio = createAudio();
  const startPlace = handed?.place || (loaded?.ok && loaded.place) || 'yard';
  const keptPos = handed?.pos || (loaded?.ok && loaded.pos);
  const inYard = (p) => p && p.x > -2 && p.z > -2 && p.x < YARD.w + 2 && p.z < YARD.h + 2;
  const startAt = startPlace === 'yard' ? (inYard(keptPos) ? keptPos : { x: HOUSE_CENTER_X, z: doorFront().z + 2.4 }) : matSpot();
  const character = createCharacter({ view, store, assets, start: startAt, place: startPlace });
  view.setPlace(startPlace);
  view.snapFocus(startAt.x, startAt.z);

  // ---- 마당과 방 사이를 오가기 ----
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let input;
  let busy = false;
  let pending = null; // 문이나 깔개를 눌러 걸어가는 중이면 'door'
  function go(place) {
    if (busy || character.place === place) return;
    const arrive = () => {
      input.leavePlace();
      if (place === 'yard') { const p = doorFront(); character.setPlace('yard', p.x, p.z, 0); view.setPlace('yard'); view.snapFocus(p.x, p.z); }
      else { const p = matSpot(); character.setPlace('main', p.x, p.z, Math.PI); view.setPlace('main'); }
      view.setGrid(input.state.mode === 'build');
      input.syncUI();
      audio.play('step');
      saveSoon();
      canvas.classList.remove('fading');
      busy = false;
    };
    pending = null;
    busy = true;
    if (calm) { arrive(); return; }
    canvas.classList.add('fading');
    setTimeout(arrive, 170);
  }
  const travel = {
    toggle: () => go(character.place === 'yard' ? 'main' : 'yard'),
    // 집이나 현관 깔개를 눌렀을 때: 그 앞으로 걸어간 뒤 드나든다
    walkToDoor() {
      const spot = character.place === 'yard' ? { x: HOUSE_CENTER_X, z: doorFront().z - 0.8 } : { x: MAT_X + 1, z: matSpot().z + 0.4 };
      if (Math.hypot(character.pos.x - spot.x, character.pos.z - spot.z) < 0.5) { travel.toggle(); return; }
      pending = character.goTo(spot.x, spot.z) ? 'door' : null;
      if (!pending) travel.toggle();
    },
  };

  const ui = createUI({
    thumbs: view.thumbnails(Object.keys(PARTS)),
    on: {
      tool: (id) => input.setTool(id),
      mode: (mode) => input.setMode(mode),
      camera: (step) => { view.rotateCamera(step); input.refresh(); },
      zoom: (factor) => view.zoomBy(factor),
      rotate: () => input.rotate(),
      mute: () => { audio.setMuted(!audio.muted); return audio.muted; },
      inset: (px) => view.setBottomInset(px),
      clear: () => input.clearAll(),
      undo: () => input.undo(),
      redo: () => input.redo(),
      sample: () => input.resetToSample(),
      cancelCarry: () => input.cancelCarry(),
      choose: (cmd) => input.choose(cmd),
      upgrade: () => input.upgrade(),
      travel: () => travel.toggle(),
    },
  });
  const history = createHistory(store); // 처음 놓인 가구는 기록에 넣지 않는다
  input = createInput({ canvas, view, store, history, character, ui, audio, travel });
  history.subscribe((status) => ui.setHistory(status));
  ui.setHistory(history.status());
  if (handed?.mode === 'build') input.setMode('build');
  ui.loaded();

  // ---- 자동 저장: 집이 바뀌면 잠시 뒤에, 화면을 떠날 때는 바로 저장한다 ----
  let saveTimer = 0;
  const saveNow = () => {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const ok = saver.save(store.state, { place: character.place, pos: { x: character.pos.x, z: character.pos.z } });
    ui.setSaveStatus(ok ? 'saved' : 'off');
    return ok;
  };
  function saveSoon() {
    if (!saver.available) return;
    ui.setSaveStatus('pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  store.subscribe(saveSoon);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  ui.setSaveStatus(saver.available ? 'saved' : 'off');
  if (loaded && !loaded.ok) ui.toast(`${loaded.reason}. 처음 배치로 시작합니다`, 'error');
  else if (loaded?.dropped) ui.toast(`저장된 것 가운데 ${loaded.dropped}개는 지금 규칙에 맞지 않아 빼고 불러왔습니다`, 'error');

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dir = input.state.mode === 'walk' || character.place === 'yard' ? input.moveDirection() : input.moveDirection();
    if (dir) pending = null;
    character.update(dt, dir);
    if (!busy) {
      if (character.place === 'yard') {
        view.setFocus(character.pos.x, character.pos.z);
        // 문 앞에서 집 쪽으로 걷거나, 집을 눌러 문 앞에 닿으면 들어간다
        if (character.atHouseDoor() && ((dir && dir.z < -0.3) || pending)) go('main');
      } else if (character.atRoomExit() || (pending && !character.walking)) go('yard');
      if (pending && !character.walking) pending = null;
    }
    view.update(dt, character.pos);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // 열어 둔 화면에 새 판이 도착해도 꾸민 집을 잃지 않게 한다
  window.claude?.hot?.snapshot?.(() => ({ state: store.state, place: character.place, pos: { ...character.pos }, mode: input.state.mode }));
  window.__game = { store, view, character, input, history, saveNow, travel };
  window.__ready = true;
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
