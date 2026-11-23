// 규칙. 화면과 무관한 순수 자료와 함수만 둔다 (three.js 를 불러오지 않는다).
// 모든 변경은 명령(command)으로만 일어난다: validate → apply → 파생 자료 재계산 → 알림.
// 같은 명령이 나중에 서버 저장과 실시간 전달에 그대로 쓰인다.
//
// 집은 정해진 형태다. 단계(level)를 올려 키우고, 겉모습과 바닥재와 벽지는 보기에서 고른다.
// 플레이어가 놓는 것은 물건이며, 놓을 곳(space)은 마당 'yard' 와 방 'main' 이다.
// 물건은 놓이는 자리에 따라 네 가지다: 바닥의 가구, 그 아래의 러그, 가구 위의 소품, 벽에 거는 것.

import { PARTS, LEVELS, MAX_LEVEL, YARD, HOUSE_CENTER_X, HOUSE_BACK_Z, MAT_X, WINDOW_X, FLOORS, WALLPAPERS, ROOFS, SIDINGS, DOORS } from './parts.js';

export const cellKey = (x, y) => `${x},${y}`;
export const SPACES = ['yard', 'main'];
export const WALLS = ['N', 'S', 'W', 'E'];
const EXTERIOR = { roof: ROOFS, siding: SIDINGS, door: DOORS };
const FINISH = { floor: FLOORS, wall: WALLPAPERS };

// 그 객체가 직접 가진 항목인지 본다. 물려받은 이름(__proto__, toString 등)을 부품·물건으로 여기지 않는다.
// Object.hasOwn 은 오래된 브라우저(Chrome 93, Safari 15.4, 삼성 인터넷 17 이전)에 없어 쓰지 않는다
export const hasOwn = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);
// 상태(객체·배열·글자·숫자)를 깊이 복사한다. 값이 undefined 인 항목도 그대로 남긴다.
// structuredClone 은 오래된 브라우저(Chrome 98, Safari 15.4, 삼성 인터넷 18 이전)에 없어 쓰지 않는다
const cloneData = (v) => (Array.isArray(v) ? v.map(cloneData)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneData(x)])) : v);
// 명령의 물건 ID 는 비어 있지 않은 짧은 글자여야 한다 (게임이 만드는 ID 는 '플레이어-번호' 꼴)
const validId = (id) => typeof id === 'string' && id.length > 0 && id.length <= 200;
// 그 곳에 실제로 있는 물건. 곳이나 ID 가 잘못되었으면 null
const objectAt = (state, space, id) => {
  if (!SPACES.includes(space) || !validId(id)) return null;
  const objects = state.spaces[space].objects;
  return hasOwn(objects, id) ? objects[id] : null;
};

export function createState() {
  return {
    version: 2,
    house: { level: 1, roof: 'terracotta', siding: 'cream', door: 'green' },
    spaces: {
      yard: { objects: {} },
      main: { floor: 'wood', wall: 'sage', objects: {} },
    },
  };
}

// 마당에서 집이 차지하는 자리 (칸 단위)
export function houseRect(level) {
  const { w, d } = LEVELS[level].house;
  return { x0: HOUSE_CENTER_X - w / 2, z0: HOUSE_BACK_Z, w, d };
}

export function spaceSize(space, level) {
  return space === 'yard' ? [YARD.w, YARD.h] : LEVELS[level].room;
}

// 가구를 놓을 수 없는 칸: 마당에서는 집과 문 앞, 방에서는 현관 깔개
export function blockedCells(space, level) {
  const out = new Set();
  if (space === 'yard') {
    const { x0, z0, w, d } = houseRect(level);
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) out.add(cellKey(x, z));
    out.add(cellKey(HOUSE_CENTER_X - 1, z0 + d));
    out.add(cellKey(HOUSE_CENTER_X, z0 + d));
  } else {
    const h = LEVELS[level].room[1];
    out.add(cellKey(MAT_X, h - 1));
    out.add(cellKey(MAT_X + 1, h - 1));
  }
  return out;
}

// 벽: 북쪽과 남쪽 벽은 방의 가로만큼, 서쪽과 동쪽 벽은 세로만큼 칸이 있다. 칸 번호는 서쪽(또는 북쪽)에서부터 센다
export function wallLength(wall, level) {
  const [w, h] = LEVELS[level].room;
  return wall === 'N' || wall === 'S' ? w : h;
}
// 걸 수 없는 벽 칸: 북쪽 벽의 창문, 남쪽 벽의 문
export function blockedWall(wall) {
  if (wall === 'N') return [WINDOW_X, WINDOW_X + 1];
  if (wall === 'S') return [MAT_X, MAT_X + 1];
  return [];
}

