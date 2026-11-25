// 화면 틀: 모드 전환, 가구 목록, 고르는 보기(바닥재, 벽지, 겉모습), 안내 문구. 규칙과 3D 는 다루지 않는다.
import { PARTS, FLOORS, WALLPAPERS, ROOFS, SIDINGS, DOORS, LEVELS, MAX_LEVEL } from './parts.js';

const ICONS = {
  select: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 9l19 13-9 2 6 11-5 3-6-11-6 7z" fill="currentColor"/></svg>',
  erase: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8l12 12-18 18H12l-6-6z" fill="currentColor"/><path d="M12 38h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  upgrade: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 25L24 9l19 16-4 4-15-12L9 29z" fill="currentColor"/><path d="M13 28v12h22V28" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M24 38V29m-4 4l4-4 4 4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// 보기의 색 조각을 CSS 로 그린다
function floorChip(def) {
  const c = def.colors;
  if (def.pattern === 'checker') return `conic-gradient(${c[1]} 25%, ${c[0]} 0 50%, ${c[1]} 0 75%, ${c[0]} 0) 0 0 / 50% 50%`;
  if (def.pattern === 'planks') return `repeating-linear-gradient(0deg, ${c[0]} 0 24%, ${c[3]} 24% 26%, ${c[1]} 26% 49%, ${c[3]} 49% 51%)`;
  return c[0];
}
function wallChip(def) {
  const top = def.stripe ? `repeating-linear-gradient(90deg, ${def.stripe} 0 14%, ${def.top} 14% 33%)` : def.top;
  return `linear-gradient(${def.bottom}, ${def.bottom}) bottom / 100% 34% no-repeat, ${top}`;
}

export function createUI({ thumbs, on, guest = false, canImport = false }) {
  const $ = (id) => document.getElementById(id);
  const tools = $('tools');
  const toolButtons = new Map();
  const choiceButtons = []; // { button, read(state) → 지금 고른 값, value }
  let upgradeButton = null;

  let tab = 'furniture'; // 'furniture'(가구) 또는 'style'(방 꾸밈, 집 겉모습)
  let lastPlace = 'yard';
  function addGroup(title, where, groupTab = 'furniture') {
    const group = document.createElement('div');
    group.className = 'tool-group';
    group.dataset.where = where; // 'both', 'main'(방), 'yard'(마당)
    group.dataset.tab = groupTab;
    const name = document.createElement('span');
    name.className = 'tool-group-name';
    name.textContent = title;
    const row = document.createElement('div');
    row.className = 'tool-row';
    group.append(name, row);
    tools.appendChild(group);
    return row;
  }
  function tile(id, label, art) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.id = id;
    b.setAttribute('aria-pressed', 'false');
    const box = document.createElement('span');
    box.className = 'tool-art';
    art(box);
    const text = document.createElement('span');
    text.className = 'tool-label';
    text.textContent = label;
    b.append(box, text);
    return b;
  }
  const chip = (background) => (box) => { const c = document.createElement('span'); c.className = 'chip'; c.style.background = background; box.appendChild(c); };

  // 도구와 가구 (어디서나)
  const toolRow = addGroup('도구', 'both', 'common'); // 꾸밈 탭을 뺀 모든 탭에 보인다
  for (const [id, label] of [['select', '옮기기'], ['erase', '치우기']]) {
    const b = tile(`tool-${id}`, label, (box) => { box.innerHTML = ICONS[id]; });
    b.addEventListener('click', () => on.tool(id));
    toolRow.appendChild(b);
    toolButtons.set(id, b);
  }
  // 물건은 놓이는 자리에 따라 세 탭으로 나눈다
  const rows = {
    furniture: addGroup('가구', 'both', 'furniture'),
    top: addGroup('올려놓는 소품', 'both', 'props'),
    // 숲에서 주운 것 (4단계, 2026-11-25 사용자 결정). 가진 만큼만 놓는다. 이름 옆에 더 놓을 수 있는 수를 적는다(setFound)
    found: addGroup('숲에서 주운 것', 'both', 'props'),
    wall: addGroup('벽에 거는 것', 'main', 'wall'),
  };
  for (const [id, part] of Object.entries(PARTS)) {
    const b = tile(`tool-${id}`, part.label, (box) => { if (thumbs[id]) { const img = new Image(); img.src = thumbs[id]; img.alt = ''; box.appendChild(img); } });
    b.addEventListener('click', () => on.tool(id));
    (part.found ? rows.found : rows[part.layer] || rows.furniture).appendChild(b);
    toolButtons.set(id, b);
  }

  // 고르는 보기
  function addChoices(title, where, prefix, defs, chipOf, read, command) {
    const row = addGroup(title, where, 'style');
    for (const [value, def] of Object.entries(defs)) {
      const b = tile(`${prefix}-${value}`, def.label, chip(chipOf(def)));
      b.addEventListener('click', () => on.choose(command(value)));
      row.appendChild(b);
      choiceButtons.push({ button: b, read, value });
    }
  }
  addChoices('바닥재', 'main', 'floor', FLOORS, floorChip, (st) => st.spaces.main.floor, (value) => ({ type: 'setFinish', space: 'main', slot: 'floor', value }));
  addChoices('벽지', 'main', 'wall', WALLPAPERS, wallChip, (st) => st.spaces.main.wall, (value) => ({ type: 'setFinish', space: 'main', slot: 'wall', value }));
  const houseRow = addGroup('집', 'yard', 'style');
  upgradeButton = tile('upgrade', '집 키우기', (box) => { box.innerHTML = ICONS.upgrade; });
  upgradeButton.addEventListener('click', () => on.upgrade());
  houseRow.appendChild(upgradeButton);
  addChoices('지붕', 'yard', 'roof', ROOFS, (d) => d.color, (st) => st.house.roof, (value) => ({ type: 'setExterior', slot: 'roof', value }));
  addChoices('외벽', 'yard', 'siding', SIDINGS, (d) => d.color, (st) => st.house.siding, (value) => ({ type: 'setExterior', slot: 'siding', value }));
  addChoices('문', 'yard', 'door', DOORS, (d) => d.color, (st) => st.house.door, (value) => ({ type: 'setExterior', slot: 'door', value }));

  const TABS = ['furniture', 'props', 'wall', 'style'];
  function showGroups() {
    if (tab === 'wall' && lastPlace === 'yard') tab = 'furniture'; // 마당에는 벽이 없다
    for (const group of tools.children) {
      const inTab = group.dataset.tab === tab || (group.dataset.tab === 'common' && tab !== 'style');
      group.hidden = !inTab || (group.dataset.where !== 'both' && group.dataset.where !== lastPlace);
    }
    for (const name of TABS) $(`tab-${name}`).setAttribute('aria-pressed', String(tab === name));
    $('tab-wall').hidden = lastPlace === 'yard';
    $('tab-style').textContent = lastPlace === 'yard' ? '집 겉모습' : '바닥과 벽지';
  }
  for (const name of TABS) $(`tab-${name}`).addEventListener('click', () => { tab = name; showGroups(); tools.scrollLeft = 0; });

  $('mode-walk').addEventListener('click', () => on.mode('walk'));
  $('mode-build').addEventListener('click', () => on.mode('build'));
  $('cam-left').addEventListener('click', () => on.camera(-1));
  $('cam-right').addEventListener('click', () => on.camera(1));
  $('zoom-in').addEventListener('click', () => on.zoom(1 / 1.2));
  $('zoom-out').addEventListener('click', () => on.zoom(1.2));
  $('rotate-part').addEventListener('click', () => on.rotate());
  $('clear-all').addEventListener('click', () => on.clear());
  $('undo').addEventListener('click', () => on.undo());
  $('redo').addEventListener('click', () => on.redo());
  $('sample').addEventListener('click', () => on.sample());
  $('cancel-carry').addEventListener('click', () => on.cancelCarry());
  $('place-toggle').addEventListener('click', () => on.travel());
  $('share-house').addEventListener('click', () => canImport ? on.importHouse() : on.share());
  $('my-home').addEventListener('click', () => on.home());
  // 공유 링크(#home=)에서만 복사 버튼을 제공하고 Firebase 방문 링크에서는 제공하지 않는다.
  $('share-house').hidden = guest && !canImport;
  $('share-house').textContent = canImport ? '집 가져오기' : '집 공유';
  $('my-home').hidden = !guest;
  $('mode-build').hidden = guest;
  $('sound').addEventListener('click', () => {
    const muted = on.mute();
    $('sound').setAttribute('aria-pressed', String(!muted));
    $('sound').textContent = muted ? '소리 꺼짐' : '소리 켜짐';
  });
  const help = $('help');
  $('help-toggle').addEventListener('click', () => {
    help.hidden = !help.hidden;
    $('help-toggle').setAttribute('aria-expanded', String(!help.hidden));
  });
  if (window.matchMedia('(max-width: 720px)').matches) { help.hidden = true; $('help-toggle').setAttribute('aria-expanded', 'false'); }

  // 도구 쟁반이 가리는 높이를 알려 화면 중심을 맞춘다
  const bottom = document.querySelector('.bottom');
  new ResizeObserver(() => on.inset(bottom.getBoundingClientRect().height + 12)).observe(bottom);
  // 위쪽 버튼이 가리는 높이 (낚시로 가까이 볼 때 장면을 그 아래 가운데에 둔다)
  const top = document.querySelector('.top');
  new ResizeObserver(() => on.topInset?.(top.getBoundingClientRect().bottom)).observe(top);

  let toastTimer = 0;
  function showToast(text, kind = 'info') {
    const el = $('toast');
    el.textContent = text;
    el.dataset.kind = kind;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  const shareLayer = $('share-layer');
  const shareLink = $('share-link');
  const closeShare = () => { shareLayer.hidden = true; $('share-house').focus(); };
  $('share-close').addEventListener('click', closeShare);
  $('share-restore-previous').addEventListener('click', () => on.restorePreviousHouse());
  shareLayer.addEventListener('click', (event) => { if (event.target === shareLayer) closeShare(); });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !shareLayer.hidden) { event.preventDefault(); event.stopImmediatePropagation(); closeShare(); }
  });
  $('share-copy').addEventListener('click', async () => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink.value);
        copied = true;
      }
    } catch { /* 접근이 막힌 브라우저에서는 아래 방법으로 시도한다 */ }
    if (!copied) {
      shareLink.focus();
      shareLink.select();
      try { copied = document.execCommand('copy'); } catch { /* 직접 복사할 수 있게 선택은 유지한다 */ }
    }
    showToast(copied ? '집 링크를 복사했습니다' : '링크를 길게 눌러 직접 복사해 주세요');
  });
  $('share-native').hidden = typeof navigator.share !== 'function';
  $('share-native').addEventListener('click', async () => {
    try { await navigator.share({ title: '우리 집 구경하기', url: shareLink.value }); }
    catch (error) { if (error.name !== 'AbortError') showToast('보내지 못했습니다. 주소 복사를 이용해 주세요', 'error'); }
  });

  return {
    setMode(mode) {
      $('mode-walk').setAttribute('aria-pressed', String(mode === 'walk'));
      $('mode-build').setAttribute('aria-pressed', String(mode === 'build'));
      tools.hidden = mode !== 'build';
      $('tabs').hidden = mode !== 'build';
      $('build-extras').hidden = mode !== 'build';
      $('walk-extras').hidden = mode !== 'walk';
      document.body.dataset.mode = mode;
    },
    setTool(tool) {
      for (const [id, b] of toolButtons) b.setAttribute('aria-pressed', String(id === tool));
    },
    // 주운 것 칸: 더 놓을 수 있는 수(available)와 가진 수(owned). 0 이면 흐리게 보이지만 누를 수는 있다(누르면 왜 안 되는지 알린다)
    setFound(available, owned) {
      for (const [id, part] of Object.entries(PARTS)) {
        if (!part.found) continue;
        const b = toolButtons.get(id);
        const n = available[part.found] || 0;
        b.querySelector('.tool-label').textContent = `${part.label} ×${n}`;
        b.classList.toggle('empty', n === 0);
        b.title = `가진 것 ${owned[part.found] || 0}개 · 더 놓을 수 있는 것 ${n}개`;
      }
    },
    // 지금 있는 곳에 맞는 보기만 보이고, 고른 것을 표시한다
    setPlace(place, state) {
      document.body.dataset.place = place;
      lastPlace = place;
      showGroups();
      for (const { button, read, value } of choiceButtons) button.setAttribute('aria-pressed', String(read(state) === value));
      const level = state.house.level;
      upgradeButton.disabled = level >= MAX_LEVEL;
      upgradeButton.querySelector('.tool-label').textContent = level >= MAX_LEVEL ? '다 키웠음' : '집 키우기';
      upgradeButton.title = level >= MAX_LEVEL ? '가장 큰 집입니다' : `${LEVELS[level + 1].label}으로 키웁니다`;
      $('place-toggle').textContent = place === 'yard' ? '집 안으로' : '밖으로';
      $('place-name').textContent = place === 'yard' ? '마당' : `${LEVELS[level].label}의 방`;
      $('clear-all').textContent = place === 'yard' ? '마당 가구 치우기' : '방 가구 치우기';
    },
    setHint(text) { $('hint').textContent = text; },
    setCarrying(on) {
      const was = !$('cancel-carry').hidden;
      $('cancel-carry').hidden = !on;
      if (on && !was) $('build-extras').scrollLeft = 0; // 좁은 화면에서 그만두기 버튼이 바로 보이게
    },
    setHistory({ canUndo, canRedo }) { $('undo').disabled = !canUndo; $('redo').disabled = !canRedo; },
    setSaveStatus(status) {
      $('save-status').textContent = { saved: '자동 저장됨', pending: '저장하는 중', off: '이 브라우저에서는 저장되지 않습니다', guest: '친구 집 구경 중 · 내 집 유지', conflict: '다른 탭에서 집이 바뀌어 자동 저장 중지 · 새로고침 필요', newer: '새 판에서 저장한 집이라 자동 저장 중지 · 새로고침 필요' }[status] || '';
    },
    toast: showToast,
    openShare(link, options = {}) {
      $('share-title').textContent = options.title || '내 집 보여 주기';
      $('share-description').textContent = options.description ||
        '지금 꾸민 집을 친구가 그대로 구경할 수 있습니다. 구경하는 사람은 수정할 수 없고, 원래 자기 집도 그대로 남습니다.';
      $('share-footnote').textContent = options.footnote ||
        '이 링크는 공유한 순간의 집 모습입니다. 이후 바꾼 모습은 새 링크를 보내야 보입니다.';
      shareLink.value = link;
      const linkAvailable = typeof link === 'string' && link.length > 0;
      shareLink.hidden = !linkAvailable;
      $('share-copy').hidden = !linkAvailable;
      $('share-native').hidden = !linkAvailable || typeof navigator.share !== 'function';
      // Firebase 온라인 공유 링크(#visit=)에는 로컬 집 교환 버튼을 보이지 않는다.
      const localShare = link === '' || link.includes('#home=');
      const canSwap = !guest && localShare && on.canRestorePrevious();
      $('share-restore-previous').hidden = !canSwap;
      shareLayer.hidden = false;
      (linkAvailable ? $('share-copy') : canSwap ? $('share-restore-previous') : $('share-close')).focus();
    },
    setHouseTransition(busy) {
      $('share-restore-previous').disabled = busy;
      $('share-house').disabled = busy;
      $('my-home').disabled = busy;
    },
    loaded() { $('loading').hidden = true; },
  };
}
