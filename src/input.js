// 조작. 포인터와 키 입력을 명령으로 바꿔 store 에 보낸다.
// 꾸미기 모드에서 놓는 것은 가구뿐이다. 바닥재, 벽지, 집의 겉모습, 집 키우기는 버튼으로 고른다.
import { PARTS, LEVELS, MAX_LEVEL } from './parts.js';
import { cellKey, clearCommands, layerOf, seatSpots } from './state.js';
import { sampleCommands } from './sample.js';

const KEY_HINTS = {
  walkYard: '땅을 누르거나 WASD로 걷습니다. 집을 누르면 안으로 들어갑니다.',
  walkRoom: '바닥을 누르거나 WASD로 걷고, 의자를 누르면 앉습니다. 현관 깔개를 누르면 밖으로 나갑니다.',
  seated: '앉았습니다. 다른 곳을 누르거나 걸으면 일어납니다.',
  select: '가구를 눌러 집은 뒤 옮길 자리를 누릅니다. R로 돌립니다.',
  erase: '치울 가구를 누릅니다. 끌면 이어서 치웁니다.',
  object: '누른 칸에 놓습니다. R로 돌립니다.',
  top: '탁자나 수납장 위를 누르면 올려놓습니다. R로 돌립니다.',
  wallitem: '벽을 누르면 그 자리에 겁니다.',
  carry: '옮길 자리를 누릅니다. R로 돌리고 Esc로 그만둡니다.',
};
// 손가락으로 쓰는 기기에서는 키 이름 대신 버튼과 손동작으로 안내한다
const TOUCH_HINTS = {
  walkYard: '땅을 누르면 그곳으로 걸어갑니다. 집을 누르면 안으로 들어갑니다.',
  walkRoom: '바닥을 누르면 걷고, 의자를 누르면 앉습니다. 현관 깔개를 누르면 밖으로 나갑니다.',
  seated: '앉았습니다. 다른 곳을 누르면 일어납니다.',
  select: '가구를 눌러 집은 뒤 옮길 자리를 누릅니다. 끌어서 바로 옮겨도 됩니다.',
  erase: '치울 가구를 누릅니다. 끌면 이어서 치웁니다.',
  object: '누른 채 움직여 자리를 고르고, 떼면 놓입니다. 놓은 뒤 돌리기 버튼으로 돌립니다.',
  top: '탁자나 수납장 위를 누르면 올려놓습니다. 누른 채 움직여 자리를 고를 수 있습니다.',
  wallitem: '벽을 누른 채 자리를 고르고, 떼면 걸립니다.',
  carry: '옮길 자리를 누릅니다. 돌리기와 그만두기 버튼을 쓸 수 있습니다.',
};