export const layerOf = (partId) => PARTS[partId].layer || 'furniture';

// 물건이 차지하는 칸. rot 은 90도 단위 (0~3). 벽에 거는 것에는 쓰지 않는다
export function footprint(obj) {
  const [sw, sh] = PARTS[obj.part].size;
  const [fw, fh] = obj.rot % 2 === 0 ? [sw, sh] : [sh, sw];
  const cells = [];
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) cells.push([obj.x + i, obj.y + j]);
  return { fw, fh, cells };
}
// 벽에 건 것이 차지하는 벽 칸
export function wallCells(obj) {
  const out = [];
  for (let k = 0; k < PARTS[obj.part].span; k++) out.push(obj.i + k);
  return out;
}

// ---- 앉는 자리 ----
// 가구의 앉는 자리들. 세계 좌표 x, z 와 앉는 면의 높이 y, 바라보는 방향 face (라디안. 0 이면 +Z)
export function seatSpots(obj) {
  const part = PARTS[obj.part];
  if (!part?.seat) return [];
  const { fw, fh } = footprint(obj);
  const s = part.scale || 1, o = part.offset || [0, 0, 0];
  const cos = [1, 0, -1, 0][obj.rot], sin = [0, 1, 0, -1][obj.rot];
  const cx = obj.x + fw / 2, cz = obj.y + fh / 2;
  const lz = (part.seat.z || 0) * s + o[2];
  return (part.seat.x || [0]).map((sx) => {
    const lx = sx * s + o[0];
    return { x: cx + lx * cos + lz * sin, z: cz - lx * sin + lz * cos, y: part.seat.h * s + o[1], face: obj.rot * Math.PI / 2 };
  });
}
// 가구 둘레의 칸들. side 는 앞(0), 옆(1), 뒤(2)이고 dist 는 앉는 자리까지의 거리다.
// 앞, 옆, 뒤 순서로, 같은 쪽에서는 앉는 자리에 가까운 순서로 준다
function approachCells(obj, spot) {
  const { fw, fh } = footprint(obj);
  const [fx, fy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][obj.rot]; // 앞쪽
  const around = [];
  for (let i = 0; i < fw; i++) around.push([obj.x + i, obj.y - 1, 0, -1], [obj.x + i, obj.y + fh, 0, 1]);
  for (let j = 0; j < fh; j++) around.push([obj.x - 1, obj.y + j, -1, 0], [obj.x + fw, obj.y + j, 1, 0]);
  return around
    .map(([x, y, dx, dy]) => {
      const toward = dx * fx + dy * fy;
      return { x, y, side: toward > 0 ? 0 : toward === 0 ? 1 : 2, dist: Math.hypot(x + 0.5 - spot.x, y + 0.5 - spot.z) };
    })
    .sort((a, b) => a.side - b.side || a.dist - b.dist);
}
// 앉으러 갈 때 설 수 있는 칸들을 앞, 옆, 뒤 순서로 준다. 그 칸이 비어 있는지는 따지지 않는다
export function seatApproach(obj, spot) {
  return approachCells(obj, spot).map((c) => [c.x, c.y]);
}

// 앉는 자리 바로 옆으로 치는 거리. 의자의 앞과 옆 칸(1)과 소파 끝자리의 앞 칸(약 1.4)은 들고,
// 소파의 먼 앞 칸과 안락의자의 옆 칸(1.5 넘음)은 빠진다. 멀리서 옆으로 크게 뛰어 앉지 않게 한다
export const SEAT_REACH = 1.5;
// 앉으러 갈 칸을 고른다. steps(x, y) 는 그 칸까지의 걸음 수이고, 닿을 수 없거나 막힌 칸이면 null 이다.
// 앉는 자리 바로 옆의 앞이나 옆 칸 가운데 가장 적게 걷는 칸을 고른다. 걸음 수가 같으면 앞, 옆 순서다.
// 그런 칸에 닿을 수 없을 때만 나머지(뒤 칸, 먼 칸)를 앞, 옆, 뒤 순서로 본다. 둘 다 없으면 null
export function chooseSeatApproach(obj, spot, steps) {
  const reachable = approachCells(obj, spot)
    .map((c) => ({ ...c, steps: steps(c.x, c.y) }))
    .filter((c) => c.steps !== null && c.steps !== undefined);
  const near = reachable.filter((c) => c.side < 2 && c.dist <= SEAT_REACH);
  const pick = near.length ? near.reduce((best, c) => (c.steps < best.steps ? c : best)) : reachable[0];
  return pick ? [pick.x, pick.y] : null;
}

