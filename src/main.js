// 시작점. 자료를 불러오고, 규칙(store)과 화면(view)과 조작(input)을 잇는다.
import { loadAssets } from './assets.js';
import { PARTS, HOUSE_CENTER_X, MAT_X, LEVELS, OUTDOOR } from './parts.js';
import { inWater } from './fishing.js';
import { todaysDiscoverySite, koreaDay, forestCue } from './forest.js';
import { SPECIAL_ID, checkFoundCommands, foundCounts } from './gathering.js';
import { createGathering } from './gathering-play.js';
import { createState, createStore, houseRect } from './state.js';
import { createView } from './view.js';
import { createCharacter } from './character.js';
import { createInput } from './input.js';
import { createHistory } from './history.js';
import { createUI } from './ui.js';
import { createAudio } from './audio.js';
import { createHaptics } from './haptics.js';
import { createSaver, parse, serialize, isNewerHouse } from './save.js';
import { importSharedHouse, restorePreviousHouse, hasPreviousHouse,
  recoverInterruptedHouseTransfer, createHouseSaveGuard, HOUSE_STORAGE_KEYS } from './house-transfer.js';
import { SAVE_KEY } from './save.js';
import { makeShareLink, readShareHash, PUBLIC_SHARE_URL } from './share.js';
import { watchShareHash } from './share-route.js';
import { sampleCommands } from './sample.js';
import { onlineVisitUid, onlineErrorText, withOnlineTimeout } from './online-data.js';
import { getOnlineService, ONLINE_TIMEOUT_MS } from './online.js';
import { createOnlineUI } from './online-ui.js';
import { createPondView } from './fishing-view.js';
import { createFishing } from './fishing-play.js';
import { createFishingUI, createCatchCard } from './fishing-ui.js';
import { createWreathUI } from './wreath-ui.js';
import { createHintMemory } from './hint-memory.js';

watchShareHash(window);

// 브라우저 저장소. 읽을 수조차 없는 환경(막힌 사생활 보호 창 등)에서만 null 을 돌려준다.
// 쓰기만 실패할 때(저장 공간이 가득 참 등)는 저장소를 그대로 쓴다. 저장된 집을 읽어야 처음 배치로 시작해
// 온라인 게시로 덮어쓰는 일이 없다. 쓰기 실패는 저장할 때 저장 상태 줄로 알린다(2026-11-26 GPT 점검)
function openStorage() {
  let storage;
  try { storage = window.localStorage; storage.getItem('house-lab-web:probe'); } catch { return null; }
  try { storage.setItem('house-lab-web:probe', '1'); storage.removeItem('house-lab-web:probe'); } catch { /* 읽기는 된다 */ }
  return storage;
}

