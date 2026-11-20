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
import { createSaver, parse, serialize } from './save.js';
import { importSharedHouse, restorePreviousHouse, hasPreviousHouse } from './house-transfer.js';
import { makeShareLink, readShareHash, PUBLIC_SHARE_URL } from './share.js';
import { watchShareHash } from './share-route.js';
import { sampleCommands } from './sample.js';
import { onlineVisitUid, onlineErrorText, withOnlineTimeout } from './online-data.js';
import { getOnlineService, ONLINE_TIMEOUT_MS } from './online.js';
import { createOnlineUI } from './online-ui.js';

watchShareHash(window);

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

  // 공유 링크를 열었다면 저장된 내 집보다 공유된 집을 우선하되, 절대 내 저장소에 쓰지 않는다.
  let sharedState = null;
  let shareError = '';
  let onlineGuestOwner = null;
  if (window.location.hash.startsWith('#home=')) {
    try {
      const received = await readShareHash(window.location.hash);
      const checked = parse(serialize(received)); // 배치 규칙으로 다시 검증한다
      if (!checked.ok || checked.dropped) throw new Error('공유된 집에 사용할 수 없는 가구가 있습니다');
      sharedState = checked.state;
    } catch (error) { shareError = error.message === '이 브라우저는 압축된 집 공유를 지원하지 않습니다' ? error.message : '공유 링크가 잘못되었거나 지금 사용할 수 없는 집입니다'; }
  } else if (window.location.hash.startsWith('#visit=')) {
    // 서버에 게시된 집은 명시적인 URL을 열었을 때만 불러온다.
    // 실패한 링크는 기존 개인 집으로 복귀한다. Firebase는 로컬 저장소를 고치지 않는다.
    document.getElementById('loading').textContent = '친구의 집을 불러오는 중입니다';
    try {
      const ownerUid = onlineVisitUid(window.location.hash);
      // 서버가 응답하지 않으면 한도 뒤에 포기하고 내 집을 연다. 불러오는 화면에서 멈추지 않게 한다
      sharedState = await withOnlineTimeout(
        (async () => (await getOnlineService()).visit(ownerUid))(), ONLINE_TIMEOUT_MS);
      onlineGuestOwner = ownerUid;
    } catch (error) { shareError = onlineErrorText(error); }
  }
  const guest = !!sharedState;
  const canImport = guest && window.location.hash.startsWith('#home=');
  // 불러오는 순서: 공유 스냅샷 → 열어 둔 화면에서 넘겨받은 상태 → 브라우저에 저장된 집 → 처음 배치
  const storage = openStorage();
  const saver = createSaver(storage);
  const handed = guest ? null : (saved.state?.version === 2 ? saved : null);
  const loaded = guest ? null : (handed ? null : saver.load());
  const kept = sharedState || handed?.state || (loaded?.ok ? loaded.state : null);
  const store = createStore(kept || createState(), 'p1');
  if (!kept) for (const cmd of sampleCommands(store)) store.dispatch(cmd);

  // 드나드는 자리: 마당에서는 문 앞, 방에서는 현관 깔개 위
  const doorFront = () => { const r = houseRect(store.state.house.level); return { x: HOUSE_CENTER_X, z: r.z0 + r.d + 1.2 }; };
  const matSpot = () => ({ x: MAT_X + 1, z: LEVELS[store.state.house.level].room[1] - 0.9 });

  const canvas = document.getElementById('scene');
  const view = createView({ canvas, assets, store });
  const audio = createAudio();
  const startPlace = guest ? 'main' : (handed?.place || (loaded?.ok && loaded.place) || 'yard');
  const keptPos = guest ? null : (handed?.pos || (loaded?.ok && loaded.pos));
  const inYard = (p) => p && p.x > -2 && p.z > -2 && p.x < YARD.w + 2 && p.z < YARD.h + 2;
  const startAt = startPlace === 'yard' ? (inYard(keptPos) ? keptPos : { x: HOUSE_CENTER_X, z: doorFront().z + 2.4 }) : matSpot();
  const character = createCharacter({ view, store, assets, start: startAt, place: startPlace });
  view.setPlace(startPlace);
  view.snapFocus(startAt.x, startAt.z);

  // ---- 마당과 방 사이를 오가기 ----
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let input;
  let busy = false;
  let switchingHouse = false; // 이전 집 복구 뒤 페이지를 떠날 때 현재 집의 자동 저장이 덮지 않게 한다
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
    // 문이나 깔개로 걸어가던 것을 그만둔다 (다른 곳을 눌렀을 때)
    cancel() { pending = null; },
    // 집이나 현관 깔개를 눌렀을 때: 그 앞으로 걸어간 뒤 드나든다
    walkToDoor() {
      const spot = character.place === 'yard' ? { x: HOUSE_CENTER_X, z: doorFront().z - 0.8 } : { x: MAT_X + 1, z: matSpot().z + 0.4 };
      if (Math.hypot(character.pos.x - spot.x, character.pos.z - spot.z) < 0.5) { travel.toggle(); return; }
      pending = character.goTo(spot.x, spot.z) ? 'door' : null;
      if (!pending) travel.toggle();
    },
  };

  const ui = createUI({
    guest, canImport,
    thumbs: view.thumbnails(Object.keys(PARTS)),
    on: {
      share: async () => {
        try { ui.openShare(await makeShareLink(store.state, PUBLIC_SHARE_URL)); }
        catch (error) { ui.toast(error.message || '공유 링크를 만들지 못했습니다', 'error'); }
      },
      // 서버 없는 집 공유 링크를 열었을 때만, 확인을 받은 뒤 현재 브라우저의 집을 복사한다.
      importHouse: () => {
        if (!canImport || !sharedState) return;
        if (!window.confirm('지금 구경하는 집을 이 브라우저의 내 집으로 가져올까요? 기존 집은 복원할 수 있도록 따로 보관합니다. Firebase 온라인 집과 방명록의 소유권은 옮겨지지 않습니다.')) return;
        try {
          importSharedHouse(storage, sharedState);
          switchingHouse = true;
          const url = new URL(window.location.href);
          url.hash = '';
          window.location.replace(url.href);
        } catch (error) { ui.toast(error.message || '집을 가져오지 못했습니다', 'error'); }
      },
      canRestorePrevious: () => hasPreviousHouse(storage),
      restorePreviousHouse: () => {
        if (!window.confirm('복사하기 전 내 집으로 되돌릴까요? 지금 보고 있는 집도 따로 보관하고 싶다면 먼저 집 공유 주소를 복사해 주세요. Firebase 온라인 집과 방명록은 그대로입니다.')) return;
        switchingHouse = true;
        try {
          restorePreviousHouse(storage);
          window.location.reload();
        } catch (error) {
          switchingHouse = false;
          ui.toast(error.message || '이전 집을 복구하지 못했습니다', 'error');
        }
      },
      home: () => {
        const url = new URL(window.location.href);
        url.hash = '';
        window.location.assign(url.href);
      },
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
  // 온라인 기능은 설정이 없으면 버튼을 숨긴다. 로컬 집/오프라인 링크는 항상 독립적으로 작동한다.
  createOnlineUI({
    store, visitorUid: onlineGuestOwner, readOnly: guest,
    openShare: (link, options) => ui.openShare(link, options),
    toast: (message, kind) => ui.toast(message, kind),
  });
  const history = createHistory(store); // 처음 놓인 가구는 기록에 넣지 않는다
  input = createInput({ canvas, view, store, history, character, ui, audio, travel, readOnly: guest });
  history.subscribe((status) => ui.setHistory(status));
  ui.setHistory(history.status());
  if (!guest && handed?.mode === 'build') input.setMode('build');
  ui.loaded();

  // ---- 자동 저장: 집이 바뀌면 잠시 뒤에, 화면을 떠날 때는 바로 저장한다 ----
  let saveTimer = 0;
  const saveNow = () => {
    if (guest || switchingHouse) return false;
    clearTimeout(saveTimer);
    saveTimer = 0;
    const ok = saver.save(store.state, { place: character.place, pos: { x: character.pos.x, z: character.pos.z } });
    ui.setSaveStatus(ok ? 'saved' : 'off');
    return ok;
  };
  function saveSoon() {
    if (guest || switchingHouse || !saver.available) return;
    ui.setSaveStatus('pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  if (!guest) {
    store.subscribe(saveSoon);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  }
  ui.setSaveStatus(guest ? 'guest' : (saver.available ? 'saved' : 'off'));
  if (shareError) ui.toast(`공유 링크 오류: ${shareError}. 내 집으로 열었습니다`, 'error');
  if (loaded && !loaded.ok) ui.toast(`${loaded.reason}. 처음 배치로 시작합니다`, 'error');
  else if (loaded?.dropped) ui.toast(`저장된 것 가운데 ${loaded.dropped}개는 지금 규칙에 맞지 않아 빼고 불러왔습니다`, 'error');

  let last = performance.now();
  let wasSeated = null;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dir = input.state.mode === 'walk' || character.place === 'yard' ? input.moveDirection() : input.moveDirection();
    if (dir) pending = null;
    character.update(dt, dir);
    // 앉거나 일어나면 안내를 바꾼다
    const seated = character.seated?.id ?? null;
    if (seated !== wasSeated) { wasSeated = seated; input.syncUI(); if (seated) audio.play('sit'); }
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
  window.claude?.hot?.snapshot?.(() => guest ? {} : ({ state: store.state, place: character.place, pos: { ...character.pos }, mode: input.state.mode }));
  window.__game = { store, view, character, input, history, saveNow, travel };
  window.__ready = true;
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