// 파생 자료: 곳마다의 칸 점유와 막힌 칸
export function derive(state) {
  const occ = {};
  const blocked = {};
  for (const space of SPACES) {
    occ[space] = { furniture: new Map(), rug: new Map(), top: new Map(), wall: new Map() };
    for (const obj of Object.values(state.spaces[space].objects)) {
      const layer = layerOf(obj.part);
      if (layer === 'wall') for (const k of wallCells(obj)) occ[space].wall.set(`${obj.wall}:${k}`, obj.id);
      else for (const [x, y] of footprint(obj).cells) occ[space][layer].set(cellKey(x, y), obj.id);
    }
    blocked[space] = blockedCells(space, state.house.level);
  }
  return { occ, blocked };
}

const ok = { ok: true };
const no = (reason) => ({ ok: false, reason });

// 물건 하나가 그 곳의 크기와 막힌 자리에 맞는지 (다른 물건과의 겹침은 따로 본다)
function inPlace(space, level, obj) {
  if (layerOf(obj.part) === 'wall') {
    if (space !== 'main') return no('벽에 거는 것은 방 안에서만 쓸 수 있습니다');
    const len = wallLength(obj.wall, level);
    const shut = blockedWall(obj.wall);
    for (const k of wallCells(obj)) {
      if (k < 0 || k >= len) return no('벽 밖에는 걸 수 없습니다');
      if (shut.includes(k)) return no(obj.wall === 'N' ? '창문에는 걸 수 없습니다' : '문에는 걸 수 없습니다');
    }
    return ok;
  }
  const [w, h] = spaceSize(space, level);
  const blocked = layerOf(obj.part) === 'top' ? new Set() : blockedCells(space, level);
  for (const [x, y] of footprint(obj).cells) {
    if (x < 0 || y < 0 || x >= w || y >= h) return no(space === 'yard' ? '마당 밖에는 놓을 수 없습니다' : '방 밖에는 놓을 수 없습니다');
    if (blocked.has(cellKey(x, y))) return no(space === 'yard' ? '집과 문 앞에는 놓을 수 없습니다' : '현관에는 놓을 수 없습니다');
  }
  return ok;
}

// 그 칸에서 소품을 받칠 가구 (윗면이 있는 가구) 의 ID
function supportAt(state, derived, space, x, y) {
  const id = derived.occ[space].furniture.get(cellKey(x, y));
  return id && PARTS[state.spaces[space].objects[id].part].surface ? id : null;
}

function checkObjectFits(state, derived, space, obj, ignoreId) {
  if (!hasOwn(PARTS, obj.part)) return no('놓을 수 없는 부품입니다');
  const layer = layerOf(obj.part);
  if (layer === 'wall') {
    if (!WALLS.includes(obj.wall) || !Number.isInteger(obj.i)) return no('벽의 자리가 잘못되었습니다');
    const place = inPlace(space, state.house.level, obj);
    if (!place.ok) return place;
    for (const k of wallCells(obj)) {
      const other = derived.occ[space].wall.get(`${obj.wall}:${k}`);
      if (other && other !== ignoreId) return no('이미 다른 것이 걸려 있습니다');
    }
    return ok;
  }
  if (![0, 1, 2, 3].includes(obj.rot) || !Number.isInteger(obj.x) || !Number.isInteger(obj.y)) return no('자리가 잘못되었습니다');
  const place = inPlace(space, state.house.level, obj);
  if (!place.ok) return place;
  for (const [x, y] of footprint(obj).cells) {
    if (layer === 'top' && !supportAt(state, derived, space, x, y)) return no('탁자나 수납장 위에만 놓을 수 있습니다');
    const other = derived.occ[space][layer].get(cellKey(x, y));
    if (other && other !== ignoreId) return no(layer === 'top' ? '이미 다른 소품이 있습니다' : '이미 다른 물건이 있습니다');
  }
  return ok;
}

// 명령에서 자리를 나타내는 값만 뽑는다 (벽에 거는 것은 벽과 칸 번호, 나머지는 칸과 방향)
const spot = (partId, src) => (layerOf(partId) === 'wall' ? { wall: src.wall, i: src.i } : { x: src.x, y: src.y, rot: src.rot });