// 확인 창(window.confirm)이 떠 있는 동안 이 탭은 다른 탭이 저장소에 쓴 것을 받아들이지 못한다. 브라우저(크롬)는
// 탭마다 저장소의 사본을 두고 다른 탭의 변경을 뒤늦게 전해 받는데, 확인 창이 그 일을 멈춰 세운다.
// 그래서 창을 닫은 바로 그 자리에서 읽으면 옛 내용이 나와, 그사이 다른 탭이 저장한 새 판의 집을 덮어썼다
// (2026-11-26 GPT 재검토, 실제 두 탭에서 재현). 가져오기와 맞바꾸기는 잠깐 쉬어 밀린 변경을 받은 뒤에 읽고 쓴다.
// localStorage 에는 "읽은 그대로일 때만 쓰기"가 없으므로, 쉰 뒤의 아주 짧은 사이에 다른 탭이 쓰는 경우까지 막지는 못한다
const SETTLE_MS = 150;
const settleStorage = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

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
  // 집 교체 도중 브라우저가 종료됐어도 두 집을 보호한다.
  let transferError = '';
  try { recoverInterruptedHouseTransfer(storage); }
  catch (error) { transferError = error.message; }
  const saveGuard = createHouseSaveGuard(storage);
  const saver = createSaver(storage);
  // 더 새로운 판에서 저장한 집이면 이 화면은 그 집의 일부만 안다. 저장뿐 아니라 온라인 게시·공유 링크·집 가져오기도 하지 않는다.
  // 빠진 배치를 밖으로 내보내거나, 가져오기로 원문을 잃지 않게 하려는 것이다(PR #43 GPT 검토). 맞바꾸기는 원문을 그대로 옮기므로 막지 않는다
  // '집'으로 시작해야 온라인 창이 이 글을 그대로 보인다(online-data.js onlineErrorText)
  const NEWER_HOUSE = '집이 더 새로운 판의 게임에서 저장되어 있습니다. 새로 고친 뒤 다시 해 주세요';
  // 뺀 집의 원문을 남기지 못해 저장을 멈췄을 때(save.js createSaver 의 lockReason 'backup'). 이것도 '집'으로 시작한다
  const HELD_HOUSE = '집의 원래 저장 내용을 따로 남기지 못해 이 화면에서는 저장하지 않습니다. 저장 공간을 비운 뒤 새로 고쳐 주세요';
  const lockText = () => (saver.lockReason === 'backup' ? HELD_HOUSE : NEWER_HOUSE);
  const newerHouse = () => { if (saver.locked) return true; try { return isNewerHouse(storage?.getItem(SAVE_KEY)); } catch { return false; } };
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
  const haptics = createHaptics(); // 진동. 소리 버튼으로 소리와 함께 끄고 켠다
  const startPlace = guest ? 'main' : (handed?.place || (loaded?.ok && loaded.place) || 'yard');
  const keptPos = guest ? null : (handed?.pos || (loaded?.ok && loaded.pos));
  // 걸을 수 있는 범위(연못가와 바닷가 포함) 안이고 물 위가 아니면 서 있던 자리에서 시작한다
  const inYard = (p) => p && p.x > OUTDOOR.x0 - 0.5 && p.z > OUTDOOR.z0 - 0.5 && p.x < OUTDOOR.x1 + 0.5 && p.z < OUTDOOR.z1 + 0.5 && !inWater(p.x, p.z);
  const startAt = startPlace === 'yard' ? (inYard(keptPos) ? keptPos : { x: HOUSE_CENTER_X, z: doorFront().z + 2.4 }) : matSpot();
  const character = createCharacter({ view, store, assets, start: startAt, place: startPlace });
  view.setPlace(startPlace);
  view.snapFocus(startAt.x, startAt.z);

  // ---- 마당과 방 사이를 오가기 ----
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let input;
  let fishingUI = null;
  // 걷기 안내를 처음 몇 번의 접속에만 보이기 위한 기억. 집 저장과 따로 둔다(src/hint-memory.js)
  const hintMemory = createHintMemory(openStorage());
  let busy = false;
  let switchingHouse = !!transferError; // 교체·복구 중에는 예전 화면이 저장 내용을 덮지 않는다
  let pending = null; // 문이나 깔개를 눌러 걸어가는 중이면 'door'
  function go(place) {
    if (busy || character.place === place) return;
    // 드나들어 보았으므로 이번 접속에서는 떠나는 곳의 걷기 안내를 접는다. 문·깔개로 걸어가기, 걸어 들어가기,
    // 왼쪽 위 있는 곳 버튼이 모두 여기를 지난다(GPT 검토 PR #49 97c4210, src/hint-memory.js done)
    hintMemory.done(character.place === 'yard' ? 'walkYard' : 'walkRoom');
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

  const thumbs = view.thumbnails(Object.keys(PARTS));
  // 화환 만들기 창(5단계). 재료 그림은 꾸미기 목록과 같은 그림을 쓴다
  const wreathUI = createWreathUI({ thumbs });
  const ui = createUI({
    guest, canImport,
    thumbs,
    on: {
      share: async () => {
        if (!guest && newerHouse()) {
          ui.toast(lockText(), 'error');
          // 공유 주소는 만들지 않는다. 맞바꾸기는 원문을 글자 그대로 옮기므로, 보관된 집이 있으면 그 창은 연다(PR #43 GPT 재검토)
          if (hasPreviousHouse(storage)) {
            ui.openShare('', {
              title: '보관된 집과 맞바꾸기',
              description: '이 집은 더 새로운 판의 게임에서 저장되어 공유 주소를 만들지 않습니다. 새로 고친 뒤 다시 해 주세요. 보관된 다른 집과 맞바꾸기는 할 수 있습니다.',
              footnote: '맞바꿔도 두 집의 저장 내용은 그대로 옮겨집니다. Firebase 온라인 집과 방명록은 바뀌지 않습니다.',
            });
          }
          return;
        }
        try { ui.openShare(await makeShareLink(store.state, PUBLIC_SHARE_URL)); }
        catch (error) {
          // 공유 링크가 너무 길어도 이미 보관된 이전 집으로 돌아갈 길은 막지 않는다.
          if (hasPreviousHouse(storage)) {
            ui.openShare('', {
              title: '이전 집 복구',
              description: '현재 집의 공유 주소를 만들지 못했습니다. 그래도 아래에서 복사하기 전의 내 집으로 되돌아갈 수 있습니다.',
              footnote: '집을 복구해도 Firebase 온라인 집과 방명록은 변경되지 않습니다.',
            });
          }
          ui.toast(error.message || '공유 링크를 만들지 못했습니다', 'error');
        }
      },
      // 서버 없는 집 공유 링크를 열었을 때만, 확인을 받은 뒤 현재 브라우저의 집을 복사한다.
      importHouse: async () => {
        if (switchingHouse || !canImport || !sharedState) return;
        if (newerHouse()) { ui.toast(lockText(), 'error'); return; } // 지금 내 집이 새 판의 집이면 가져오기로 잃을 수 있다
        // 보관 칸은 하나다. 이미 보관된 집이 있으면 그 집은 두고 지금 집이 바뀐다는 것을 미리 알린다
        const replaceCurrent = hasPreviousHouse(storage);
        const question = replaceCurrent
          ? '지금 구경하는 집을 이 브라우저의 내 집으로 가져올까요? 보관해 둔 다른 집은 그대로 남고, 지금 내 집이 이 집으로 바뀝니다. 지금 내 집은 되살릴 수 없습니다. 남기고 싶으면 취소한 뒤, 내 집의 집 공유 창에서 "보관된 다른 집과 맞바꾸기"를 먼저 하세요. Firebase 온라인 집과 방명록의 소유권은 옮겨지지 않습니다.'
          : '지금 구경하는 집을 이 브라우저의 내 집으로 가져올까요? 기존에 저장된 집은 맞바꿀 수 있도록 보관합니다. Firebase 온라인 집과 방명록의 소유권은 옮겨지지 않습니다.';
        // 확인 창을 띄우기 직전의 집과 보관본. 이것과 비교해 창이 떠 있는 사이의 변경만 본다
        const shown = createHouseSaveGuard(storage);
        if (!window.confirm(question)) return;
        switchingHouse = true;
        ui.setHouseTransition(true);
        await settleStorage(); // 확인 창이 떠 있던 사이 다른 탭이 쓴 것을 받은 뒤에 읽는다(위 settleStorage)
        try {
          // 창이 떠 있는 사이 다른 탭이 집이나 보관본을 바꿨으면 판이 같아도 가져오지 않는다. 사용자는 바뀌기 전의 집을 보고
          // "예"를 눌렀고, 보관된 집이 있으면 바뀐 지금 집은 어디에도 남지 않는다(2026-11-26 GPT 재검토)
          if (newerHouse()) throw new Error(lockText()); // 새 판의 집이면 그쪽 안내가 더 정확하다
          if (!shown.isCurrent()) throw new Error('확인하는 사이 다른 탭에서 집이 바뀌어 가져오지 않았습니다. 새로 고친 뒤 다시 해 주세요');
          importSharedHouse(storage, sharedState, { replaceCurrent });
        }
        catch (error) {
          // 기록이 일부 남았다면 절대 자동 저장을 다시 켜지 않는다.
          switchingHouse = !saveGuard.isCurrent();
          ui.setHouseTransition(switchingHouse);
          ui.toast(error.message || '집을 가져오지 못했습니다', 'error');
          return;
        }
        const url = new URL(window.location.href);
        url.hash = '';
        try { window.location.replace(url.href); }
        catch { ui.toast('집은 저장됐습니다. 화면을 직접 새로 고쳐 주세요', 'error'); }
      },
      canRestorePrevious: () => hasPreviousHouse(storage),
      restorePreviousHouse: async () => {
        // 같은 버튼을 연속으로 눌러도 첫 교환 뒤 옛 화면이 다시 저장하지 않게 한다.
        if (switchingHouse || !hasPreviousHouse(storage)) return;
        if (!window.confirm('현재 집을 보관하고, 보관된 다른 집과 맞바꿀까요? 두 집의 배치는 모두 유지됩니다. Firebase 온라인 집과 방명록은 바뀌지 않습니다.')) return;
        switchingHouse = true;
        ui.setHouseTransition(true);
        // 맞바꾸기는 원문을 그대로 옮기지만, 옛 사본을 읽으면 옛 원문을 옮겨 다른 탭이 쓴 것을 잃는다(위 settleStorage)
        await settleStorage();
        try { restorePreviousHouse(storage); }
        catch (error) {
          switchingHouse = !saveGuard.isCurrent();
          ui.setHouseTransition(switchingHouse);
          ui.toast(error.message || '집을 맞바꾸지 못했습니다', 'error');
          return;
        }
        // 이 시점에는 이미 두 집의 교환이 끝났다. 새로고침이 실패해도 저장 차단을 해제하지 않는다.
        try { window.location.reload(); }
        catch { ui.toast('두 집은 맞바뀌었습니다. 화면을 직접 새로 고쳐 주세요', 'error'); }
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
      mute: () => { audio.setMuted(!audio.muted); haptics.setEnabled(!audio.muted); return audio.muted; },
      inset: (px) => view.setBottomInset(px),
      topInset: (px) => view.setTopInset(px),
      clear: () => input.clearAll(),
      undo: () => input.undo(),
      redo: () => input.redo(),
      sample: () => input.resetToSample(),
      cancelCarry: () => input.cancelCarry(),
      editWreath: () => input.editWreath(),
      choose: (cmd) => input.choose(cmd),
      upgrade: () => input.upgrade(),
      travel: () => travel.toggle(),
      resetHints: () => { hintMemory.reset(); input?.syncUI(); },
    },
  });
  // 온라인 기능은 설정이 없으면 버튼을 숨긴다. 로컬 집/오프라인 링크는 항상 독립적으로 작동한다.
  createOnlineUI({
    store, visitorUid: onlineGuestOwner, readOnly: guest,
    blocked: () => (!guest && newerHouse() ? lockText() : null), // 새 판의 집이면 빠진 배치로 온라인 집을 덮지 않는다
    openShare: (link, options) => ui.openShare(link, options),
    toast: (message, kind) => ui.toast(message, kind),
  });
  // 숲에서 주운 것은 가진 만큼만 놓는다. 새로 놓을 때만 보고, 되돌리기·다시 하기는 막지 않는다(gathering.js checkFoundCommands)
  let gathering = null;
  const history = createHistory(store, { guard: (cmds) => (gathering ? checkFoundCommands(store.state, gathering.store.state, cmds) : { ok: true }) }); // 처음 놓인 가구는 기록에 넣지 않는다
  // 낚시. 기록은 이 브라우저에 집과 따로 저장한다. 친구 집을 구경하는 중에도 내 낚시 기록에 남는다
  const pondView = createPondView({ view, figure: character.figure });
  const fishing = createFishing({
    character, ui, audio, haptics, storage: openStorage(), catchCard: createCatchCard(),
    pondView,
    onChange: () => { input?.syncUI(); fishingUI?.sync(); },
  });
  // 숲에서 줍기(4단계 채집). 기록은 집·낚시 기록과 따로 이 브라우저에 둔다. 친구 집을 구경하는 중에도 내 기록에 남는다
  gathering = createGathering({ character, view, ui, audio, haptics, storage: openStorage() });
  // 꾸미기 목록의 주운 것 칸에 남은 수를 보인다. 집이 바뀌거나 더 주우면 고친다
  const showFound = () => ui.setFound(foundCounts(store.state, gathering.store.state));
  store.subscribe(showFound);
  gathering.subscribe(showFound);
  showFound();
  fishingUI = createFishingUI({ fishing, gathering, store, guest, toast: (message) => ui.toast(message) });
  input = createInput({ canvas, view, store, history, character, ui, audio, haptics, travel, fishing, gathering, wreathUI, hintMemory, readOnly: guest });
  history.subscribe((status) => ui.setHistory(status));
  ui.setHistory(history.status());
  if (!guest && handed?.mode === 'build') input.setMode('build');
  ui.loaded();
  // 시작 화면에는 숲 입구가 보이지 않는다. 표지판을 마당으로 옮기는 대신
  // 첫 방문에만 짧은 길 안내를 보여 가구 배치의 자유를 지킨다.
  try {
    if (!guest && character.place === 'yard' && !window.localStorage.getItem('maeul:forest-hint-seen')) {
      ui.toast('집 왼편으로 걸어가면 작은 숲길이 있어요. 날마다 다른 발견이 기다립니다.');
      window.localStorage.setItem('maeul:forest-hint-seen', '1');
    }
  } catch { /* 저장소가 막힌 환경에서는 안내를 생략한다. */ }

  // ---- 자동 저장: 오래된 탭이 새로 가져온 집/보관본을 덮어쓰지 않게 검사한다 ----
  let saveTimer = 0;
  function stopStaleTab() {
    if (switchingHouse) return;
    switchingHouse = true;
    clearTimeout(saveTimer);
    saveTimer = 0;
    ui.setSaveStatus('conflict');
    ui.toast('다른 탭에서 집이 바뀌었습니다. 이 탭에서는 저장하지 않습니다. 다시 열어 주세요', 'error');
  }
  // 더 새로운 판에서 저장한 집을 읽었으면 이 화면에서는 저장하지 않는다(save.js createSaver 의 locked, PR #42 GPT 검토 1)
  const newerLock = () => { clearTimeout(saveTimer); saveTimer = 0; ui.setSaveStatus(saver.lockReason === 'backup' ? 'held' : 'newer'); return false; };
  const saveNow = () => {
    if (guest || switchingHouse) return false;
    if (!saver.available) { ui.setSaveStatus('off'); return false; }
    if (saver.locked) return newerLock();
    if (!saveGuard.isCurrent()) { stopStaleTab(); return false; }
    clearTimeout(saveTimer);
    saveTimer = 0;
    const ok = saver.save(store.state, { place: character.place, pos: { x: character.pos.x, z: character.pos.z } });
    if (ok) saveGuard.refresh();
    if (!ok && saver.locked) return newerLock();
    ui.setSaveStatus(ok ? 'saved' : 'off');
    return ok;
  };
  function saveSoon() {
    if (guest || switchingHouse || !saver.available) return;
    if (saver.locked) { newerLock(); return; }
    if (!saveGuard.isCurrent()) { stopStaleTab(); return; }
    ui.setSaveStatus('pending');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  if (!guest) {
    store.subscribe(saveSoon);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    window.addEventListener('storage', (event) => {
      if (event.storageArea === storage &&
          (event.key === null || HOUSE_STORAGE_KEYS.includes(event.key)) &&
          !saveGuard.isCurrent()) stopStaleTab();
    });
  }
  ui.setSaveStatus(transferError ? 'conflict' : guest ? 'guest' : saver.locked ? (saver.lockReason === 'backup' ? 'held' : 'newer') : (saver.available ? 'saved' : 'off'));
  if (transferError) ui.toast(transferError, 'error');
  if (shareError) ui.toast(`공유 링크 오류: ${shareError}. 내 집으로 열었습니다`, 'error');
  // 뺀 것의 원문을 남겼는지에 따라 알림이 다르다. 남기지 못했으면 남겼다고 말하지 않는다(PR #48 GPT 재검토)
  if (saver.locked && saver.lockReason === 'backup') ui.toast(`저장된 것 가운데 ${loaded.dropped}개는 지금 규칙에 맞지 않아 빼고 불러왔습니다. 원래 저장 내용을 따로 남기지 못해 이 화면에서는 저장하지 않습니다. 저장 공간을 비운 뒤 새로 고쳐 주세요`, 'error');
  else if (saver.locked) ui.toast('이 집은 더 새로운 판의 게임에서 저장되었습니다. 이 화면에서는 저장하지 않으니 새로 고쳐 주세요', 'error');
  else if (loaded && !loaded.ok) ui.toast(`${loaded.reason}. 처음 배치로 시작합니다`, 'error');
  else if (loaded?.dropped) ui.toast(`저장된 것 가운데 ${loaded.dropped}개는 지금 규칙에 맞지 않아 빼고 불러왔습니다. 원래 저장 내용은 따로 남겨 두었습니다`, 'error');
  else if (fishing.loadProblem) ui.toast(fishing.loadProblem, 'error');
  else if (gathering.loadProblem) ui.toast(gathering.loadProblem, 'error');

  let last = performance.now();
  let wasSeated = null;
  let forestCheckTime = 0;
  let forestCurrentDay = koreaDay();
  let forestSite = todaysDiscoverySite();
  let forestCueTime = 3.5; // 처음 단서는 3초쯤 뒤에
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dir = input.state.mode === 'walk' || character.place === 'yard' ? input.moveDirection() : input.moveDirection();
    if (dir) { pending = null; fishing.cancel(); } // 방향 키로 걸으면 낚시를 그만둔다
    character.update(dt, dir);
    fishing.update(dt);
    // 숲의 주울 거리: 가까이 가면 줍는다(4단계 채집). 오늘의 발견(금빛 고리)은 주울 때 발견하는 순간의 연출이 난다
    gathering.update(dt);
    forestCheckTime += dt;
    if (forestCheckTime >= 5) {
      forestCheckTime = 0;
      const nextDay = koreaDay();
      if (nextDay !== forestCurrentDay) { forestCurrentDay = nextDay; forestSite = todaysDiscoverySite(); }
    }
    // 오늘의 발견을 아직 찾지 못했으면 가끔 바람에 날린 잎이 숲 쪽으로 흘러간다 (1-10, 움직이는 것으로 길 안내).
    // 낚시하는 동안, 꾸미는 동안, 앉아 있을 때는 내지 않는다
    forestCueTime += dt;
    if (forestCueTime >= 6.5) {
      forestCueTime = 0;
      if (character.place === 'yard' && !busy && !gathering.pickedToday(SPECIAL_ID) && fishing.phase === 'idle' &&
          input.state.mode === 'walk' && !character.seated) {
        view.forest.cue(forestCue(character.pos, forestSite, houseRect(store.state.house.level)));
      }
    }
    // 앉거나 일어나면 안내를 바꾼다
    const seated = character.seated?.id ?? null;
    if (seated !== wasSeated) { wasSeated = seated; input.syncUI(); if (seated) audio.play('sit'); }
    if (!busy) {
      if (character.place === 'yard') {
        view.setCloseUp(fishing.focus()); // 낚시하는 동안은 물가와 찌 사이를 가까이 본다
        // 찌, 캐릭터 몸, 가까이 있는 오늘의 발견물이 나뭇잎에 가리면 그 나무를 비친다.
        // 2026-11-24: 카메라를 돌리면 숲 앞쪽 나무가 캐릭터와 발견물을 함께 가렸다(PR #37 검토)
        const watch = pondView.watchPoints;
        watch.push({ x: character.pos.x, y: 0.8, z: character.pos.z }, { x: character.pos.x, y: 1.4, z: character.pos.z });
        // 가까이 있는 주울 거리(오늘의 발견과 땅의 것)도 나뭇잎에 가리면 비친다
        for (const f of gathering.left) {
          if (Math.hypot(character.pos.x - f.x, character.pos.z - f.z) > 7) continue;
          if (f.special) watch.push({ x: f.x, y: 0.85, z: f.z }, { x: f.x, y: 0.3, z: f.z });
          else watch.push({ x: f.x, y: 0.2, z: f.z });
        }
        view.setWatch(watch);
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
  window.claude?.hot?.snapshot?.(() => guest || switchingHouse ? {} : ({ state: store.state, place: character.place, pos: { ...character.pos }, mode: input.state.mode }));
  window.__game = { store, view, character, input, history, saveNow, travel, fishing, gathering, haptics, wreathUI, hintMemory, fishingUI, ui, pondWatch: () => pondView.watchPoints };
  window.__ready = true;
}

if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
