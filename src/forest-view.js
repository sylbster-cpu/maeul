// 마을 북서쪽의 작은 숲. 기존 마당 배치와 낚시 물가는 바꾸지 않는다.
// 2026-11-24 사용자 결정으로 연출 넷을 더했다(코드는 Claude): 바닥 무늬와 흩뿌림, 발견하는 순간, 숲 쪽으로 이끄는 잎.
// 나무 가림은 view.setWatch 가 맡는다(main.js).
import * as THREE from './three.js';
import { wobble, squash } from './fx.js';
import { FOREST_PATHS, forestFloorLayout, seededRandom, FOREST_SEED } from './forest.js';
import { GATHER, SPECIAL_ID, findsForDay, kstSlot } from './gathering.js';
import { TREES, TREE_RADIUS, FOREST } from './parts.js';

const LEAF_COLORS = [0xe2c35a, 0xd99a3e, 0xb8d36a, 0xf0dc8a]; // 풀밭에서 눈에 띄는 마른 잎 빛 (숲 잎과 같은 초록이면 풀에 묻힌다)

// 숲 바닥의 풀빛 무늬. 씨앗을 준 값 노이즈 두 겹(옥타브)을 더해 이끼·흙·밝은 풀이 얼룩지게 한다
// (docs/GAME_PRINCIPLES.md 지형 노이즈 편을 높이 없이 빛깔에만 씀). 격자가 돌아 이어지므로 반복해 깔아도 이음매가 없다
function floorTexture(seed) {
  const rand = seededRandom(seed);
  const grid = (n) => ({ n, v: Array.from({ length: n * n }, () => rand()) });
  const g1 = grid(5), g2 = grid(11);
  const ease = (t) => t * t * (3 - 2 * t);
  const sample = ({ n, v }, u, w) => {
    const x = u * n, y = w * n, x0 = Math.floor(x), y0 = Math.floor(y);
    const at = (i, j) => v[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const sx = ease(x - x0), sy = ease(y - y0);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  // [노이즈 값, r, g, b]: 흙 → 짙은 이끼 → 원래 숲 바닥(0x648c50) → 밝은 풀
  const stops = [[0, 118, 104, 70], [0.36, 84, 122, 68], [0.55, 100, 140, 80], [0.82, 124, 160, 92]];
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = 0.65 * sample(g1, x / size, y / size) + 0.35 * sample(g2, x / size, y / size);
      let i = 1;
      while (i < stops.length - 1 && n > stops[i][0]) i++;
      const [n0, r0, g0, b0] = stops[i - 1], [n1, r1, g1c, b1] = stops[i];
      const k = Math.min(1, Math.max(0, (n - n0) / (n1 - n0)));
      const o = (y * size + x) * 4;
      img.data[o] = r0 + (r1 - r0) * k; img.data[o + 1] = g0 + (g1c - g0) * k; img.data[o + 2] = b0 + (b1 - b0) * k; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 7, 1 / 7); // 7칸마다 한 장
  return tex;
}

// 발견했을 때 머리 위에 뜨는 말풍선 느낌표. 낚시의 입질 표시(주황 동그라미, "지금 누르세요")와
// 모양과 빛깔을 다르게 한다. 같은 모양이면 진짜 신호와 헷갈린다(1-8)
function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 144;
  const g = c.getContext('2d');
  g.fillStyle = '#fffaf0'; g.strokeStyle = '#2f5d3a'; g.lineWidth = 7;
  g.beginPath();
  g.moveTo(30, 8); g.lineTo(98, 8); g.quadraticCurveTo(120, 8, 120, 30); g.lineTo(120, 86); g.quadraticCurveTo(120, 108, 98, 108);
  g.lineTo(74, 108); g.lineTo(64, 136); g.lineTo(54, 108); g.lineTo(30, 108); g.quadraticCurveTo(8, 108, 8, 86); g.lineTo(8, 30); g.quadraticCurveTo(8, 8, 30, 8);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#3f8a46'; g.font = 'bold 82px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', 64, 62);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createForestView(parent, { fx = null, calm = false } = {}) {
  const group = new THREE.Group();
  parent.add(group);
  const earth = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorTexture(FOREST_SEED), roughness: 1 });
  const trail = new THREE.MeshStandardMaterial({ color: 0xc5ab7e, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x735139, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x477f49, roughness: 1, flatShading: true });
  // 모서리가 반듯한 판 대신 둥글고 약간 불규칙한 숲 바닥
  const outline = new THREE.Shape();
  outline.moveTo(-5.3,-6);
  outline.bezierCurveTo(-6,-7,-3,-6,-1,-4);
  outline.bezierCurveTo(1,-2,3,2,4,5);
  outline.bezierCurveTo(5,7,4,7,2,6);
  outline.bezierCurveTo(-1,7,-5,7,-5.4,4);
  outline.bezierCurveTo(-6,1,-6,-3,-5.3,-6);
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(outline), earth);
  ground.rotation.x = -Math.PI / 2; ground.position.set(-8, -0.035, -8.5); ground.receiveShadow = true; group.add(ground);
  // 숲으로 이어지는 길: 집 왼편에서 숲 안쪽 공터까지 이어진다.
  // 두 입구: 동쪽의 짧은 길과 남쪽에서 돌아가는 길. 두 길 모두 기존 나무줄기를 피한다.
  for (const [x,z,w,d] of FOREST_PATHS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,d), trail);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.005, z); m.receiveShadow = true; group.add(m);
  }
  // 기존 나무는 character.js와 충돌 판정을 공유한다. 여기에 별도 나무를
  // 그리면 보이기만 하고 통과하는 문제가 생기므로 새 줄기는 만들지 않는다.
  const nearTree = (x,z) => TREES.some(([tx,tz])=>Math.hypot(x-tx,z-tz)<TREE_RADIUS+0.8);
  for (const [x,z] of [[-10,-9],[-6,-11],[-11,-4],[-3,-8]]) {
    if (nearTree(x,z)) continue;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.35,0.35,5),leafMat);
    tuft.position.set(x,0.18,z); group.add(tuft); // 작은 풀은 이동을 막지 않는다
  }

  // ---- 바닥에 흩뿌린 돌·풀·꽃 (씨앗 고정, forest.js forestFloorLayout) ----
  // 걷기를 막지 않는 장식이다. 발견물과 닮은 것은 흩뿌리지 않는다
  const layout = forestFloorLayout();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  function scatter(items, geometry, material, tones, place) {
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    items.forEach((p, i) => {
      dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, p.turn, 0); dummy.scale.setScalar(1);
      place(dummy, p);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHex(tones[p.tone % tones.length]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }
  const decor = {
    stones: scatter(layout.stones, new THREE.DodecahedronGeometry(0.21, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      [0x9a968c, 0x86837a, 0xaba699], (o, p) => { o.scale.set(p.size, p.size * 0.55, p.size * 0.85); o.position.y = 0.04 * p.size; }),
    // 풀 한 포기는 가는 원뿔 하나. 크기와 기울기를 조금씩 달리한다
    tufts: scatter(layout.tufts, new THREE.ConeGeometry(0.09, 0.34, 4).translate(0, 0.17, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      [0x4f8a45, 0x5e9a4a, 0x6ea85a], (o, p) => { o.scale.set(p.size, p.size * (0.8 + 0.3 * (p.tone / 2)), p.size); o.rotation.z = (p.size - 1) * 0.5; }),
    flowers: scatter(layout.flowers, new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      [0xfff7e0, 0xf6e27a, 0xf2c6d0], (o, p) => { o.position.y = 0.1 + 0.04 * p.size; }),
  };

  // 집에서 보이는 숲 입구의 표지. 안내 UI를 추가하지 않는다.
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,1.3,6),trunkMat);
  post.position.y=0.65; sign.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.42,0.12),trail);
  board.position.set(0,1.25,0); board.rotation.y=0.2; sign.add(board);
  // 꾸밀 수 있는 마당(0 이상) 밖에 두어 저장된 가구와 겹치지 않는다.
  sign.position.set(-1.5,-0.01,-2.2); group.add(sign);
  // ---- 주울 거리 (4단계 채집, 2026-11-24 사용자 결정, src/gathering.js) ----
  // 금빛 고리의 오늘의 발견(find)과 땅에 놓인 보통 주울 거리(items). 자리·종류·크기는 날짜로 정해져 모두에게 같다.
  // 주우면 사라진다. 크기가 클수록 크게 그린다
  const find = new THREE.Group();
  find.position.set(FOREST.clearingX,0,FOREST.clearingZ);
  group.add(find);
  const items = new THREE.Group();
  group.add(items);
  const COLORS = { pinecone: 0x9b653b, mushroom: 0xe5b98a, feather: 0xe6e2cf };
  const sizeK = (f) => (f.size - GATHER[f.kind].min) / (GATHER[f.kind].max - GATHER[f.kind].min);
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  function smallItem(f) {
    const g = new THREE.Group();
    const part = (geo, color, y) => { const m = new THREE.Mesh(geo, mat(color)); m.position.y = y; m.castShadow = true; g.add(m); return m; };
    if (f.kind === 'pinecone') part(new THREE.ConeGeometry(0.16, 0.34, 7), COLORS.pinecone, 0.17);
    else if (f.kind === 'mushroom') {
      part(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 7), 0xf3e6cc, 0.08);
      part(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd98c5f, 0.14);
    } else part(new THREE.ConeGeometry(0.06, 0.44, 5), COLORS.feather, 0.07).rotation.z = Math.PI / 2;
    g.scale.setScalar(0.85 + 0.75 * sizeK(f)); // 가장 작은 것도 풀 포기보다 크게
    g.position.set(f.x, 0, f.z);
    g.rotation.y = (f.size * 7.3) % (Math.PI * 2);
    g.userData = { id: f.id };
    return g;
  }
  const disposeAll = (obj) => obj.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  let day = '', slot = -1; // 지금 그리는 날과 시간대 (gathering-play.js 가 setPicked 로 알린다)
  let picked = new Set(), pickedDay = '';
  let specialPicked = false;
  const anims = []; // 줍는 중인 것 { obj, t }
  function applyPicked() {
    const ids = pickedDay === day ? picked : new Set();
    specialPicked = ids.has(SPECIAL_ID);
    for (const c of items.children) c.visible = !ids.has(c.userData.id) || anims.some((a) => a.obj === c);
    find.visible = !specialPicked || !!pop;
  }
  // 그 날·시간대의 것으로 다시 놓는다. 오늘의 발견은 하루 내내 같으므로 날이 바뀔 때만 다시 만든다
  function refresh(forDay, forSlot) {
    if (day === forDay && slot === forSlot) return;
    const newDay = day !== forDay;
    day = forDay; slot = forSlot;
    for (const child of [...(newDay ? find.children : []), ...items.children]) { child.removeFromParent(); disposeAll(child); }
    anims.length = 0;
    const finds = findsForDay(day, slot);
    for (const f of finds) if (!f.special) items.add(smallItem(f));
    if (!newDay) { applyPicked(); return; }
    const special = finds.find((f) => f.special);
    find.position.set(special.x, 0, special.z);
    const shape = special.kind === 'feather' ? new THREE.ConeGeometry(0.17,0.7,6) :
      special.kind === 'mushroom' ? new THREE.SphereGeometry(0.34,10,8) : new THREE.ConeGeometry(0.28,0.6,7);
    // 받침(holder)이 위치·회전·솟음을 맡고, 그 안의 모양이 크기를 맡는다
    const holder = new THREE.Group();
    holder.position.y = 0.85;
    const mesh = new THREE.Mesh(shape, mat(COLORS[special.kind]));
    mesh.scale.setScalar(0.9 + 0.3 * sizeK(special)); mesh.castShadow = true; holder.add(mesh);
    find.add(holder);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.48,0.59,32),new THREE.MeshBasicMaterial({color:0xf5db83,side:THREE.DoubleSide}));
    ring.rotation.x = -Math.PI/2; ring.position.y = 0.025; find.add(ring);
    pop = null;
    applyPicked();
  }

  // ---- 발견하는 순간 (1-1 같은 순간의 짧은 신호들, 1-4 찌그러짐, 과장 편) ----
  // 소리(main.js 의 audio 'find'), 반짝임, 발견물이 솟았다 내려앉음, 머리 위 말풍선이 같은 화면에서 시작한다.
  // 메기·감성돔을 처음 낚았을 때보다 작게 한다(1-7). 움직임 줄이기를 켜면 움직이지 않고 말풍선만 잠깐 보인다
  const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(), depthTest: false, transparent: true }));
  bubble.renderOrder = 10;
  bubble.visible = false;
  parent.add(bubble);
  let pop = null, bubbleT = 0, angle = 0;
  const counts = { found: 0, cues: 0, picks: 0, glints: 0 }; // 자동 시험이 읽는다
  let glintT = 0;

  { const at = kstSlot(new Date()); refresh(at.day, at.slot); } // 처음 그림. 곧 gathering-play.js 가 알려 주는 것으로 맞춘다
  let elapsed = 0;
  function update(dt = 0, who = null) {
    if (!Number.isFinite(dt) || dt < 0) return;
    elapsed += dt;
    const object = find.children[0];
    const halo = find.children[1];
    let spin = 0.5;
    if (pop && object && halo) {
      pop.t += dt;
      const t = pop.t;
      // 0~0.18초 감속하며 솟고, 0.38초까지 떠 있다가, 0.52초까지 가속하며 떨어진 뒤 납작해졌다 돌아온다.
      // 캐릭터 머리(약 1.6) 높이까지 솟아, 어느 쪽에서 다가가도 몸에 다 가리지 않는다
      const TOP = 0.8;
      let lift = 0;
      if (t < 0.18) { const k = t / 0.18; lift = TOP * (1 - (1 - k) * (1 - k)); }
      else if (t < 0.38) lift = TOP + 0.04 * Math.sin(((t - 0.18) / 0.2) * Math.PI);
      else if (t < 0.52) { const k = (t - 0.38) / 0.14; lift = TOP * (1 - k * k); }
      object.position.y = 0.85 + lift;
      // 떠 있는 동안 1.3배로 키운다. 작은 화면에서 보이게 하되 끝까지 과장하지 않는다
      if (t < 0.52) object.scale.setScalar(1 + 0.3 * Math.min(1, lift / TOP));
      else squash(object, 1 + wobble(-0.22, t - 0.52, 0.08, 0.09));
      spin = 0.5 + 9 * Math.exp(-t / 0.35);
      halo.scale.setScalar(1 + wobble(0.35, t, 0.12, 0.18));
      if (t > 1.0) { pop = null; object.position.y = 0.85; object.scale.setScalar(1); halo.scale.setScalar(1); applyPicked(); } // 주웠으면 사라진다
    } else if (halo) halo.scale.setScalar(1 + 0.08 * Math.sin(elapsed * 2));
    angle += dt * spin;
    if (object) object.rotation.y = angle;
    // 보통 주울 거리를 주울 때: 0.32초에 걸쳐 캐릭터 가슴 쪽으로 작게 튀어 올라 오므라들며 사라진다
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / 0.32);
      const to = who || a.from;
      a.obj.position.set(a.from.x + (to.x - a.from.x) * k, 0.9 * k + 0.5 * Math.sin(Math.PI * k), a.from.z + (to.z - a.from.z) * k);
      a.obj.scale.setScalar(a.scale * (1 - 0.85 * k));
      if (k >= 1) { anims.splice(i, 1); applyPicked(); }
    }
    // 아직 남은 주울 거리 하나가 가끔 반짝인다. 찾기를 돕되 많지 않게 (1-10)
    glintT += dt;
    if (glintT > 3.2 && fx && !calm) {
      glintT = 0;
      const left = items.children.filter((c) => c.visible && !anims.some((a) => a.obj === c));
      if (left.length) {
        const c = left[Math.floor(Math.random() * left.length)];
        counts.glints++;
        fx.sparkle(c.position.x, 0.35, c.position.z, { count: 1, radius: 0.1, size: 0.42, life: 0.7, parent: group });
      }
    }
    if (bubble.visible) {
      bubbleT += dt;
      // 0.08초에 튀어나와 조금 지나쳤다 돌아오고, 1.1초 뒤 0.3초에 걸쳐 옅어진다
      const s = calm ? 1 : Math.min(1, bubbleT / 0.08) * (1 + wobble(0.22, Math.max(0, bubbleT - 0.08), 0.1, 0.1));
      bubble.scale.set(0.92 * s, 1.04 * s, 1);
      if (who) bubble.position.set(who.x, 2.6 + (calm ? 0 : 0.12 * Math.min(1, bubbleT / 0.3)), who.z);
      bubble.material.opacity = bubbleT < 1.1 ? 1 : Math.max(0, 1 - (bubbleT - 1.1) / 0.3);
      if (bubbleT > 1.4) bubble.visible = false;
    }
  }
  return {
    update,
    // 오늘의 발견을 이번에 처음 찾았다
    found(who) {
      counts.found++;
      bubbleT = 0;
      bubble.visible = true;
      if (who) bubble.position.set(who.x, 2.6, who.z);
      if (pickedDay !== day) { picked = new Set(); pickedDay = day; }
      picked.add(SPECIAL_ID);
      if (calm) { applyPicked(); return; }
      pop = { t: 0 };
      fx?.sparkle(find.position.x, 0.95, find.position.z, { count: 6, radius: 0.55, size: 0.42, life: 0.7, parent: group });
    },
    // 보통 주울 거리를 주웠다. 작게 튀어 올라 캐릭터 쪽으로 사라지고 반짝임 셋 (오늘의 발견보다 작게, 1-7)
    pick(id) {
      const obj = items.children.find((c) => c.userData.id === id);
      if (pickedDay !== day) { picked = new Set(); pickedDay = day; }
      picked.add(id);
      if (!obj) return;
      counts.picks++;
      if (calm) { applyPicked(); return; }
      anims.push({ obj, t: 0, from: obj.position.clone(), scale: obj.scale.x });
      fx?.sparkle(obj.position.x, 0.4, obj.position.z, { count: 3, radius: 0.3, size: 0.38, life: 0.6, parent: group });
    },
    // 기록에 적힌 그날 주운 자리 (다른 탭에서 주운 것, 새로 열었을 때)
    setPicked(forDay, forSlot, ids) {
      refresh(forDay, forSlot);
      picked = new Set(ids); pickedDay = forDay;
      applyPicked();
    },
    // 숲 쪽으로 이끄는 잎 몇 장과 작은 반짝임 하나 (forest.js forestCue 가 자리와 방향을 정한다)
    cue(c) {
      if (!fx || calm || !c) return;
      counts.cues++;
      fx.drift(c.x, 0.15, c.z, c.dir, { count: 5, colors: LEAF_COLORS, size: 2.8, parent: group });
      fx.sparkle(c.x + c.dir.x * 0.8, 0.5, c.z + c.dir.z * 0.8, { count: 2, radius: 0.25, size: 0.55, life: 0.8, parent: group });
    },
    // 연출 상태 (자동 시험이 읽는다)
    get state() {
      return {
        ...counts, popping: !!pop, bubble: bubble.visible, itemY: find.children[0]?.position.y ?? 0,
        site: { x: find.position.x, z: find.position.z },
        day, slot, special: find.visible, items: items.children.filter((c) => c.visible).map((c) => c.userData.id),
        decor: { stones: decor.stones.count, tufts: decor.tufts.count, flowers: decor.flowers.count },
      };
    },
  };
}