export function validate(state, derived, cmd) {
  switch (cmd.type) {
    case 'placeObject': {
      if (!SPACES.includes(cmd.space)) return no('놓을 곳이 잘못되었습니다');
      if (!validId(cmd.id)) return no('물건 ID 가 잘못되었습니다');
      for (const space of SPACES) if (hasOwn(state.spaces[space].objects, cmd.id)) return no('같은 ID 가 이미 있습니다');
      return checkObjectFits(state, derived, cmd.space, cmd, null);
    }
    case 'moveObject': {
      const obj = objectAt(state, cmd.space, cmd.id);
      if (!obj) return no('물건이 없습니다');
      return checkObjectFits(state, derived, cmd.space, { part: obj.part, ...spot(obj.part, cmd) }, cmd.id);
    }
    case 'removeObject':
      return objectAt(state, cmd.space, cmd.id) ? ok : no('물건이 없습니다');
    case 'setFinish': {
      if (cmd.space !== 'main' || !hasOwn(FINISH, cmd.slot)) return no('바꿀 수 없는 곳입니다');
      if (!hasOwn(FINISH[cmd.slot], cmd.value)) return no('없는 마감입니다');
      return state.spaces.main[cmd.slot] === cmd.value ? no('이미 그 마감입니다') : ok;
    }
    case 'setExterior': {
      if (!hasOwn(EXTERIOR, cmd.slot) || !hasOwn(EXTERIOR[cmd.slot], cmd.value)) return no('없는 겉모습입니다');
      return state.house[cmd.slot] === cmd.value ? no('이미 그 겉모습입니다') : ok;
    }
    case 'setLevel': {
      if (!Number.isInteger(cmd.level) || !hasOwn(LEVELS, cmd.level)) return no(cmd.level > MAX_LEVEL ? '더 키울 수 없습니다' : '없는 단계입니다');
      if (Math.abs(cmd.level - state.house.level) !== 1) return no('한 단계씩만 바꿀 수 있습니다');
      // 집이 커지면 마당을 더 차지하고, 작아지면 방이 줄어든다. 걸리는 물건이 있으면 바꾸지 않는다
      for (const space of SPACES) {
        for (const obj of Object.values(state.spaces[space].objects)) {
          if (!inPlace(space, cmd.level, obj).ok) {
            return no(space === 'yard' ? '집이 커질 자리에 물건이 있습니다. 집 옆과 문 앞을 비워 주세요' : '줄어들 방 밖에 물건이 있습니다');
          }
        }
      }
      return ok;
    }
    default:
      return no(`모르는 명령입니다: ${cmd.type}`);
  }
}

// 가구가 옮겨지거나 돌 때, 그 위의 소품이 따라갈 자리를 구한다
function carried(child, before, after) {
  const fb = footprint(before), fa = footprint(after);
  let rx = child.x + 0.5 - (before.x + fb.fw / 2), rz = child.y + 0.5 - (before.y + fb.fh / 2);
  const turns = (after.rot - before.rot + 4) % 4;
  for (let k = 0; k < turns; k++) [rx, rz] = [rz, -rx]; // 화면의 회전 방향과 같은 90도 회전
  return {
    x: Math.round(after.x + fa.fw / 2 + rx - 0.5),
    y: Math.round(after.y + fa.fh / 2 + rz - 0.5),
    rot: (child.rot + turns) % 4,
  };
}

// 검증을 통과한 명령을 상태에 반영한다
export function apply(state, derived, cmd) {
  switch (cmd.type) {
    case 'placeObject': {
      const obj = { id: cmd.id, part: cmd.part, ...spot(cmd.part, cmd), by: cmd.by };
      if (layerOf(cmd.part) === 'top') obj.on = supportAt(state, derived, cmd.space, cmd.x, cmd.y);
      state.spaces[cmd.space].objects[cmd.id] = obj;
      break;
    }
    case 'moveObject': {
      const objects = state.spaces[cmd.space].objects;
      const obj = objects[cmd.id];
      const next = spot(obj.part, cmd);
      if (PARTS[obj.part].surface) {
        // 위에 올려놓은 소품이 함께 움직인다
        const before = { part: obj.part, x: obj.x, y: obj.y, rot: obj.rot };
        for (const child of Object.values(objects)) if (child.on === obj.id) Object.assign(child, carried(child, before, { part: obj.part, ...next }));
      }
      Object.assign(obj, next);
      if (layerOf(obj.part) === 'top') obj.on = supportAt(state, derived, cmd.space, cmd.x, cmd.y);
      break;
    }
    case 'removeObject': {
      const objects = state.spaces[cmd.space].objects;
      for (const child of Object.values(objects)) if (child.on === cmd.id) delete objects[child.id]; // 위의 소품도 함께 치운다
      delete objects[cmd.id];
      break;
    }
    case 'setFinish': state.spaces.main[cmd.slot] = cmd.value; break;
    case 'setExterior': state.house[cmd.slot] = cmd.value; break;
    case 'setLevel': state.house.level = cmd.level; break;
  }
}

