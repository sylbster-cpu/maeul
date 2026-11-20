// 캐릭터. 걷기, 가구와 집에 대한 충돌, 누른 곳까지 길 찾기, 의자에 앉기. 마당과 방을 오간다.
import * as THREE from './three.js';
import { PARTS, YARD, HOUSE_CENTER_X, MAT_X, LEVELS } from './parts.js';
import { footprint, cellKey, layerOf, houseRect, seatSpots, seatApproach } from './state.js';

const RADIUS = 0.34;
const SPEED = 5.2;
const MARGIN = 3; // 마당 밖으로 걸어 나갈 수 있는 칸 수
const SIT_TIME = 0.26; // 올라앉고 일어나는 데 걸리는 시간 (초)
const SIT_SINK = 0.2; // 앉으면 몸의 아랫부분이 앉는 면 아래로 이만큼 내려간다

function buildFigure() {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0xf0a030, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf4cfa4, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 4, 12), coat);
  body.position.y = 0.62;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), skin);
  head.position.y = 1.45;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.41, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
  cap.position.y = 1.48;
  cap.rotation.x = -0.25;
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, dark); eyeL.position.set(-0.14, 1.45, 0.34);
  const eyeR = new THREE.Mesh(eyeGeo, dark); eyeR.position.set(0.14, 1.45, 0.34);
  const footGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const footL = new THREE.Mesh(footGeo, dark); footL.position.set(-0.16, 0.08, 0.05); footL.scale.set(1, 0.6, 1.35);
  const footR = new THREE.Mesh(footGeo, dark); footR.position.set(0.16, 0.08, 0.05); footR.scale.set(1, 0.6, 1.35);
  for (const m of [body, head, cap, eyeL, eyeR, footL, footR]) { m.castShadow = true; group.add(m); }
  group.userData = { footL, footR };
  return group;
}

