// 캐릭터. 걷기, 가구와 집에 대한 충돌, 누른 곳까지 길 찾기. 마당과 방을 오간다.
import * as THREE from './three.js';
import { PARTS, YARD, HOUSE_CENTER_X, MAT_X, LEVELS } from './parts.js';
import { footprint, cellKey, layerOf, houseRect } from './state.js';

const RADIUS = 0.34;
const SPEED = 5.2;
const MARGIN = 3; // 마당 밖으로 걸어 나갈 수 있는 칸 수

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
  let stride = 0;
  let boxes = [];

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
  store.subscribe(buildColliders);

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

  // 누른 곳까지 칸 단위로 길을 찾는다. 막힌 칸을 눌렀으면 가장 가까운 빈 칸으로 간다
  function goTo(x, z) {
    const { derived, state } = store;
    const [w, h] = place === 'yard' ? [YARD.w, YARD.h] : roomSize();
    const pad = place === 'yard' ? MARGIN : 0;
    const house = place === 'yard' ? houseRect(state.house.level) : null;
    const inRange = (cx, cy) => cx >= -pad && cy >= -pad && cx < w + pad && cy < h + pad;
    const solid = (cx, cy) => derived.occ[place].furniture.has(cellKey(cx, cy))
      || (house && cx >= house.x0 && cx < house.x0 + house.w && cy >= house.z0 && cy < house.z0 + house.d);
    const sx = Math.floor(pos.x), sy = Math.min(Math.floor(pos.z), h + pad - 1);
    const prev = new Map([[cellKey(sx, sy), null]]);
    const queue = [[sx, sy]];
    let best = [sx, sy], bestDist = Infinity;
    for (let head = 0; head < queue.length; head++) {
      const [cx, cy] = queue[head];
      const d = Math.hypot(cx + 0.5 - x, cy + 0.5 - z);
      if (d < bestDist) { bestDist = d; best = [cx, cy]; }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = cx + dx, ny = cy + dy, nk = cellKey(nx, ny);
        if (!inRange(nx, ny) || prev.has(nk) || solid(nx, ny)) continue;
        prev.set(nk, [cx, cy]);
        queue.push([nx, ny]);
      }
    }
    const points = [];
    for (let cur = best; cur; cur = prev.get(cellKey(cur[0], cur[1]))) points.unshift([cur[0] + 0.5, cur[1] + 0.5]);
    points.shift(); // 지금 서 있는 칸의 가운데는 뺀다
    if (Math.floor(x) === best[0] && Math.floor(z) === best[1] && !blocked(x, z)) points.push([x, z]);
    path = points;
    stuck = 0;
    return points.length > 0;
  }

  function update(dt, inputDir) {
    let dir = null;
    if (inputDir) { path = []; dir = inputDir; }
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
    stride = moved ? stride + dt * 13 : 0;
    const { footL, footR } = figure.userData;
    const swing = Math.sin(stride);
    figure.position.set(pos.x, moved ? Math.abs(swing) * 0.07 : 0, pos.z);
    figure.rotation.y = facing;
    footL.position.z = 0.05 + swing * 0.16;
    footR.position.z = 0.05 - swing * 0.16;
    figure.rotation.z = moved ? swing * 0.04 : 0;
    return moved;
  }

  return {
    pos, figure, update, goTo,
    get place() { return place; },
    get walking() { return path.length > 0; },
    stop() { path = []; },
    // 다른 곳으로 옮긴다 (마당 ↔ 방)
    setPlace(next, x, z, face = facing) {
      place = next;
      pos.x = x; pos.z = z;
      facing = face;
      path = [];
      buildColliders();
      figure.position.set(x, 0, z);
      figure.rotation.y = facing;
    },
    teleport(x, z) { pos.x = x; pos.z = z; path = []; },
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