const placeCommand = (space, o) => ({ type: 'placeObject', space, id: o.id, part: o.part, ...spot(o.part, o), by: o.by });

// 명령을 적용하기 직전의 상태를 보고, 그 명령을 되돌리는 명령들을 만든다
export function inverseOf(state, derived, cmd) {
  switch (cmd.type) {
    case 'placeObject':
      return [{ type: 'removeObject', space: cmd.space, id: cmd.id }];
    case 'moveObject': {
      const o = state.spaces[cmd.space].objects[cmd.id];
      return [{ type: 'moveObject', space: cmd.space, id: o.id, ...spot(o.part, o) }];
    }
    case 'removeObject': {
      const objects = state.spaces[cmd.space].objects;
      const children = Object.values(objects).filter((c) => c.on === cmd.id);
      return [placeCommand(cmd.space, objects[cmd.id]), ...children.map((c) => placeCommand(cmd.space, c))];
    }
    case 'setFinish':
      return [{ type: 'setFinish', space: 'main', slot: cmd.slot, value: state.spaces.main[cmd.slot] }];
    case 'setExterior':
      return [{ type: 'setExterior', slot: cmd.slot, value: state.house[cmd.slot] }];
    case 'setLevel':
      return [{ type: 'setLevel', level: state.house.level }];
    default:
      return [];
  }
}

// 한 곳의 물건을 모두 치우는 명령들. 소품을 먼저 치운다. 명령으로 치우므로 되돌릴 수 있다
export function clearCommands(state, space) {
  const objects = Object.values(state.spaces[space].objects);
  const order = (o) => (layerOf(o.part) === 'top' ? 0 : 1);
  return objects.sort((a, b) => order(a) - order(b)).map((o) => ({ type: 'removeObject', space, id: o.id }));
}

// 상태 하나를 감싸 명령 접수, 고유 ID 발급, 변경 알림을 맡는다
export function createStore(state = createState(), playerId = 'p1') {
  let derived = derive(state);
  let seq = 0;
  for (const space of SPACES) {
    for (const id of Object.keys(state.spaces[space].objects)) {
      const [owner, n] = id.split('-');
      if (owner === playerId) seq = Math.max(seq, Number(n) || 0);
    }
  }
  const listeners = new Set();
  const store = {
    playerId,
    get state() { return state; },
    get derived() { return derived; },
    nextId: () => `${playerId}-${++seq}`,
    can: (cmd) => validate(state, derived, cmd),
    // 명령 하나를 검증하고 적용한다. 통과하면 그 명령을 되돌리는 명령(inverse)도 돌려준다
    dispatch(cmd, meta = {}) {
      const result = validate(state, derived, cmd);
      if (!result.ok) return result;
      const inverse = inverseOf(state, derived, cmd);
      apply(state, derived, cmd);
      derived = derive(state);
      for (const fn of listeners) fn(cmd, meta);
      return { ok: true, inverse };
    },
    // 여러 명령을 한꺼번에 적용한다. 하나라도 통과하지 못하면 아무것도 바꾸지 않는다
    transact(cmds, meta = {}) {
      const next = cloneData(state);
      let nextDerived = derive(next);
      for (const cmd of cmds) {
        const result = validate(next, nextDerived, cmd);
        if (!result.ok) return result;
        apply(next, nextDerived, cmd);
        nextDerived = derive(next);
      }
      state = next;
      derived = nextDerived;
      cmds.forEach((cmd, i) => {
        for (const fn of listeners) fn(cmd, { ...meta, batch: cmds.length > 1, last: i === cmds.length - 1 });
      });
      return { ok: true };
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    replace(next) { state = next; derived = derive(state); for (const fn of listeners) fn({ type: 'replace' }, {}); },
  };
  return store;
}