export function createInput({ canvas, view, store, history, character, ui, audio, travel, readOnly = false }) {
  const s = { mode: 'walk', tool: 'select', rot: 0, drag: null, carry: null, pointer: null, press: null, lastPlaced: null };
  const keys = new Set();
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hints = coarse ? TOUCH_HINTS : KEY_HINTS;
  const here = () => character.place; // 지금 있는 곳 ('yard' 또는 'main')
  const objectsHere = () => store.state.spaces[here()].objects;

  // 도구의 종류: 'select', 'erase', 바닥에 놓는 'object', 올려놓는 'top', 벽에 거는 'wallitem'
  const kindOfPart = (partId) => ({ wall: 'wallitem', top: 'top' }[layerOf(partId)] || 'object');
  const toolKind = () => (PARTS[s.tool] ? kindOfPart(s.tool) : s.tool);
  const placing = () => ['object', 'top', 'wallitem'].includes(toolKind());
  function hintFor() {
    if (s.mode === 'walk') return character.seated ? hints.seated : here() === 'yard' ? hints.walkYard : hints.walkRoom;
    if (s.carry) return hints.carry;
    return hints[toolKind()] || '';
  }
  function syncUI() {
    ui.setMode(s.mode);
    ui.setTool(s.tool);
    ui.setHint(hintFor());
    ui.setCarrying(!!s.carry);
    ui.setPlace(here(), store.state);
  }

  function cancel() {
    s.drag = null;
    history.end();
    if (s.carry) { s.carry = null; view.setHidden(null); }
    view.clearGhosts();
  }
  function setMode(mode) {
    if (readOnly && mode === 'build') return; // 공유된 집은 걷기와 구경만 가능
    if (mode === s.mode) return;
    cancel();
    s.mode = mode;
    view.setGrid(mode === 'build');
    character.stop();
    audio.play('step');
    syncUI();
  }
  function setTool(tool) {
    if (readOnly) return;
    cancel();
    s.tool = tool;
    if (s.mode !== 'build') setMode('build');
    syncUI();
    refresh();
  }

  // ---- 포인터 위치 해석 ----
  function locate(e) {
    const pt = view.groundPoint(e.clientX, e.clientY);
    if (!pt) return null;
    return { pt, u: pt.x, v: pt.z, cx: Math.floor(pt.x), cy: Math.floor(pt.z), clientX: e.clientX, clientY: e.clientY };
  }
  // 차지할 칸들의 가운데가 포인터에 오도록 자리를 잡는다
  function objectOrigin(partId, rot, u, v) {
    const [sw, sh] = PARTS[partId].size;
    const [fw, fh] = rot % 2 === 0 ? [sw, sh] : [sh, sw];
    return { x: Math.round(u - fw / 2), y: Math.round(v - fh / 2) };
  }
  // 물건이 놓일 자리: 벽에 거는 것은 벽과 벽 칸, 나머지는 칸과 방향. 가리키는 곳이 없으면 null
  function targetFor(partId, rot, at) {
    if (layerOf(partId) === 'wall') return view.wallPoint(at.clientX, at.clientY, PARTS[partId].span);
    return { ...objectOrigin(partId, rot, at.u, at.v), rot };
  }
  function objectAt(at) {
    const hit = view.pick(at.clientX, at.clientY);
    if (hit) return hit;
    const key = cellKey(at.cx, at.cy);
    const occ = store.derived.occ[here()];
    const id = occ.top.get(key) || occ.furniture.get(key) || occ.rug.get(key);
    return id ? { type: 'object', id } : null;
  }

  // ---- 미리보기 ----
  function refresh() {
    const at = s.pointer;
    if (s.mode === 'build' && s.carry && !at) {
      // 손가락을 뗀 동안에도 들고 있는 가구가 보이도록 원래 자리에 그린다
      const obj = objectsHere()[s.carry.id];
      if (obj) view.showGhosts([{ type: 'object', part: obj.part, x: obj.x, y: obj.y, wall: obj.wall, i: obj.i, rot: s.carry.rot, tone: 'select' }]);
      return;
    }
    if (s.mode !== 'build' || !at) { view.clearGhosts(); return; }
    const kind = toolKind();
    const ghosts = [];
    if (s.carry) {
      const t = targetFor(s.carry.part, s.carry.rot, at);
      if (t) ghosts.push({ type: 'object', part: s.carry.part, ...t, valid: store.can({ type: 'moveObject', space: here(), id: s.carry.id, ...t }).ok });
    } else if (placing()) {
      const t = targetFor(s.tool, s.rot, at);
      if (t) ghosts.push({ type: 'object', part: s.tool, ...t, valid: store.can({ type: 'placeObject', space: here(), id: '-', part: s.tool, ...t }).ok });
    } else if (kind === 'erase' || kind === 'select') {
      const ref = objectAt(at);
      if (ref) ghosts.push({ type: 'highlight', ref, tone: kind });
    }
    view.showGhosts(ghosts);
  }

  function fail(result) {
    ui.toast(result.reason, 'error');
    audio.play('error');
  }

  // ---- 포인터 ----
  // 가구는 누를 때가 아니라 뗄 때 놓는다. 손가락으로 누른 채 자리를 고를 수 있다.
  const NO_WALL = { ok: false, reason: '보이는 벽을 눌러 주세요' };
  function placeCarry(at) {
    const t = targetFor(s.carry.part, s.carry.rot, at);
    if (!t) { fail(NO_WALL); return; }
    const id = s.carry.id;
    const obj = objectsHere()[id];
    const same = obj && Object.keys(t).every((k) => obj[k] === t[k]); // 제자리에 내려놓으면 기록하지 않는다
    const r = same ? { ok: true } : history.run([{ type: 'moveObject', space: here(), id, ...t }]);
    if (!r.ok) { fail(r); return; }
    s.carry = null;
    s.lastPlaced = id;
    view.setHidden(null);
    view.pop({ id });
    syncUI();
  }
  function placeTool(at) {
    const t = targetFor(s.tool, s.rot, at);
    if (!t) { fail(NO_WALL); return; }
    const id = store.nextId();
    const r = history.run([{ type: 'placeObject', space: here(), id, part: s.tool, ...t, by: store.playerId }]);
    if (r.ok) s.lastPlaced = id; else fail(r);
  }
  const eraseAt = (at) => { const ref = objectAt(at); if (ref) history.run([{ type: 'removeObject', space: here(), id: ref.id }]); };

  // 걷는 중에 의자를 눌렀으면 가서 앉는다. 앉아 있던 자리를 다시 누르면 일어난다. 의자가 아니면 false
  function trySit(hit, at) {
    const seatAt = (id) => { const obj = objectsHere()[id]; return obj && PARTS[obj.part].seat ? obj : null; };
    // 가구를 바로 눌렀거나, 의자가 놓인 칸의 바닥을 눌렀을 때
    const obj = seatAt(hit?.ref?.id) || seatAt(store.derived.occ[here()].furniture.get(cellKey(at.cx, at.cy)));
    if (!obj) return false;
    const near = hit?.ref?.id === obj.id ? hit.point : at.pt;
    let index = 0, bestDist = Infinity;
    seatSpots(obj).forEach((spot, i) => {
      const d = Math.hypot(spot.x - near.x, spot.z - near.z);
      if (d < bestDist) { bestDist = d; index = i; }
    });
    const now = character.seated;
    if (now && now.id === obj.id && now.index === index) character.stop();
    else if (!character.sit(obj.id, index)) { ui.toast('의자 옆에 설 자리가 없습니다'); audio.play('error'); }
    return true;
  }

  // 두 손가락: 벌리고 오므려 확대와 축소. 그동안 하던 동작은 그만둔다.
  const touches = new Map();
  let pinch = null;
  let locked = false; // 두 손가락 동작이 끝나고 남은 손가락은 아무 일도 하지 않는다
  const pinchDistance = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  function onDown(e) {
    audio.unlock();
    if (e.button === 2) { cancel(); syncUI(); return; }
    if (e.button !== 0) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size >= 2) {
      if (s.drag?.type === 'pick') { s.carry = null; view.setHidden(null); syncUI(); }
      s.drag = null; s.press = null; history.end();
      pinch = { dist: pinchDistance() };
      locked = true;
      refresh();
      return;
    }
    canvas.setPointerCapture?.(e.pointerId);
    const at = locate(e);
    s.pointer = at;
    s.press = { x: e.clientX, y: e.clientY };
    if (!at || s.mode !== 'build') return;
    const kind = toolKind();
    if (s.carry) {
      s.drag = { type: 'aim' };
    } else if (kind === 'select') {
      const ref = objectAt(at);
      if (ref) {
        const obj = objectsHere()[ref.id];
        s.carry = { id: obj.id, part: obj.part, rot: obj.rot };
        s.drag = { type: 'pick' };
        view.setHidden(obj.id);
        syncUI();
      }
    } else if (placing()) {
      s.drag = { type: 'aim' };
    } else if (kind === 'erase') {
      s.drag = { type: 'erase' };
      history.begin(); // 끌며 치운 것은 한 번에 되돌린다
      eraseAt(at);
    }
    refresh();
  }

  function onMove(e) {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size >= 2) {
      const dist = pinchDistance();
      if (dist > 10 && pinch.dist > 10) view.zoomBy(pinch.dist / dist);
      pinch.dist = dist;
      return;
    }
    if (locked) return;
    const at = locate(e);
    s.pointer = at;
    // 집은 채로 끌면 그대로 옮기는 동작이 된다
    if (s.drag?.type === 'pick' && s.press && Math.hypot(e.clientX - s.press.x, e.clientY - s.press.y) > 10) s.drag = { type: 'aim' };
    if (s.mode === 'build' && at && s.drag?.type === 'erase') eraseAt(at);
    refresh();
  }

  function onUp(e) {
    touches.delete(e.pointerId);
    if (locked) {
      if (touches.size < 2) pinch = null;
      if (touches.size === 0) locked = false;
      return;
    }
    const at = locate(e) || s.pointer;
    const press = s.press;
    s.press = null;
    if (s.mode === 'walk') {
      if (!at || !press || Math.hypot(e.clientX - press.x, e.clientY - press.y) >= 8) return;
      // 집이나 현관 깔개를 누르면 그리로 걸어가 드나든다
      const hit = view.pickFront(e.clientX, e.clientY);
      if (hit?.special) { travel.walkToDoor(); return; }
      travel.cancel(); // 드나들려고 걷던 중이었으면 그만둔다
      if (trySit(hit, at)) return;
      if (character.goTo(at.pt.x, at.pt.z)) view.showMarker(at.pt.x, at.pt.z);
      return;
    }
    const drag = s.drag;
    s.drag = null;
    history.end();
    if (drag?.type === 'aim' && at) { if (s.carry) placeCarry(at); else placeTool(at); }
    refresh();
  }

  function onCancel(e) {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (touches.size === 0) locked = false;
    s.drag = null; s.press = null; history.end();
    refresh();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS 에서 화면 전체가 확대되지 않게
  canvas.addEventListener('pointerleave', () => { if (!s.drag) { s.pointer = null; refresh(); } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });

  // ---- 키 ----
  const MOVE_KEYS = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  function rotate() {
    const last = objectsHere()[s.lastPlaced];
    if ((s.carry && layerOf(s.carry.part) === 'wall') || (!s.carry && toolKind() === 'wallitem')) { ui.toast('벽에 거는 것은 돌리지 않습니다'); return; }
    if (s.carry) s.carry.rot = (s.carry.rot + 1) & 3;
    else if (!s.pointer && last && placing() && layerOf(last.part) !== 'wall') {
      // 미리보기가 없는 터치에서는 방금 놓은 가구를 제자리에서 돌린다
      const rot = (last.rot + 1) & 3;
      const r = history.run([{ type: 'moveObject', space: here(), id: last.id, x: last.x, y: last.y, rot }]);
      if (r.ok) { s.rot = rot; view.pop({ id: last.id }); } else fail(r);
    } else s.rot = (s.rot + 1) & 3;
    refresh();
  }
  function undo() {
    cancel(); // 들고 있던 가구는 내려놓는다
    const r = history.undo();
    if (!r.ok) ui.toast(r.reason, r.reason === '되돌릴 것이 없습니다' ? 'info' : 'error');
    syncUI();
    refresh();
  }
  function redo() {
    cancel();
    const r = history.redo();
    if (!r.ok) ui.toast(r.reason, r.reason === '다시 할 것이 없습니다' ? 'info' : 'error');
    syncUI();
    refresh();
  }
  window.addEventListener('keydown', (e) => {
    if (!document.getElementById('share-layer').hidden ||
        !document.getElementById('online-layer').hidden) return; // 대화창 뒤에서는 게임 키 조작을 막는다
    // Ctrl+Z 되돌리기, Ctrl+Shift+Z 또는 Ctrl+Y 다시 하기 (맥은 Cmd)
    if (!readOnly && (e.ctrlKey || e.metaKey) && !e.altKey && (e.code === 'KeyZ' || e.code === 'KeyY')) {
      e.preventDefault();
      if (e.code === 'KeyY' || e.shiftKey) redo(); else undo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (MOVE_KEYS[e.code]) { keys.add(MOVE_KEYS[e.code]); e.preventDefault(); return; }
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyB': case 'Tab': setMode(s.mode === 'build' ? 'walk' : 'build'); e.preventDefault(); break;
      case 'KeyR': if (!readOnly) rotate(); break;
      case 'KeyQ': view.rotateCamera(-1); refresh(); break;
      case 'KeyE': view.rotateCamera(1); refresh(); break;
      case 'Escape': if (s.carry || s.drag) { cancel(); syncUI(); } else if (s.mode === 'build') setTool('select'); break;
      default: return;
    }
  });
  window.addEventListener('keyup', (e) => { if (MOVE_KEYS[e.code]) keys.delete(MOVE_KEYS[e.code]); });
  window.addEventListener('blur', () => keys.clear());

  store.subscribe((cmd, meta) => {
    if (cmd.type === 'replace') { syncUI(); return; }
    if (!meta.batch || meta.last) audio.play(cmd.type === 'removeObject' ? 'remove' : 'place');
    if (cmd.type === 'placeObject') view.pop({ id: cmd.id });
    if (cmd.type === 'setLevel' || cmd.type === 'setFinish' || cmd.type === 'setExterior') ui.setPlace(here(), store.state);
  });

  syncUI();

  return {
    state: s, setMode, setTool, rotate, refresh, undo, redo, syncUI,
    cancelCarry() { cancel(); syncUI(); refresh(); },
    // 곳이 바뀔 때 하던 동작을 정리한다
    leavePlace() { cancel(); s.pointer = null; s.lastPlaced = null; if (toolKind() === 'wallitem') s.tool = 'select'; },
    // 보기에서 고르는 것들: 바닥재, 벽지, 겉모습
    choose(cmd) {
      const r = history.run([cmd]);
      if (!r.ok && !r.reason?.startsWith('이미 그')) fail(r);
      syncUI();
    },
    upgrade() {
      const level = store.state.house.level;
      if (level >= MAX_LEVEL) { ui.toast('더 키울 수 없습니다'); return; }
      const r = history.run([{ type: 'setLevel', level: level + 1 }]);
      if (r.ok) ui.toast(`${LEVELS[level + 1].label}으로 키웠습니다. 방이 넓어졌습니다`);
      else fail(r);
      syncUI();
    },
    clearAll() {
      cancel();
      const cmds = clearCommands(store.state, here());
      if (!cmds.length) { ui.toast('치울 가구가 없습니다'); return; }
      history.run(cmds);
      ui.toast(`${here() === 'yard' ? '마당' : '방'}의 가구를 모두 치웠습니다. 되돌리기로 되살릴 수 있습니다`);
      syncUI();
      refresh();
    },
    // 가구를 모두 치우고 처음 배치를 다시 놓는다. 집의 단계와 고른 색은 그대로 둔다
    resetToSample() {
      cancel();
      history.begin();
      history.run([...clearCommands(store.state, 'main'), ...clearCommands(store.state, 'yard')]);
      history.run(sampleCommands(store));
      history.end();
      ui.toast('가구를 처음 배치로 바꿨습니다. 되돌리기로 돌아갈 수 있습니다');
      syncUI();
      refresh();
    },
    // 눌린 이동 키를 카메라 기준의 세계 방향으로 바꾼다
    moveDirection() {
      const up = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
      const right = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      if (!up && !right) return null;
      const { forward, right: r } = view.basis();
      const x = forward.x * up + r.x * right, z = forward.z * up + r.z * right;
      const len = Math.hypot(x, z);
      return { x: x / len, z: z / len };
    },
  };
}