export function createCharacter({ view, store, assets, start, place: startPlace = 'yard' }) {
  const figure = buildFigure();
  view.scene.add(figure);
  const pos = { x: start.x, z: start.z };
  let place = startPlace;
  let facing = Math.PI; // 처음에는 북쪽(집 쪽)을 본다
  let path = [];
  let stuck = 0;
  let routeBlocked = false; // 누른 바닥 칸까지 이어진 길이 없는지
  let stride = 0;
  let boxes = [];
  // 앉기. 서 있는 자리(pos)는 의자 옆 칸에 그대로 두고, 그리는 자리만 의자 위로 옮긴다.
  // 그래서 저장되는 자리와 길 찾기의 출발점은 늘 걸을 수 있는 칸이다
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let goal = null; // 앉으러 걸어가는 자리
  let seat = null; // 앉은 자리 (올라앉는 중에도)
  let anchor = null; // 그리는 데 쓰는 자리. 일어나는 동안에도 남는다
  let sitK = 0; // 0 이면 서 있고 1 이면 다 앉았다

  const roomSize = () => LEVELS[store.state.house.level].room;

  // 충돌 자료: 가구와 집은 상자
  function buildColliders() {
    boxes = [];
    if (place === 'yard') {
      const r = houseRect(store.state.house.level);
      boxes.push([r.x0, r.z0, r.x0 + r.w, r.z0 + r.d]);
    }
    for (const obj of Object.values(store.state.spaces[place].objects)) {
      if (layerOf(obj.part) !== 'furniture') continue;
      const part = PARTS[obj.part];
      const model = assets.models[part.model];
      const s = part.scale || 1, o = part.offset || [0, 0, 0];
      const { fw, fh } = footprint(obj);
      const cx = obj.x + fw / 2, cz = obj.y + fh / 2;
      const cos = Math.round(Math.cos(obj.rot * Math.PI / 2)), sin = Math.round(Math.sin(obj.rot * Math.PI / 2));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const lx of [model.min[0] * s + o[0], model.max[0] * s + o[0]]) {
        for (const lz of [model.min[2] * s + o[2], model.max[2] * s + o[2]]) {
          const wx = cx + lx * cos + lz * sin, wz = cz - lx * sin + lz * cos;
          minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
        }
      }
      boxes.push([minX, minZ, maxX, maxZ]);
    }
  }
  buildColliders();

  // 가구의 앉는 자리 하나와 그리로 갈 때 설 칸들
  function seatOf(id, index) {
    const obj = store.state.spaces[place].objects[id];
    const spot = obj && seatSpots(obj)[index];
    return spot ? { id, index, ...spot, cells: seatApproach(obj, spot) } : null;
  }
  function standNow() { goal = null; seat = null; anchor = null; sitK = 0; }
  store.subscribe(() => {
    buildColliders();
    // 앉은(앉으러 가던) 의자가 옮겨지거나 치워졌으면 일어난다
    const held = seat || goal;
    const now = held && seatOf(held.id, held.index);
    if (held && (!now || now.x !== held.x || now.z !== held.z || now.face !== held.face)) {
      if (held === goal) path = [];
      standNow();
    }
  });

  function blocked(x, z, r = RADIUS) {
    if (place === 'yard') {
      if (x < -MARGIN || z < -MARGIN || x > YARD.w + MARGIN || z > YARD.h + MARGIN) return true;
    } else {
      const [w, h] = roomSize();
      // 현관 깔개 쪽으로는 벽 밖까지 한 걸음 나갈 수 있다 (나가는 자리)
      const atDoor = x > MAT_X + r && x < MAT_X + 2 - r;
      if (x < r || x > w - r || z < r || z > (atDoor ? h + 0.5 : h - r)) return true;
    }
    for (const [minX, minZ, maxX, maxZ] of boxes) {
      const px = Math.max(minX, Math.min(x, maxX)) - x, pz = Math.max(minZ, Math.min(z, maxZ)) - z;
      if (px * px + pz * pz < r * r * 0.8) return true;
    }
    return false;
  }

  function clearLine(ax, az, bx, bz) {
    const dist = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(dist / 0.15);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  // 가구나 집이 차지해 걸을 수 없는 칸인지
  function solidCell(cx, cy) {
    if (store.derived.occ[place].furniture.has(cellKey(cx, cy))) return true;
    if (place !== 'yard') return false;
    const house = houseRect(store.state.house.level);
    return cx >= house.x0 && cx < house.x0 + house.w && cy >= house.z0 && cy < house.z0 + house.d;
  }
  // 지금 선 칸에서 걸어서 닿는 칸들을 가까운 순서로 훑는다. 칸마다 바로 앞 칸을 적어 돌려준다
  function flood(visit) {
    const [w, h] = place === 'yard' ? [YARD.w, YARD.h] : roomSize();
    const pad = place === 'yard' ? MARGIN : 0;
    const inRange = (cx, cy) => cx >= -pad && cy >= -pad && cx < w + pad && cy < h + pad;
    const sx = Math.floor(pos.x), sy = Math.min(Math.floor(pos.z), h + pad - 1);
    const prev = new Map([[cellKey(sx, sy), null]]);
    const queue = [[sx, sy]];
    for (let head = 0; head < queue.length; head++) {
      const [cx, cy] = queue[head];
      visit?.(cx, cy);
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = cx + dx, ny = cy + dy, nk = cellKey(nx, ny);
        if (!inRange(nx, ny) || prev.has(nk) || solidCell(nx, ny)) continue;
        prev.set(nk, [cx, cy]);
        queue.push([nx, ny]);
      }
    }
    return prev;
  }
  // 닿는 칸까지 거쳐 갈 칸들의 가운데. 지금 서 있는 칸은 뺀다
  function trace(prev, cell) {
    const points = [];
    for (let cur = cell; cur; cur = prev.get(cellKey(cur[0], cur[1]))) points.unshift([cur[0] + 0.5, cur[1] + 0.5]);
    points.shift();
    return points;
  }

  // 누른 곳까지 칸 단위로 길을 찾는다. 막힌 칸을 눌렀으면 가장 가까운 빈 칸으로 간다. 앉아 있었으면 일어난다
  function goTo(x, z) {
    goal = null; seat = null;
    let best = null, bestDist = Infinity;
    const prev = flood((cx, cy) => {
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - z);
      if (d < bestDist) { bestDist = d; best = [cx, cy]; }
    });
    // 기존 집에서 가구가 길을 막더라도 저장된 배치를 함부로 바꾸지 않는다.
    // 가장 가까이 걸을 수는 있지만, 목적지까지 이어지지 않는 사실은 조작 화면에 알린다.
    routeBlocked = !prev.has(cellKey(Math.floor(x), Math.floor(z)));
    const points = trace(prev, best);
    if (Math.floor(x) === best[0] && Math.floor(z) === best[1] && !blocked(x, z)) points.push([x, z]);
    path = points;
    stuck = 0;
    return points.length > 0;
  }

  // 의자 옆의 빈 칸까지 걸어가 앉는다. 설 칸에 닿을 수 없으면 false
  function sit(id, index = 0) {
    const target = seatOf(id, index);
    if (!target) return false;
    const prev = flood();
    const cell = target.cells.find(([cx, cy]) => prev.has(cellKey(cx, cy)) && !solidCell(cx, cy));
    if (!cell) return false;
    const stand = { x: cell[0] + 0.5, z: cell[1] + 0.5 };
    path = trace(prev, cell);
    if (!path.length && Math.hypot(pos.x - stand.x, pos.z - stand.z) > 0.12) path = [[stand.x, stand.z]];
    goal = { ...target, stand };
    seat = null;
    stuck = 0;
    return true;
  }

  function update(dt, inputDir) {
    let dir = null;
    if (inputDir) { path = []; goal = null; seat = null; dir = inputDir; }
    else if (path.length) {
      // 보이는 가장 먼 지점으로 곧장 걷는다
      let far = 0;
      for (let i = Math.min(path.length - 1, 8); i > 0; i--) if (clearLine(pos.x, pos.z, path[i][0], path[i][1])) { far = i; break; }
      if (far > 0) path.splice(0, far);
      const dx = path[0][0] - pos.x, dz = path[0][1] - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) path.shift();
      else dir = { x: dx / dist, z: dz / dist };
    }
    let moved = false;
    if (dir) {
      let step = SPEED * dt;
      if (!inputDir && path.length === 1) step = Math.min(step, Math.hypot(path[0][0] - pos.x, path[0][1] - pos.z));
      const nx = pos.x + dir.x * step, nz = pos.z + dir.z * step;
      const free = blocked(pos.x, pos.z); // 물건 속에 갇혔으면 빠져나올 때까지 충돌을 끈다
      if (free || !blocked(nx, nz)) { pos.x = nx; pos.z = nz; moved = true; }
      else if (!blocked(nx, pos.z)) { pos.x = nx; moved = true; }
      else if (!blocked(pos.x, nz)) { pos.z = nz; moved = true; }
      const want = Math.atan2(dir.x, dir.z);
      const diff = Math.atan2(Math.sin(want - facing), Math.cos(want - facing));
      facing += diff * Math.min(1, dt * 14);
      if (!moved && path.length) { stuck += dt; if (stuck > 0.5) path = []; } else stuck = 0;
    }
    // 앉으러 간 칸에 닿았으면 올라앉는다. 앞의 의자에서 다 일어난 뒤에 시작한다
    if (goal && !path.length && sitK === 0) {
      if (Math.hypot(pos.x - goal.stand.x, pos.z - goal.stand.z) < 0.3) seat = anchor = goal;
      goal = null;
    }
    sitK = calm ? (seat ? 1 : 0) : Math.max(0, Math.min(1, sitK + (seat ? dt : -dt) / SIT_TIME));
    if (sitK === 0 && !seat) anchor = null;
    const k = sitK * sitK * (3 - 2 * sitK);
    const a = anchor;

    stride = moved ? stride + dt * 13 : 0;
    const { footL, footR } = figure.userData;
    const swing = Math.sin(stride);
    const bob = moved ? Math.abs(swing) * 0.07 : 0;
    if (a) {
      // 선 자리에서 의자 위로 살짝 뛰어 옮겨 앉는다. 발은 앉는 면 높이에서 앞으로 뻗는다
      const hop = Math.sin(Math.PI * k) * 0.16;
      figure.position.set(pos.x + (a.x - pos.x) * k, bob + (a.y - SIT_SINK) * k + hop, pos.z + (a.z - pos.z) * k);
      figure.rotation.y = facing + Math.atan2(Math.sin(a.face - facing), Math.cos(a.face - facing)) * k;
    } else {
      figure.position.set(pos.x, bob, pos.z);
      figure.rotation.y = facing;
    }
    footL.position.set(-0.16, 0.08 + (SIT_SINK + 0.02) * k, 0.05 + swing * 0.16 + 0.37 * k);
    footR.position.set(0.16, 0.08 + (SIT_SINK + 0.02) * k, 0.05 - swing * 0.16 + 0.37 * k);
    figure.rotation.z = moved ? swing * 0.04 : 0;
    return moved;
  }

  return {
    pos, figure, update, goTo, sit,
    get place() { return place; },
    get walking() { return path.length > 0; },
    get routeBlocked() { return routeBlocked; },
    // 앉은 자리 { id, index }. 올라앉기 시작한 때부터이고, 앉으러 걸어가는 동안은 아니다
    get seated() { return seat ? { id: seat.id, index: seat.index } : null; },
    get sitAmount() { return sitK; },
    // 걸음을 멈추고, 앉아 있었으면 일어난다
    stop() { path = []; goal = null; seat = null; },
    // 다른 곳으로 옮긴다 (마당 ↔ 방)
    setPlace(next, x, z, face = facing) {
      place = next;
      pos.x = x; pos.z = z;
      facing = face;
      path = [];
      standNow();
      buildColliders();
      figure.position.set(x, 0, z);
      figure.rotation.y = facing;
    },
    teleport(x, z) { pos.x = x; pos.z = z; path = []; standNow(); },
    // 문 앞에 서 있는지 (마당), 현관 밖으로 나갔는지 (방)
    atHouseDoor() {
      if (place !== 'yard') return false;
      const r = houseRect(store.state.house.level);
      return Math.abs(pos.x - HOUSE_CENTER_X) < 0.75 && pos.z > r.z0 + r.d && pos.z < r.z0 + r.d + 0.62;
    },
    atRoomExit() {
      return place !== 'yard' && pos.z > roomSize()[1] + 0.12;
    },
  };
}
