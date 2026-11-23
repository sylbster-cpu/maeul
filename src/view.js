// 화면. 상태(store)를 읽어 three.js 장면을 만든다. 규칙 판정은 하지 않는다.
// 장면은 두 곳이다: 마당('yard', 집의 겉모습이 서 있다)과 방('main', 문으로 들어간다).
import * as THREE from './three.js';
import { createFx, wobble, squash } from './fx.js';
import { createBeachView } from './beach-view.js';
import { PARTS, WALL_HEIGHT, YARD, TREES, HOUSE_CENTER_X, MAT_X, WINDOW_X, LEVELS, FLOORS, WALLPAPERS, ROOFS, SIDINGS, DOORS } from './parts.js';
import { footprint, layerOf, houseRect, cellKey } from './state.js';

const ELEVATION = THREE.MathUtils.degToRad(36);
// 낚시로 가까이 볼 때는 더 낮게 내려 본다. 원근은 넣지 않는다(직교 그대로).
// 2026-11-23 비교판으로 만들었고(36도와 견줌), 같은 날 사용자 결정으로 남겼다
const FISHING_ELEVATION = THREE.MathUtils.degToRad(24);
const CAMERA_DISTANCE = 90;
const WALL_T = 0.22; // 방 벽 두께

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---- 코드로 그리는 무늬 ----
function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = size[0]; c.height = size[1];
  draw(c.getContext('2d'), c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
function floorTexture(def) {
  if (def.pattern === 'planks') {
    return canvasTexture([256, 256], (g) => {
      for (let row = 0; row < 4; row++) {
        const shift = row % 2 ? 128 : 0;
        for (let i = -1; i < 2; i++) {
          g.fillStyle = def.colors[(row * 3 + i + 4) % def.colors.length];
          g.fillRect(i * 256 + shift, row * 64, 256, 64);
          g.fillStyle = 'rgba(40, 22, 8, 0.3)';
          g.fillRect(i * 256 + shift, row * 64, 3, 64);
        }
        g.fillStyle = 'rgba(40, 22, 8, 0.35)';
        g.fillRect(0, row * 64, 256, 3);
      }
    });
  }
  if (def.pattern === 'checker') {
    return canvasTexture([128, 128], (g) => {
      g.fillStyle = def.colors[0]; g.fillRect(0, 0, 128, 128);
      g.fillStyle = def.colors[1]; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    });
  }
  return canvasTexture([128, 128], (g) => {
    g.fillStyle = def.colors[0]; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 0; i < 128; i += 8) g.fillRect(i, 0, 3, 128);
    g.fillStyle = 'rgba(0, 0, 0, 0.05)';
    for (let i = 0; i < 128; i += 8) g.fillRect(0, i, 128, 3);
  });
}
function wallTexture(def) {
  return canvasTexture([128, 256], (g) => {
    g.fillStyle = def.top; g.fillRect(0, 0, 128, 256);
    if (def.stripe) { g.fillStyle = def.stripe; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 14, 256); }
    g.fillStyle = def.bottom; g.fillRect(0, 176, 128, 80);
    g.fillStyle = 'rgba(0, 0, 0, 0.18)'; g.fillRect(0, 172, 128, 5);
  });
}

