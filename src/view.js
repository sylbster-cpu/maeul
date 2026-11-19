// 화면. 상태(store)를 읽어 three.js 장면을 만든다. 규칙 판정은 하지 않는다.
// 장면은 두 곳이다: 마당('yard', 집의 겉모습이 서 있다)과 방('main', 문으로 들어간다).
import * as THREE from './three.js';
import { PARTS, WALL_HEIGHT, YARD, HOUSE_CENTER_X, MAT_X, WINDOW_X, LEVELS, FLOORS, WALLPAPERS, ROOFS, SIDINGS, DOORS } from './parts.js';
import { footprint, layerOf, houseRect, cellKey } from './state.js';

const ELEVATION = THREE.MathUtils.degToRad(36);
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
  const reach = Math.max(YARD.w, YARD.h) * 0.85;
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(skyLight, sun, sun.target);

  const outside = new THREE.Group(); // 마당
  const inside = new THREE.Group(); // 방
  const ghostGroup = new THREE.Group();
  scene.add(outside, inside, ghostGroup);

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
  const emptyGroup = (group) => { while (group.children.length) group.remove(group.children[0]); };

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
  const treeSpots = [[-7, -6], [-9, 5], [-8, 15], [-6.5, 25], [4, -8], [15, -9], [27, -7], [31, 2], [33, 14], [31, 27], [7, 32], [19, 33], [-5, 33], [-11, -11], [35, -10]];
  treeSpots.forEach(([x, z], i) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.8;
    const crown = new THREE.Mesh(leafGeo, leafMats[i % 3]);
    crown.position.y = 2.6;
    crown.rotation.set(i, i * 2.1, 0);
    const top = new THREE.Mesh(leafGeo, leafMats[(i + 1) % 3]);
    top.position.set(0.3, 3.9, -0.2);
    top.scale.setScalar(0.62);
    top.rotation.set(i * 1.3, i, 0);
    for (const m of [trunk, crown, top]) { m.castShadow = true; tree.add(m); }
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.85 + ((i * 37) % 10) / 22);
    outside.add(tree);
  });

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
    const gableGeo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
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
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), knobMat);
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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
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
      const tex = wallTextures.get(wallId).clone();
      tex.needsUpdate = true;
      tex.repeat.set(len / 2, 1);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
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
    quadrant: 0, azimuth: Math.PI / 4, target: yardCenter.clone(), focus: yardCenter.clone(), bottomInset: 0,
    sizes: { yard: coarse ? 10.5 : 12.5, main: 8 }, // 손가락으로 누르기 쉽게 터치 기기는 조금 더 가까이
  };
  const targetAzimuth = () => Math.PI / 4 + cam.quadrant * Math.PI / 2;
  // 카메라가 초점의 어느 쪽에 있는지 (부호). 방의 앞쪽 벽을 고르는 데 쓴다
  const camSigns = () => {
    const a = targetAzimuth();
    return [Math.sign(Math.round(Math.sin(a) * 10)), Math.sign(Math.round(Math.cos(a) * 10))];
  };
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    const base = cam.sizes[place];
    const size = aspect < 1 ? base / Math.max(aspect, 0.45) * 0.62 : base;
    const lift = (cam.bottomInset / h) * size; // 가려진 높이의 절반만큼 초점을 위로
    camera.left = -size * aspect; camera.right = size * aspect; camera.top = size - lift; camera.bottom = -size - lift;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  function updateCamera(dt) {
    const goal = targetAzimuth();
    let diff = goal - cam.azimuth;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    cam.azimuth += diff * (calm ? 1 : Math.min(1, dt * 10));
    cam.target.lerp(cam.focus, Math.min(1, dt * 6));
    const dir = new THREE.Vector3(Math.sin(cam.azimuth) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(cam.azimuth) * Math.cos(ELEVATION));
    camera.position.copy(cam.target).addScaledVector(dir, CAMERA_DISTANCE);
    camera.lookAt(cam.target);
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

  // 방금 놓인 것을 살짝 튀게 한다
  const pops = new Map();
  function pop(ref) { if (!calm) pops.set(ref.id, { t: 0 }); }

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
  // 집(마당)이나 현관 깔개(방)를 눌렀는지
  function pickSpecial(clientX, clientY) {
    setRay(clientX, clientY);
    const hit = raycaster.intersectObjects(specials, true)[0];
    return hit ? (place === 'yard' ? 'door' : 'mat') : null;
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
    scene, camera, renderer, rebuild, showGhosts, pop, groundPoint, wallPoint, pick, pickSpecial, thumbnails,
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
      emptyGroup(ghostGroup);
      if (place !== 'yard') { roomFocus(); cam.target.copy(cam.focus); }
      rebuild();
      resize();
    },
    setFocus(x, z) { if (place === 'yard') cam.focus.set(x, 0, z); },
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
    showMarker(x, z) { marker.position.x = x; marker.position.z = z; markerLife = 1; },
    update(dt, who) {
      if (dirty) rebuild();
      updateCamera(dt);
      // 마당에서 문 가까이 가면 문이 열린다
      if (place === 'yard' && doorHinge) {
        const rect = houseRect(store.state.house.level);
        const near = Math.hypot(who.x - HOUSE_CENTER_X, who.z - (rect.z0 + rect.d)) < 2.2;
        doorHinge.rotation.y += ((near ? -1.5 : 0) - doorHinge.rotation.y) * Math.min(1, dt * 9);
      }
      for (const [id, p] of pops) {
        p.t += dt / 0.2;
        const node = nodes.get(id);
        if (!node || p.t >= 1) { if (node) node.scale.setScalar(1); pops.delete(id); continue; }
        const k = p.t - 1;
        node.scale.setScalar(0.84 + 0.16 * (1 + 2.6 * k * k * k + 1.6 * k * k));
      }
      if (markerLife > 0) {
        markerLife = Math.max(0, markerLife - dt * 1.6);
        marker.material.opacity = markerLife * 0.9;
        marker.scale.setScalar(1.5 - markerLife * 0.5);
      }
      renderer.render(scene, camera);
    },
  };
}