export function createView({ canvas, assets, store }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const yardCenter = new THREE.Vector3(YARD.w / 2, 0, YARD.h / 2);
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;

  // 빛
  const skyLight = new THREE.HemisphereLight(0xffffff, 0x9fb58a, 1.2);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.copy(yardCenter).add(new THREE.Vector3(-14, 34, 22));
  sun.target.position.copy(yardCenter);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // 그림자를 그리는 범위. 둘레의 나무 곁까지 걸어가도 캐릭터의 그림자가 보이게 넓혔다(2026-11-22)
  const reach = Math.max(YARD.w, YARD.h) * 1.15;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(skyLight, sun, sun.target);

  const outside = new THREE.Group(); // 마당
  const inside = new THREE.Group(); // 방
  const ghostGroup = new THREE.Group();
  scene.add(outside, inside, ghostGroup);
  const fx = createFx({ scene, calm }); // 먼지, 반짝임, 나뭇잎 (src/fx.js)

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  function box(material, sx, sy, sz, x, y, z) {
    const m = new THREE.Mesh(boxGeo, material);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  // 다시 만들 때마다 새로 생기는 기하·재질·무늬에 표시해 두고, 버릴 때 GPU 메모리에서도 내린다.
  // 여럿이 함께 쓰는 것(boxGeo, 가구 모델, 미리 만든 재질)은 표시하지 않으므로 건드리지 않는다
  const temp = (resource) => { resource.userData.temp = true; return resource; };
  function emptyGroup(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse((o) => {
        if (o.geometry?.userData.temp) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          if (!m.userData.temp) continue;
          if (m.map?.userData.temp) m.map.dispose();
          m.dispose();
        }
      });
    }
  }

  // ---- 마당의 고정 요소: 땅, 격자선, 나무 ----
  const grassMat = flat(0x8fc46f, { roughness: 1 });
  const lawnMat = flat(0xa9d684, { roughness: 1 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(yardCenter.x, -0.07, yardCenter.z);
  grass.receiveShadow = true;
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(YARD.w + 1.2, YARD.h + 1.2), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(yardCenter.x, -0.05, yardCenter.z);
  lawn.receiveShadow = true;
  outside.add(grass, lawn);

  const gridMat = new THREE.LineBasicMaterial({ color: 0x1d4035, transparent: true, opacity: 0.2 });
  const roomGridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
  function gridLines(w, h, material = gridMat) {
    const points = [];
    for (let x = 0; x <= w; x++) points.push(x, 0, 0, x, 0, h);
    for (let y = 0; y <= h; y++) points.push(0, 0, y, w, 0, y);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(geo, material);
    lines.position.y = 0.02;
    return lines;
  }
  const yardGrid = gridLines(YARD.w, YARD.h);
  yardGrid.position.y = -0.03;
  yardGrid.visible = false;
  outside.add(yardGrid);

  const trunkMat = flat(0x8a5a3a, { roughness: 1 });
  const leafMats = [0x4f9d5d, 0x62ad62, 0x3f8f58].map((color) => flat(color, { roughness: 1, flatShading: true }));
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.36, 1.6, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.5, 0);
  // 나무 자리는 parts.js 의 TREES (걷기와 함께 쓴다). 남쪽 바닷가(2026-11-22)를 만들며 넷을 뭍으로 옮겼다
  const treeSpots = TREES;
  // 나무는 저마다 다른 박자로 아주 조금 흔들리고(생동감), 캐릭터가 스쳐 지나가면 크게 흔들렸다 잦아들며
  // 잎을 몇 장 떨군다(따라오기: 줄기보다 위쪽 잎이 늦게, 더 크게)
  const trees = [];
  treeSpots.forEach(([x, z], i) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    // 잎은 나무마다 따로 칠한다. 캐릭터가 나무 뒤에 서면 그 나무의 잎만 비쳐 보이게 하려고
    const crown = new THREE.Mesh(leafGeo, Object.assign(leafMats[i % 3].clone(), { transparent: true }));
    crown.position.y = 2.6;
    crown.rotation.set(i, i * 2.1, 0);
    const top = new THREE.Mesh(leafGeo, Object.assign(leafMats[(i + 1) % 3].clone(), { transparent: true }));
    top.position.set(0.3, 3.9, -0.2);
    top.scale.setScalar(0.62);
    top.rotation.set(i * 1.3, i, 0);
    for (const m of [trunk, crown, top]) { m.castShadow = true; tree.add(m); }
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.85 + ((i * 37) % 10) / 22);
    outside.add(tree);
    trees.push({ crown, top, crownRot: crown.rotation.clone(), topRot: top.rotation.clone(), x, z, phase: i * 1.7, near: false, rustle: 9, color: leafMats[i % 3].color.getHex(), see: 1, size: tree.scale.x });
  });

  // 마당 남쪽의 바닷가: 모래사장, 바다, 파도 (src/beach-view.js)
  const beach = createBeachView({ parent: outside, calm });

  const houseGroup = new THREE.Group();
  const yardObjects = new THREE.Group();
  outside.add(houseGroup, yardObjects);
  const roomShell = new THREE.Group();
  const roomObjects = new THREE.Group();
  inside.add(roomShell, roomObjects);

  // ---- 재질 ----
  const stoneMat = flat(0xb9b4a6);
  const trimMat = flat(0xfbf7ee);
  const glassMat = flat(0x9fd3e8, { roughness: 0.35 });
  const pathMat = flat(0xd9cfb4, { roughness: 1 });
  const woodTrimMat = flat(0x6b4a34);
  const matMat = flat(0xc98a4b, { roughness: 1 });
  const knobMat = flat(0xe8c15a, { roughness: 0.4, metalness: 0.3 });
  const colorMats = new Map();
  const colorMat = (hex) => { if (!colorMats.has(hex)) colorMats.set(hex, flat(hex)); return colorMats.get(hex); };
  const floorTextures = new Map();
  const wallTextures = new Map();
  const ghostMats = {
    ok: new THREE.MeshBasicMaterial({ color: 0x4fd08a, transparent: true, opacity: 0.55, depthWrite: false }),
    bad: new THREE.MeshBasicMaterial({ color: 0xe5553f, transparent: true, opacity: 0.55, depthWrite: false }),
    select: new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45, depthWrite: false }),
    erase: new THREE.MeshBasicMaterial({ color: 0xe5553f, transparent: true, opacity: 0.45, depthWrite: false }),
  };

  function makeWindow(width, height) {
    const g = new THREE.Group();
    g.add(box(trimMat, width, height, 0.14, 0, 0, 0));
    g.add(box(glassMat, width - 0.24, height - 0.24, 0.18, 0, 0, 0));
    g.add(box(trimMat, 0.08, height - 0.2, 0.2, 0, 0, 0));
    g.add(box(trimMat, width - 0.2, 0.08, 0.2, 0, 0, 0));
    return g;
  }

  // ---- 집의 겉모습 (단계와 고른 색에 따라 코드로 만든다) ----
  let doorHinge = null;
  let doorAngle = 0, doorSpeed = 0; // 문은 집을 다시 만들어도 열린 정도를 잇는다
  let specials = [];
  function buildHouse() {
    emptyGroup(houseGroup);
    const { level, roof, siding, door } = store.state.house;
    const { w, d, h } = LEVELS[level].house;
    const rect = houseRect(level);
    const sidingMat = colorMat(SIDINGS[siding].color);
    const roofMat = colorMat(ROOFS[roof].color);
    const doorMat = colorMat(DOORS[door].color);
    const base = 0.3;
    houseGroup.position.set(HOUSE_CENTER_X, 0, rect.z0 + d / 2);

    houseGroup.add(box(stoneMat, w + 0.3, base, d + 0.3, 0, base / 2, 0));
    houseGroup.add(box(sidingMat, w, h, d, 0, base + h / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) houseGroup.add(box(trimMat, 0.22, h, 0.22, sx * (w / 2 - 0.05), base + h / 2, sz * (d / 2 - 0.05)));

    // 박공(옆면의 세모 벽)과 지붕
    const rise = d * 0.42;
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, rise); shape.closePath();
    const gableGeo = temp(new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }));
    gableGeo.translate(0, 0, -w / 2);
    gableGeo.rotateY(Math.PI / 2);
    const gable = new THREE.Mesh(gableGeo, sidingMat);
    gable.position.y = base + h;
    gable.castShadow = true;
    houseGroup.add(gable);
    const over = 0.55, thick = 0.26;
    const angle = Math.atan2(rise, d / 2);
    const slope = (d / 2 + over) / Math.cos(angle);
    for (const side of [-1, 1]) {
      const slab = box(roofMat, w + over * 2, thick, slope, 0, base + h + rise - (slope / 2) * Math.sin(angle) + thick * 0.6, side * (slope / 2) * Math.cos(angle));
      slab.rotation.x = side * angle;
      houseGroup.add(slab);
    }
    houseGroup.add(box(roofMat, w + over * 2 + 0.1, 0.22, 0.42, 0, base + h + rise + thick * 0.75, 0));
    if (level >= 2) {
      houseGroup.add(box(stoneMat, 0.8, 1.7, 0.8, w / 2 - 1.6, base + h + rise * 0.55 + 0.6, -d * 0.2));
      houseGroup.add(box(woodTrimMat, 0.95, 0.16, 0.95, w / 2 - 1.6, base + h + rise * 0.55 + 1.5, -d * 0.2));
    }

    // 문 (가까이 가면 열린다)
    const front = d / 2;
    const doorGroup = new THREE.Group();
    doorGroup.add(box(trimMat, 1.62, 2.36, 0.16, 0, base + 1.18, front + 0.02));
    doorHinge = new THREE.Group();
    doorHinge.position.set(-0.64, base, front + 0.08);
    doorHinge.add(box(doorMat, 1.28, 2.14, 0.12, 0.64, 1.07, 0));
    const knob = new THREE.Mesh(temp(new THREE.SphereGeometry(0.09, 10, 8)), knobMat);
    knob.position.set(1.08, 1.02, 0.1);
    doorHinge.add(knob);
    doorGroup.add(doorHinge);
    doorGroup.add(box(stoneMat, 2, 0.16, 0.7, 0, 0.08, front + 0.45));
    houseGroup.add(doorGroup);

    // 창문: 앞면 양쪽, 옆면 하나씩
    const winW = level === 1 ? 1.2 : level === 2 ? 1.6 : 1.9;
    const winX = level === 1 ? 2 : level === 2 ? 2.75 : 3.4;
    for (const sx of [-1, 1]) {
      const win = makeWindow(winW, 1.25);
      win.position.set(sx * winX, base + h * 0.56, front);
      houseGroup.add(win);
      const sideWin = makeWindow(Math.min(1.6, d - 2.2), 1.25);
      sideWin.rotation.y = Math.PI / 2;
      sideWin.position.set(sx * (w / 2), base + h * 0.56, 0);
      houseGroup.add(sideWin);
    }
    // 문 앞 디딤돌 길
    for (let i = 0; i < 4; i++) {
      const stone = box(pathMat, 1.5 - (i % 2) * 0.2, 0.06, 0.74, (i % 2 ? 0.12 : -0.1), -0.02, front + 1.25 + i);
      stone.castShadow = false;
      houseGroup.add(stone);
    }
    houseGroup.traverse((o) => { o.userData.special = 'door'; }); // 집 어디를 눌러도 들어가는 뜻으로 받는다
  }

  // ---- 방 (바닥재, 벽지, 현관) ----
  let gridOn = false;
  function buildRoom() {
    emptyGroup(roomShell);
    const { state } = store;
    const [w, h] = LEVELS[state.house.level].room;
    const [sx, sz] = camSigns();

    const floorId = state.spaces.main.floor;
    if (!floorTextures.has(floorId)) floorTextures.set(floorId, floorTexture(FLOORS[floorId]));
    const floorTex = floorTextures.get(floorId);
    floorTex.repeat.set(w / 2, h / 2);
    const floor = new THREE.Mesh(temp(new THREE.PlaneGeometry(w, h)), temp(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(w / 2, 0, h / 2);
    floor.receiveShadow = true;
    roomShell.add(floor);
    const slab = box(woodTrimMat, w + WALL_T * 2, 0.4, h + WALL_T * 2, w / 2, -0.205, h / 2);
    slab.castShadow = false;
    roomShell.add(slab);

    const wallId = state.spaces.main.wall;
    if (!wallTextures.has(wallId)) wallTextures.set(wallId, wallTexture(WALLPAPERS[wallId]));
    const paper = (len) => {
      const tex = temp(wallTextures.get(wallId).clone());
      tex.needsUpdate = true;
      tex.repeat.set(len / 2, 1);
      return temp(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    };
    const doorX = MAT_X + 1; // 문의 가운데 (방 좌표)
    const sides = [
      { name: 'N', len: w, x: w / 2, z: -WALL_T / 2, turn: 0, front: sz < 0 },
      { name: 'S', len: w, x: w / 2, z: h + WALL_T / 2, turn: 0, front: sz > 0 },
      { name: 'W', len: h, x: -WALL_T / 2, z: h / 2, turn: Math.PI / 2, front: sx < 0 },
      { name: 'E', len: h, x: w + WALL_T / 2, z: h / 2, turn: Math.PI / 2, front: sx > 0 },
    ];
    for (const side of sides) {
      const g = new THREE.Group();
      g.position.set(side.x, 0, side.z);
      g.rotation.y = side.turn;
      const full = side.len + WALL_T * 2;
      if (side.front) {
        // 카메라 쪽 벽은 낮은 턱만 남긴다. 현관 쪽은 문 자리를 비운다
        if (side.name === 'S') {
          const left = doorX - 1 + WALL_T, right = w - (doorX + 1) + WALL_T;
          g.add(box(woodTrimMat, left, 0.24, WALL_T, -full / 2 + left / 2, 0.12, 0));
          g.add(box(woodTrimMat, right, 0.24, WALL_T, full / 2 - right / 2, 0.12, 0));
        } else g.add(box(woodTrimMat, full, 0.24, WALL_T, 0, 0.12, 0));
      } else {
        g.add(box(paper(full), full, WALL_HEIGHT, WALL_T, 0, WALL_HEIGHT / 2, 0));
        g.add(box(woodTrimMat, full, 0.2, WALL_T + 0.06, 0, 0.1, 0));
        if (side.name === 'N') {
          const win = makeWindow(1.8, 1.3);
          win.position.set(WINDOW_X + 1 - w / 2, 2, WALL_T / 2);
          g.add(win);
        }
        if (side.name === 'S') {
          g.add(box(trimMat, 1.62, 2.36, WALL_T + 0.08, doorX - w / 2, 1.18, 0));
          g.add(box(colorMat(DOORS[state.house.door].color), 1.28, 2.14, WALL_T + 0.14, doorX - w / 2, 1.07, 0));
        }
      }
      roomShell.add(g);
    }
    const mat = box(matMat, 1.8, 0.05, 0.8, doorX, 0.025, h - 0.45);
    mat.castShadow = false;
    mat.userData.special = 'mat';
    roomShell.add(mat);
    const grid = gridLines(w, h, roomGridMat);
    temp(grid.geometry);
    grid.visible = gridOn;
    grid.userData.grid = true;
    roomShell.add(grid);
  }

  // ---- 가구 ----
  function makeObject(partId) {
    const part = PARTS[partId];
    const group = new THREE.Group();
    const mesh = assets.mesh(part.model);
    mesh.scale.setScalar(part.scale || 1);
    mesh.position.set(...(part.offset || [0, 0, 0]));
    if (layerOf(partId) === 'rug') { mesh.castShadow = false; mesh.position.y += 0.012; }
    group.add(mesh);
    return group;
  }
  // 카메라 쪽이라 낮은 턱으로만 그리는 벽들
  function frontWalls() {
    const [sx, sz] = camSigns();
    return new Set([sz > 0 ? 'S' : 'N', sx > 0 ? 'E' : 'W']);
  }
  function placeObjectNode(node, obj) {
    const layer = layerOf(obj.part);
    if (layer === 'wall') {
      // 벽 안쪽 면에 붙여 방 안을 보게 건다
      const part = PARTS[obj.part];
      const [w, h] = LEVELS[store.state.house.level].room;
      const along = obj.i + part.span / 2;
      if (obj.wall === 'N') { node.position.set(along, part.hang, 0); node.rotation.y = 0; }
      else if (obj.wall === 'S') { node.position.set(along, part.hang, h); node.rotation.y = Math.PI; }
      else if (obj.wall === 'W') { node.position.set(0, part.hang, along); node.rotation.y = Math.PI / 2; }
      else { node.position.set(w, part.hang, along); node.rotation.y = -Math.PI / 2; }
      return;
    }
    const { fw, fh } = footprint(obj);
    let y = 0;
    if (layer === 'top') {
      // 받치는 가구의 윗면 높이에 올린다
      const under = store.state.spaces[place].objects[store.derived.occ[place].furniture.get(cellKey(obj.x, obj.y))];
      const base = under && PARTS[under.part];
      y = base?.surface ? base.surface * (base.scale || 1) : 0;
    }
    node.position.set(obj.x + fw / 2, y, obj.y + fh / 2);
    node.rotation.y = obj.rot * Math.PI / 2;
  }

  // ---- 카메라 ----
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  let place = 'yard';
  const cam = {
    quadrant: 0, azimuth: Math.PI / 4, target: yardCenter.clone(), focus: yardCenter.clone(), bottomInset: 0, topInset: 0,
    sizes: { yard: coarse ? 10.5 : 12.5, main: 8 }, // 손가락으로 누르기 쉽게 터치 기기는 조금 더 가까이
  };
  const targetAzimuth = () => Math.PI / 4 + cam.quadrant * Math.PI / 2;
  // 카메라가 초점의 어느 쪽에 있는지 (부호). 방의 앞쪽 벽을 고르는 데 쓴다
  const camSigns = () => {
    const a = targetAzimuth();
    return [Math.sign(Math.round(Math.sin(a) * 10)), Math.sign(Math.round(Math.cos(a) * 10))];
  };
  // 낚시할 때는 찌 가까이 당겨 본다. close 는 0(평소)에서 1(가까이)까지 서서히 바뀐다.
  // 사용자가 고른 확대(cam.sizes)는 바꾸지 않고, 그보다 멀 때만 가까이 당긴다
  const CLOSE_SIZE = 4.6;
  let close = 0, closeGoal = 0;
  let elevation = ELEVATION; // 지금 카메라가 내려다보는 각도
  const closeAt = new THREE.Vector3();
  let shake = 0; // 찌가 잠길 때 화면이 살짝 흔들리는 정도
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const k = place === 'yard' ? close * close * (3 - 2 * close) : 0;
    const base = cam.sizes[place] + (Math.min(cam.sizes[place], CLOSE_SIZE) - cam.sizes[place]) * k;
    const size = aspect < 1 ? base / Math.max(aspect, 0.45) * 0.62 : base;
    // 가려진 높이의 절반만큼 초점을 옮긴다. 아래쪽 쟁반은 늘 셈한다. 위쪽 버튼은 방 안에서와
    // 낚시로 가까이 볼 때 셈한다 (방은 화면에 다 들어와야 하는데, 좁은 화면에서는 뒤쪽 벽이 버튼에 가려졌다)
    const topK = place === 'main' ? 1 : k;
    const lift = ((cam.bottomInset - cam.topInset * topK) / h) * size;
    camera.left = -size * aspect; camera.right = size * aspect; camera.top = size - lift; camera.bottom = -size - lift;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  function updateCamera(dt) {
    if (close !== closeGoal) {
      const step = calm ? 1 : Math.min(1, dt * 2.6);
      close += Math.max(-step, Math.min(step, closeGoal - close));
      resize();
    }
    const goal = targetAzimuth();
    let diff = goal - cam.azimuth;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    cam.azimuth += diff * (calm ? 1 : Math.min(1, dt * 10));
    cam.target.lerp(cam.focus, Math.min(1, dt * 6));
    // 가까이 당기는 정도(close)를 따라 각도도 서서히 내려간다
    const k = place === 'yard' ? close * close * (3 - 2 * close) : 0;
    elevation = ELEVATION + (FISHING_ELEVATION - ELEVATION) * k;
    const dir = new THREE.Vector3(Math.sin(cam.azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(cam.azimuth) * Math.cos(elevation));
    camera.position.copy(cam.target).addScaledVector(dir, CAMERA_DISTANCE);
    camera.lookAt(cam.target);
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 0.5);
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.z += (Math.random() - 0.5) * shake;
    }
  }

  // ---- 가려지면 안 되는 점 (낚시 중의 찌) ----
  // 그 점에서 카메라 쪽으로 곧게 선을 그어 나뭇잎에 걸리면, 그 나무의 잎을 비친다.
  // 2026-11-23 사용자 확인(휴대폰 화면): 찌가 앞쪽 나무에 살짝 가렸다. 전에는 캐릭터가 가릴 때만 비쳤다
  let watch = [];
  const watchRay = new THREE.Raycaster();
  const toCamera = new THREE.Vector3();
  const watchPoint = new THREE.Vector3();
  function covers(tr) {
    if (!watch.length) return false;
    camera.getWorldDirection(toCamera).negate();
    for (const p of watch) {
      if (Math.hypot(p.x - tr.x, p.z - tr.z) > 16) continue; // 멀리 있는 나무는 볼 것도 없다
      watchRay.set(watchPoint.set(p.x, p.y, p.z), toCamera);
      if (watchRay.intersectObjects([tr.crown, tr.top], false).length) return true;
    }
    return false;
  }

  // ---- 상태에서 장면 다시 만들기 ----
  const nodes = new Map(); // 지금 보이는 곳의 가구
  let pickables = [];
  let hiddenObject = null;
  let dirty = false;

  function rebuild() {
    dirty = false;
    const group = place === 'yard' ? yardObjects : roomObjects;
    emptyGroup(yardObjects); emptyGroup(roomObjects);
    nodes.clear();
    pickables = [];
    specials = [];
    if (place === 'yard') { buildHouse(); specials = [houseGroup]; }
    else { buildRoom(); specials = roomShell.children.filter((o) => o.userData.special); }
    const front = frontWalls();
    for (const obj of Object.values(store.state.spaces[place].objects)) {
      if (obj.id === hiddenObject || obj.on === hiddenObject) continue; // 들고 있는 가구와 그 위의 소품
      if (layerOf(obj.part) === 'wall' && front.has(obj.wall)) continue; // 낮춘 벽에 건 것은 그리지 않는다
      const node = makeObject(obj.part);
      node.userData.ref = { type: 'object', id: obj.id };
      placeObjectNode(node, obj);
      group.add(node);
      nodes.set(obj.id, node);
      pickables.push(node);
    }
    // 새로 만든 것들의 자리를 바로 계산해 둔다. 다음 화면을 그리기 전에도 누른 곳을 판정할 수 있어야 한다
    scene.updateMatrixWorld();
  }

  // ---- 미리보기와 강조 ----
  function showGhosts(items) {
    if (dirty) rebuild();
    emptyGroup(ghostGroup);
    for (const item of items) {
      const mat = ghostMats[item.tone || (item.valid ? 'ok' : 'bad')];
      if (item.type === 'object') {
        const node = makeObject(item.part);
        node.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
        placeObjectNode(node, item);
        ghostGroup.add(node);
        // 차지하는 칸도 바닥에 표시한다
        const cells = ['furniture', 'rug'].includes(layerOf(item.part)) ? footprint(item).cells : [];
        for (const [x, y] of cells) {
          const tile = new THREE.Mesh(boxGeo, mat);
          tile.scale.set(0.94, 0.04, 0.94);
          tile.position.set(x + 0.5, 0.04, y + 0.5);
          ghostGroup.add(tile);
        }
      } else if (item.type === 'highlight') {
        const node = nodes.get(item.ref.id);
        if (!node) continue;
        const bounds = new THREE.Box3().setFromObject(node);
        const size = bounds.getSize(new THREE.Vector3()).addScalar(0.1);
        size.y = Math.max(size.y, 0.14);
        const m = new THREE.Mesh(boxGeo, mat);
        m.scale.copy(size);
        bounds.getCenter(m.position);
        ghostGroup.add(m);
      }
    }
  }

  // ---- 놓기·치우기·돌리기의 연출 (docs/GAME_PRINCIPLES.md 1-4, 1-5, 1-7) ----
  // place: 살짝 위에서 떨어져 내려앉으며 납작해졌다 돌아오고 먼지가 인다. 푹신한 가구는 더 납작해진다.
  // rotate: 돌린 쪽으로 조금 지나쳤다 돌아온다. 벽걸이는 못에 건 것처럼 흔들리다 멎는다. 러그는 펼쳐진다.
  // bump: 앉을 때 방석이 눌린다. 모두 그리는 모습만 바꾸고 자리(상태)는 그대로다
  const SOFT = new Set(['bed', 'double_bed', 'couch', 'armchair']);
  const pops = new Map();
  function pop(ref, { kind = 'place', amount = 0 } = {}) { if (!calm) pops.set(ref.id, { t: 0, kind, amount, base: null }); }
  // 치운 가구: 지우기 전 모습을 복사해 살짝 부풀었다 오므라들며 사라지게 한다. 대략의 크기(칸 수)를 돌려준다
  const vanishing = [];
  const counts = { vanished: 0, nopes: 0 }; // 자동 시험이 읽는다
  function vanish(id) {
    const node = nodes.get(id);
    if (!node) return 1;
    const box = new THREE.Box3().setFromObject(node);
    const size = box.getSize(new THREE.Vector3());
    const area = Math.max(1, Math.round(size.x * size.z));
    if (calm) return area;
    const copy = node.clone(true);
    copy.userData = {};
    counts.vanished++;
    (place === 'yard' ? outside : inside).add(copy);
    vanishing.push({ node: copy, t: 0 });
    const mid = box.getCenter(new THREE.Vector3());
    fx.puff(mid.x, box.min.y, mid.z, { count: Math.min(12, 5 + area), spread: 0.3 + Math.sqrt(area) * 0.2, rx: size.x * 0.5, rz: size.z * 0.5, parent: place === 'yard' ? outside : inside });
    return area;
  }
  // 놓을 수 없는 자리: 미리보기가 고개를 젓듯 좌우로 흔들린다 (실패의 이유는 알림이 말한다)
  let nopeT = 9;
  // 집을 키우거나 겉모습을 바꿨을 때. 키우기는 드문 큰일이라 크게(늘어났다 내려앉기, 먼지 고리, 반짝임), 색 바꾸기는 작게
  let houseBump = null;
  function celebrate(kind) {
    if (calm) return;
    if (place === 'yard') {
      const big = kind === 'level';
      houseBump = { t: 0, amount: big ? 0.12 : 0.035 };
      const { w, d, h } = LEVELS[store.state.house.level].house;
      const hx = houseGroup.position.x, hz = houseGroup.position.z;
      if (big) {
        fx.puff(hx, 0, hz, { count: 28, spread: 1.4, size: 0.95, life: 0.8, rx: w * 0.5, rz: d * 0.5, parent: outside });
        fx.sparkle(hx, h + 1.2, hz, { count: 16, radius: w * 0.6, size: 0.8, parent: outside });
      } else fx.sparkle(hx, h + 0.8, hz, { count: 5, radius: w * 0.4, size: 0.6, parent: outside });
    } else {
      const [w, h] = LEVELS[store.state.house.level].room;
      fx.sparkle(w / 2, 0.6, h / 2, { count: kind === 'level' ? 14 : 6, radius: Math.min(w, h) * 0.45, parent: inside });
    }
  }
  let clock = 0;
  // 연출 하나를 한 화면만큼 움직인다. 끝났으면 true
  function finishPop(node, p, obj) {
    const t = p.t, b = p.base;
    if (p.kind === 'rotate') {
      // 돌린 만큼(90도) 뒤에서 출발해 조금 지나쳤다 돌아온다
      node.rotation.y = b.rotY + wobble(-Math.PI / 2, t, 0.12, 0.05);
      squash(node, 1 + wobble(-0.05, t, 0.1, 0.1));
      return t > 0.4;
    }
    if (p.kind === 'bump') {
      squash(node, 1 + wobble(-p.amount, t, 0.09, 0.1));
      return t > 0.45;
    }
    if (p.layer === 'wall') {
      // 못에 건 액자처럼 흔들리다 멎는다
      node.rotation.z = b.rotZ + wobble(0.1, t, 0.22, 0.35);
      return t > 1.2;
    }
    if (p.layer === 'rug') {
      // 접혀 있던 것이 펼쳐지듯 넓어졌다 자리를 잡는다
      const k = 1 + wobble(-0.14, t, 0.1, 0.1);
      node.scale.set(k, 1, k);
      return t > 0.45;
    }
    // 떨어져 내려앉기: 0.09초 동안 가속하며 떨어지고(떨어지는 동안 세로로 늘어남), 닿는 순간 납작해졌다 돌아온다
    const DROP = 0.09;
    const height = p.layer === 'top' ? 0.16 : 0.24;
    if (t < DROP) {
      const k = t / DROP;
      node.position.y = b.y + height * (1 - k * k);
      squash(node, 1 + 0.08 * k);
      return false;
    }
    if (!p.landed) {
      p.landed = true;
      if (p.layer === 'furniture') {
        // 가구 가장자리에서 먼지가 밖으로 퍼진다. 큰 가구일수록 많이, 넓게
        const box = new THREE.Box3().setFromObject(node);
        const mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        fx.puff(mid.x, b.y, mid.z, { count: Math.min(14, 6 + p.area * 2), spread: 0.3 + Math.sqrt(p.area) * 0.22, size: 0.4, rx: size.x * 0.5, rz: size.z * 0.5, parent: place === 'yard' ? outside : inside });
      }
    }
    node.position.y = b.y;
    // 푹신한 가구는 많이, 단단한 가구는 조금, 작은 소품은 그 사이로 납작해진다
    const amount = p.soft ? 0.16 : p.layer === 'top' ? 0.12 : 0.08;
    squash(node, 1 + wobble(-amount, t - DROP, 0.09, 0.09));
    return t - DROP > 0.45;
  }

  // 걷기 모드에서 누른 자리 표시
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.05;
  scene.add(marker);
  let markerLife = 0;

  // ---- 화면 좌표 → 세계 ----
  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function setRay(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
  }
  function groundPoint(clientX, clientY) {
    setRay(clientX, clientY);
    const hit = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }
  function pick(clientX, clientY) {
    if (dirty) rebuild();
    setRay(clientX, clientY);
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      let o = hit.object;
      while (o && !o.userData.ref) o = o.parent;
      if (o) return o.userData.ref;
    }
    return null;
  }
  // 방에서 포인터가 가리키는 벽과 벽 칸. 보이는(뒤쪽) 두 벽만 가리킬 수 있다
  function wallPoint(clientX, clientY, span) {
    if (place === 'yard') return null;
    setRay(clientX, clientY);
    const { origin, direction } = raycaster.ray;
    const [w, h] = LEVELS[store.state.house.level].room;
    const front = frontWalls();
    let best = null;
    for (const wall of ['N', 'S', 'W', 'E']) {
      if (front.has(wall)) continue;
      const alongX = wall === 'N' || wall === 'S';
      const plane = wall === 'N' || wall === 'W' ? 0 : alongX ? h : w;
      const t = alongX ? (plane - origin.z) / direction.z : (plane - origin.x) / direction.x;
      if (!(t > 0) || (best && t >= best.t)) continue;
      const y = origin.y + direction.y * t;
      const along = alongX ? origin.x + direction.x * t : origin.z + direction.z * t;
      const len = alongX ? w : h;
      if (y < 0.4 || y > WALL_HEIGHT || along < 0 || along > len) continue;
      best = { t, wall, i: Math.max(0, Math.min(len - span, Math.round(along - span / 2))) };
    }
    return best && { wall: best.wall, i: best.i };
  }
  // 걷는 중에 누른 것. 집(마당)이나 현관 깔개(방)와 가구 가운데 카메라에 더 가까운 쪽을 돌려준다.
  // 드나드는 곳이면 { special }, 가구면 { ref, point } (point 는 가구에서 눌린 지점)
  function pickFront(clientX, clientY) {
    if (dirty) rebuild();
    setRay(clientX, clientY);
    const special = raycaster.intersectObjects(specials, true)[0];
    let object = null;
    for (const hit of raycaster.intersectObjects(pickables, true)) {
      let o = hit.object;
      while (o && !o.userData.ref) o = o.parent;
      if (o) { object = { ref: o.userData.ref, point: { x: hit.point.x, z: hit.point.z }, distance: hit.distance }; break; }
    }
    if (special && (!object || special.distance <= object.distance)) return { special: place === 'yard' ? 'door' : 'mat' };
    return object;
  }

  // ---- 테마 ----
  function applyTheme() {
    grassMat.color.set(cssVar('--scene-grass') || '#8fc46f');
    lawnMat.color.set(cssVar('--scene-lawn') || '#a9d684');
    gridMat.color.set(cssVar('--scene-grid') || '#1d4035');
    sun.color.set(cssVar('--scene-sun') || '#fff1d6');
    sun.intensity = Number(cssVar('--scene-sun-power')) || 2.4;
    skyLight.intensity = Number(cssVar('--scene-sky-power')) || 1.2;
  }
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---- 목록에 쓸 가구 그림 ----
  function thumbnails(partIds, size = 112) {
    const out = {};
    let small;
    try { small = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return out; }
    small.setSize(size, size, false);
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0xb0b8a8, 1.5));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
    key.position.set(-3, 8, 6);
    s.add(key);
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    for (const id of partIds) {
      const node = makeObject(id);
      s.add(node);
      const bounds = new THREE.Box3().setFromObject(node);
      const center = bounds.getCenter(new THREE.Vector3());
      const half = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2 * 0.86, 0.7);
      c.left = -half; c.right = half; c.top = half; c.bottom = -half;
      c.updateProjectionMatrix();
      c.position.copy(center).add(new THREE.Vector3(1, 0.85, 1).normalize().multiplyScalar(30));
      c.lookAt(center);
      small.render(s, c);
      out[id] = small.domElement.toDataURL('image/png');
      s.remove(node);
    }
    small.dispose();
    small.forceContextLoss?.();
    return out;
  }

  function roomFocus() {
    const [w, h] = LEVELS[store.state.house.level].room;
    cam.sizes.main = Math.max(w, h) * 0.8 + 3.4; // 방 전체와 뒤쪽 벽이 한 화면에 들어오게
    cam.focus.set(w / 2, 1.1, h / 2);
  }

  store.subscribe((cmd) => {
    dirty = true;
    if (place !== 'yard' && (cmd.type === 'setLevel' || cmd.type === 'replace')) { roomFocus(); resize(); }
  });
  rebuild();
  resize();

  return {
    scene, camera, renderer, rebuild, showGhosts, pop, vanish, celebrate, groundPoint, wallPoint, pick, pickFront, thumbnails,
    fx, // 공통 연출 (src/fx.js). 캐릭터와 낚시도 쓴다
    nope() { nopeT = 0; counts.nopes++; },
    // 앉을 때 방석이 눌린다
    bump(id, amount = 0.06) { pop({ id }, { kind: 'bump', amount }); },
    // 연출 상태 (자동 시험이 읽는다)
    get beach() { return beach.waves; }, // 바닷가 파도 (자동 시험이 읽는다)
    get trees() { return trees.map((t) => ({ x: t.x, z: t.z, see: t.see })); }, // 나무 잎이 비치는 정도 (자동 시험이 읽는다)
    get feel() {
      return { ...counts, pops: [...pops.entries()].map(([id, p]) => ({ id, kind: p.kind, landed: !!p.landed })), vanishing: vanishing.length, nope: nopeT < 0.4, houseBump: !!houseBump, particles: fx.count, rustling: trees.filter((t) => t.rustle < 0.5).length, door: doorAngle };
    },
    outside, // 마당 장면. 연못(fishing-view.js)이 여기에 붙는다
    clearGhosts: () => emptyGroup(ghostGroup),
    // 세계 좌표가 화면의 어디인지 (자동 확인 스크립트가 쓴다)
    screenPoint(x, z) {
      const v = new THREE.Vector3(x, 0, z).project(camera);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
    },
    get place() { return place; },
    get viewSize() { return cam.sizes[place]; },
    // 마당과 방 사이를 오간다
    setPlace(next) {
      place = next;
      outside.visible = place === 'yard';
      inside.visible = place !== 'yard';
      hiddenObject = null;
      close = closeGoal = 0;
      emptyGroup(ghostGroup);
      if (place !== 'yard') { roomFocus(); cam.target.copy(cam.focus); }
      rebuild();
      resize();
    },
    setFocus(x, z) { if (place === 'yard') { if (closeGoal) cam.focus.copy(closeAt); else cam.focus.set(x, 0, z); } },
    // 낚시하는 곳을 가까이 본다. null 이면 평소대로
    // 땅이 아니라 1.5 높이를 겨눈다. 찌부터 캐릭터 머리 위의 느낌표까지가 화면 가운데에 오게 한다
    // 가려지면 안 되는 점들 ({x, y, z} 배열). 빈 배열이면 캐릭터만 본다
    setWatch(points) { watch = points || []; },
    setCloseUp(point) { closeGoal = point ? 1 : 0; if (point) closeAt.set(point.x, 1.5, point.z); },
    get closeAmount() { return close; },
    // 화면을 살짝 흔든다 (움직임 줄이기를 켠 사람에게는 흔들지 않는다)
    shake(amount) { if (!calm) shake = Math.max(shake, amount); },
    snapFocus(x, z) { if (place === 'yard') { cam.focus.set(x, 0, z); cam.target.copy(cam.focus); } },
    rotateCamera(step) { cam.quadrant = (cam.quadrant + step + 4) % 4; rebuild(); },
    zoomBy(factor) { cam.sizes[place] = THREE.MathUtils.clamp(cam.sizes[place] * factor, 4.5, 24); resize(); },
    // 화면 위쪽과 오른쪽이 세계에서 어느 방향인지 (걷기 입력에 쓴다)
    basis() {
      const a = targetAzimuth();
      return { forward: { x: -Math.sin(a), z: -Math.cos(a) }, right: { x: Math.cos(a), z: -Math.sin(a) } };
    },
    setGrid(on) {
      gridOn = on;
      yardGrid.visible = on;
      for (const o of roomShell.children) if (o.userData.grid) o.visible = on;
    },
    setHidden(id) { if (hiddenObject !== id) { hiddenObject = id; rebuild(); } },
    setBottomInset(px) { if (Math.abs(px - cam.bottomInset) > 1) { cam.bottomInset = px; resize(); } },
    setTopInset(px) { if (Math.abs(px - cam.topInset) > 1) { cam.topInset = px; resize(); } },
    showMarker(x, z) { marker.position.x = x; marker.position.z = z; markerLife = 1; },
    update(dt, who) {
      if (dirty) rebuild();
      updateCamera(dt);
      // 마당에서 문 가까이 가면 문이 열린다. 용수철처럼 조금 지나쳤다 멎는다
      if (place === 'yard' && doorHinge) {
        const rect = houseRect(store.state.house.level);
        const near = Math.hypot(who.x - HOUSE_CENTER_X, who.z - (rect.z0 + rect.d)) < 2.2;
        const goal = near ? -1.5 : 0;
        if (calm) doorAngle += (goal - doorAngle) * Math.min(1, dt * 9);
        else {
          // 느린 기기에서도 같게 움직이도록 1/120초씩 나누어 계산한다
          for (let left = dt; left > 1e-6; left -= 1 / 120) {
            const h = Math.min(left, 1 / 120);
            doorSpeed += ((goal - doorAngle) * 130 - doorSpeed * 15) * h; doorAngle += doorSpeed * h;
          }
        }
        doorHinge.rotation.y = doorAngle;
      }
      if (place === 'yard') {
        // 카메라가 있는 쪽 (땅 위의 방향)
        const camX = Math.sin(cam.azimuth), camZ = Math.cos(cam.azimuth);
        for (const tr of trees) {
          // 가까이(4.4) 지나가면 흔들린다. 2026-11-22부터 나무 곁까지 걸어갈 수 있다
          const near = Math.hypot(who.x - tr.x, who.z - tr.z) < 4.4;
          // 캐릭터가 나무 뒤(카메라 반대쪽)에 서서 잎에 가리면 그 나무의 잎을 비쳐 보이게 한다.
          // 찌는 따로 본다(covers: 찌에서 카메라 쪽으로 그은 선이 잎에 걸리는지)
          const dx = tr.x - who.x, dz = tr.z - who.z;
          const along = dx * camX + dz * camZ, side = Math.abs(dx * camZ - dz * camX);
          // 카메라가 낮을수록 같은 나무가 더 먼 땅까지 가린다 (36도에서 4.6칸)
          const reach = 4.6 * Math.tan(ELEVATION) / Math.tan(elevation);
          const hidden = (along > -0.8 && along < reach * tr.size && side < 1.8 * tr.size) || covers(tr);
          tr.see += ((hidden ? 0.35 : 1) - tr.see) * (calm ? 1 : Math.min(1, dt * 8));
          tr.crown.material.opacity = tr.top.material.opacity = tr.see;
          tr.crown.material.depthWrite = tr.top.material.depthWrite = tr.see > 0.99;
          if (near && !tr.near && !calm) { tr.rustle = 0; fx.leaf(tr.x, 3.2, tr.z, tr.color, { count: 3, parent: outside }); }
          tr.near = near;
          tr.rustle += dt;
          const idle = calm ? 0 : Math.sin(clock * 0.9 + tr.phase) * 0.025;
          const shake = calm ? 0 : wobble(0.12, tr.rustle, 0.16, 0.35);
          const lag = calm ? 0 : wobble(0.18, Math.max(0, tr.rustle - 0.06), 0.16, 0.4); // 위쪽 잎은 늦게, 크게
          tr.crown.rotation.set(tr.crownRot.x + idle + shake, tr.crownRot.y, tr.crownRot.z + shake * 0.6);
          tr.top.rotation.set(tr.topRot.x + idle * 1.4 + lag, tr.topRot.y, tr.topRot.z + lag * 0.6);
        }
      }
      clock += dt;
      for (const [id, p] of pops) {
        p.t += dt;
        const node = nodes.get(id);
        if (!node) { if (p.t > 1) pops.delete(id); continue; } // 다시 그리기 전이면 기다린다
        const obj = store.state.spaces[place].objects[id];
        if (!p.base) {
          p.base = { y: node.position.y, rotY: node.rotation.y, rotZ: node.rotation.z };
          p.layer = obj ? layerOf(obj.part) : 'furniture';
          p.soft = obj && SOFT.has(obj.part);
          p.area = obj && p.layer !== 'wall' ? footprint(obj).cells.length || 1 : 1; // 벽걸이에는 바닥 칸이 없다
        }
        if (finishPop(node, p, obj)) { node.position.y = p.base.y; node.rotation.y = p.base.rotY; node.rotation.z = p.base.rotZ; node.scale.setScalar(1); pops.delete(id); }
      }
      for (let i = vanishing.length - 1; i >= 0; i--) {
        const v = vanishing[i];
        v.t += dt;
        const k = v.t / 0.2;
        if (k >= 1) { v.node.removeFromParent(); vanishing.splice(i, 1); continue; }
        // 0.05초 동안 살짝 부풀었다가 빠르게 오므라든다
        const s = k < 0.25 ? 1 + 0.08 * (k / 0.25) : 1.08 * (1 - ((k - 0.25) / 0.75) ** 2);
        v.node.scale.setScalar(Math.max(0.001, s));
      }
      if (nopeT < 0.4) {
        nopeT += dt;
        const a = targetAzimuth(); // 화면 오른쪽 방향으로 흔든다
        const b = { right: { x: Math.cos(a), z: -Math.sin(a) } };
        const off = calm ? 0 : wobble(0.08, nopeT, 0.06, 0.1);
        ghostGroup.position.set(b.right.x * off, 0, b.right.z * off);
      } else ghostGroup.position.set(0, 0, 0);
      if (houseBump) {
        houseBump.t += dt;
        // 위로 늘어났다가 내려앉으며 잦아든다
        squash(houseGroup, 1 + wobble(houseBump.amount, houseBump.t, 0.14, 0.2));
        if (houseBump.t > 0.9) { houseBump = null; houseGroup.scale.set(1, 1, 1); }
      }
      fx.update(dt);
      beach.update(dt);
      if (markerLife > 0) {
        markerLife = Math.max(0, markerLife - dt * 1.6);
        marker.material.opacity = markerLife * 0.9;
        marker.scale.setScalar(1.5 - markerLife * 0.5);
      }
      renderer.render(scene, camera);
    },
  };
}
