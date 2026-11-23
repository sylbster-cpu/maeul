// 연못과 낚시 장면을 그린다. 규칙 판정은 하지 않고, fishing-play.js 가 부르는 대로 움직인다.
// 연못은 마당 장면(outside)에 넣어 방 안에서는 보이지 않는다.
// 연출의 기준은 docs/GAME_PRINCIPLES.md(PR #22)의 "지금 단계 후보" 여섯 가지다(2026-11-22 사용자 결정):
// 낚아챈 순간 신호 몰아 주기, 물기 직전 잠잠함, 몸과 물고기의 찌그러짐, 줄어드는 퍼덕임,
// 무게감에 따른 연출 차이, 빛과 움직임으로 연못 안내.
import * as THREE from './three.js';
import { POND } from './parts.js';
import { FISH, inWater, waterAt } from './fishing.js';
import { wobble } from './fx.js';

const WATER_Y = -0.035; // 물 표면의 높이. 땅(-0.05, -0.07)보다 조금 위다
const CAST_TIME = 0.7; // fishing-play.js 와 같다
// 던지기: 뒤로 젖히는 예비동작(0.26초) 뒤에 2프레임 만에 휙 내던진다 (준비는 느리게, 실행은 빠르게)
const WIND = 0.26;
const FLICK = 0.06;
const HUSH_BACK = 0.22; // 물기 직전 물고기 그림자가 찌에서 물러나는 거리 (예비동작)
const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const ease = (k) => k * k * (3 - 2 * k);

export function createPondView({ view, figure }) {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const group = new THREE.Group();
  view.outside.add(group);

  // ---- 연못: 물가 흙, 물, 깊은 물 ----
  const disc = new THREE.CircleGeometry(1, 56);
  function ellipse(material, rx, rz, y) {
    const m = new THREE.Mesh(disc, material);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(rx, rz, 1);
    m.position.set(POND.x, y, POND.z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  }
  ellipse(flat(0xcdb98a, { roughness: 1 }), POND.rx + 0.5, POND.rz + 0.5, -0.045);
  ellipse(flat(0x5fb0cf, { roughness: 0.3, metalness: 0.05 }), POND.rx, POND.rz, WATER_Y);
  ellipse(flat(0x4a94b6, { roughness: 0.3, metalness: 0.05 }), POND.rx * 0.6, POND.rz * 0.6, WATER_Y + 0.002);

  // 먼 쪽 물가의 돌과 갈대, 물 위의 연잎. 걸을 수 있는 쪽(서쪽)에는 두지 않는다
  const rim = (deg, out = 0.45) => {
    const a = THREE.MathUtils.degToRad(deg);
    return [POND.x + (POND.rx + out) * Math.cos(a), POND.z + (POND.rz + out) * Math.sin(a)];
  };
  const rockGeo = new THREE.IcosahedronGeometry(0.32, 0);
  const rockMat = flat(0x9c9a90, { flatShading: true });
  [-80, -45, -10, 25, 60, 88].forEach((deg, i) => {
    const [x, z] = rim(deg, 0.55 + (i % 2) * 0.15);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, 0.05, z);
    rock.scale.set(1 + (i % 3) * 0.25, 0.6 + (i % 2) * 0.2, 1);
    rock.rotation.set(i, i * 1.7, 0);
    rock.castShadow = true;
    group.add(rock);
  });
  const reedGeo = new THREE.ConeGeometry(0.045, 1, 4);
  reedGeo.translate(0, 0.5, 0);
  const reedMat = flat(0x5f9440, { roughness: 1 });
  const tailGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.22, 6);
  const tailMat = flat(0x7a5232, { roughness: 1 });
  for (const deg of [-62, 8, 42, 75]) {
    const [cx, cz] = rim(deg, 0.15);
    for (let k = 0; k < 5; k++) {
      const reed = new THREE.Group();
      const blade = new THREE.Mesh(reedGeo, reedMat);
      blade.scale.y = 0.7 + ((deg + k * 13) % 5) * 0.12;
      reed.add(blade);
      if (k % 2 === 0) {
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.y = blade.scale.y * 0.88;
        reed.add(tail);
      }
      reed.position.set(cx + Math.cos(k * 2.3) * 0.25, 0, cz + Math.sin(k * 2.3) * 0.25);
      reed.rotation.set(Math.sin(k * 1.9) * 0.18, 0, Math.cos(k * 1.3) * 0.18);
      reed.traverse((o) => { o.castShadow = true; });
      group.add(reed);
    }
  }
  const padMat = flat(0x6aa84f, { roughness: 0.8 });
  for (const [x, z, r] of [[29.2, 16.6, 0.3], [29.6, 19.3, 0.26], [28.6, 20.4, 0.22], [28.2, 15.4, 0.2]]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 16, 0.4, Math.PI * 2 - 0.8), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = x * 3;
    pad.position.set(x, WATER_Y + 0.006, z);
    group.add(pad);
  }

  // ---- 낚싯대: 캐릭터의 오른손에 든다 ----
  const ROD_LEN = 2.1;
  const rod = new THREE.Group();
  const handleGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.42, 8); handleGeo.translate(0, 0.21, 0);
  const shaftGeo = new THREE.CylinderGeometry(0.014, 0.03, ROD_LEN - 0.4, 6); shaftGeo.translate(0, 0.4 + (ROD_LEN - 0.4) / 2, 0);
  rod.add(new THREE.Mesh(handleGeo, flat(0x5b3a24)), new THREE.Mesh(shaftGeo, flat(0xd2ad62)));
  rod.traverse((o) => { o.castShadow = true; });
  rod.position.set(0.3, 0.72, 0.18);
  const ROD_REST = 1.2; // 앞으로 기울인 각도 (라디안). 물을 내려다보는 자세
  rod.rotation.x = ROD_REST;
  rod.visible = false;
  figure.add(rod);
  const tipLocal = new THREE.Vector3(0, ROD_LEN, 0);
  const rodTip = () => { rod.updateWorldMatrix(true, false); return rod.localToWorld(tipLocal.clone()); };

  // ---- 찌와 줄. 휴대폰 화면에서도 흔들림이 보이게 크게 만든다 ----
  const BOB_R = 0.17;
  const bobber = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(BOB_R, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), flat(0xe8402f, { roughness: 0.45 }));
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(BOB_R, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat(0xfbf8ef, { roughness: 0.45 }));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.28, 6), flat(0x2a2320));
  stick.position.y = BOB_R + 0.12;
  bobber.add(top, bottom, stick);
  bobber.traverse((o) => { o.castShadow = true; });
  bobber.visible = false;
  group.add(bobber);
  const FLOAT_Y = 0.04; // 떠 있을 때 찌 가운데의 높이. 아래 절반 가까이가 물에 잠긴다
  const LINE_POINTS = 16;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfbfbf4, transparent: true, opacity: 0.9 }));
  line.frustumCulled = false;
  line.visible = false;
  group.add(line);

  // ---- 물고기 그림자, 물결, 물방울, 느낌표, 뛰어오르는 물고기 ----
  const shadow = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x12262d, transparent: true, opacity: 0, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = WATER_Y + 0.004;
  shadow.visible = false;
  group.add(shadow);
  const SHADOW_OPACITY = 0.55;

  const ringGeo = new THREE.RingGeometry(0.8, 1, 40);
  const rings = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.userData = { life: 0, size: 1, power: 0.8 };
    group.add(m);
    return m;
  });
  function ripple(x, z, size = 0.6, power = 0.8) {
    const m = rings.find((r) => !r.visible) || rings[0];
    m.position.set(x, WATER_Y + 0.008, z);
    m.userData = { life: 1, size, power };
    m.visible = true;
  }
  const dropGeo = new THREE.SphereGeometry(0.05, 6, 4);
  const drops = Array.from({ length: 30 }, () => {
    const m = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.9, depthWrite: false }));
    m.visible = false;
    m.userData = { vx: 0, vy: 0, vz: 0, life: 0 };
    group.add(m);
    return m;
  });
  // 물방울을 튀긴다. 많을수록, 셀수록 크게 튄다
  function splash(x, z, count, power) {
    if (calm) return;
    for (let i = 0; i < count; i++) {
      const m = drops.find((d) => !d.visible) || drops[i % drops.length];
      const a = Math.random() * Math.PI * 2, out = (0.4 + Math.random() * 0.8) * power;
      m.position.set(x, WATER_Y + 0.05, z);
      m.userData = { vx: Math.cos(a) * out, vy: (1.6 + Math.random() * 1.6) * power, vz: Math.sin(a) * out, life: 1 };
      m.scale.setScalar(0.7 + Math.random() * 0.8);
      m.visible = true;
    }
  }

  const markCanvas = document.createElement('canvas');
  markCanvas.width = markCanvas.height = 128;
  {
    const g = markCanvas.getContext('2d');
    g.fillStyle = '#f3a833'; g.strokeStyle = '#1d4035'; g.lineWidth = 8;
    g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#1d4035'; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('!', 64, 70);
  }
  const markTex = new THREE.CanvasTexture(markCanvas);
  markTex.colorSpace = THREE.SRGBColorSpace;
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthTest: false }));
  mark.renderOrder = 10;
  mark.visible = false;
  view.scene.add(mark);

  const fishBody = new THREE.SphereGeometry(0.5, 16, 12);
  const fishTail = new THREE.ConeGeometry(0.3, 0.4, 4);
  fishTail.rotateX(Math.PI / 2); // 뾰족한 끝이 몸 쪽, 넓은 쪽이 꼬리 끝
  fishTail.scale(0.3, 1, 1);
  fishTail.translate(0, 0, -0.23); // 꼬리 축(몸 뒤끝)에서부터 잰다
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const eyeMat = flat(0x1b1b1b);
  // 물고기 하나. 꼬리는 몸 뒤끝을 축으로 따로 흔든다 (몸보다 늦게, 더 크게 따라온다)
  function makeFish(material) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(fishBody, material);
    body.scale.set(0.36, 0.5, 1);
    const tail = new THREE.Group();
    tail.position.z = -0.45;
    tail.add(new THREE.Mesh(fishTail, material));
    const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(0.17, 0.08, 0.32);
    const e2 = e1.clone(); e2.position.x = -0.17;
    g.add(body, tail, e1, e2);
    g.traverse((o) => { o.castShadow = true; });
    g.visible = false;
    g.userData.tail = tail;
    group.add(g);
    return g;
  }
  const fishMat = flat(0xffffff, { roughness: 0.4, emissive: 0x000000 });
  const leaper = makeFish(fishMat);
  const leaperTail = leaper.userData.tail;

  // ---- 연못 안내: 물 위 반짝임, 잠자리, 가끔 뛰는 물고기 ----
  // 화살표 대신 밝은 것과 움직이는 것으로 연못을 알린다. 처음 화면에는 연못 가장자리만 보이므로
  // 마당 쪽(서쪽) 물가에 더 자주 둔다. 너무 많으면 그것 자체가 목적이 되므로 몇 개만 둔다
  const westSpot = (pad, west = 0.65) => {
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
      const x = POND.x + Math.cos(a) * POND.rx * r, z = POND.z + Math.sin(a) * POND.rz * r;
      if (!inWater(x, z, pad)) continue;
      if (x > POND.x && Math.random() < west) continue; // 동쪽 절반은 덜 뽑는다
      return { x, z };
    }
    return { x: POND.x - POND.rx * 0.5, z: POND.z };
  };
  const glintCanvas = document.createElement('canvas');
  glintCanvas.width = glintCanvas.height = 64;
  {
    const g = glintCanvas.getContext('2d');
    const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.25, 'rgba(255,255,240,0.55)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff';
    g.beginPath(); // 네 갈래 빛
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, r = i % 2 ? 4 : 30;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  }
  const glintTex = new THREE.CanvasTexture(glintCanvas);
  const glints = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
    m.visible = false;
    m.userData = { wait: 0.3 + i * 0.35, life: 0 };
    group.add(m);
    return m;
  });
  function makeDragonfly(color) {
    const g = new THREE.Group();
    const bodyMat = flat(color, { roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 0.42, 6), bodyMat);
    body.rotation.x = Math.PI / 2; body.position.z = -0.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), bodyMat);
    head.position.z = 0.15;
    const wingGeo = new THREE.PlaneGeometry(0.2, 0.05); wingGeo.translate(0.1, 0, 0);
    const wingMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const wings = [];
    for (const [side, z] of [[1, 0.07], [-1, 0.07], [1, 0.0], [-1, 0.0]]) {
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.rotation.x = -Math.PI / 2;
      w.scale.x = side;
      w.position.set(0, 0.02, z);
      wings.push(w);
      g.add(w);
    }
    g.add(body, head);
    body.castShadow = true;
    const start = westSpot(0.6, 1);
    g.position.set(start.x - POND.rx * 0.4, 1, start.z);
    g.scale.setScalar(1.4); // 휴대폰 화면에서도 보이게 실제보다 크게
    g.userData = { wings, from: g.position.clone(), to: g.position.clone(), t: 1, hover: Math.random() * 1.5, time: 0.4 };
    group.add(g);
    return g;
  }
  const dragonflies = calm ? [] : [makeDragonfly(0x2f7fb8), makeDragonfly(0xc8452f)];
  // 잠자리가 다음에 머물 곳: 마당 쪽 물가 위나, 가끔 마당 끝까지 나와 집 쪽 사람 눈에 띄게 한다
  function dragonflyGoal() {
    for (let k = 0; k < 6; k++) { const p = dragonflySpot(); if (!nearBobber(p, 1.8)) return p; }
    return new THREE.Vector3(POND.x - POND.rx - 1.5, 1, POND.z - POND.rz * 0.6);
  }
  function dragonflySpot() {
    if (Math.random() < 0.3) return new THREE.Vector3(POND.x - POND.rx - 0.8 - Math.random() * 1.6, 0.8 + Math.random() * 0.5, POND.z + (Math.random() - 0.5) * POND.rz * 1.6);
    const a = THREE.MathUtils.degToRad(110 + Math.random() * 140), out = Math.random() * 1.1;
    return new THREE.Vector3(POND.x + (POND.rx + out) * Math.cos(a), 0.7 + Math.random() * 0.6, POND.z + (POND.rz + out) * Math.sin(a));
  }
  const jumperMat = flat(0x8d9c8a, { roughness: 0.5 });
  const jumper = makeFish(jumperMat);
  jumper.scale.setScalar(0.42);
  let jumpWait = 2.5; // 처음 뛰는 때. 그 뒤로는 5~9초마다
  let jump = null; // { from, to, t }
  let jumps = 0;

  // ---- 움직임 상태 ----
  let flight = null; // 던진 찌가 날아가는 중 { from, to, t, time }
  let throwTo = null; // 젖히는 동안 기다리는 던질 곳
  let retract = null; // 놓친 뒤 찌를 감아 들이는 중 { from, t }
  let twitch = null; // 놓친 뒤 낚싯대가 살짝 튀어 오르는 중 { t }
  let swing = null; // 낚싯대를 휘두르는 중 { t }
  let lift = null; // 낚아채며 낚싯대를 드는 중 { t }
  let floatT = 0;
  let dip = 0; // 건드릴 때 찌가 잠깐 잠기는 정도 (1 에서 0 으로)
  let under = false; // 찌가 완전히 잠겼는지
  let underRipple = 0;
  let fish = null; // 다가오는 물고기 { from, to, t, time, size, dir, jolt }
  let flee = null;
  let leap = null; // 물고기가 뛰어올라 머리 위로 오는 중, 그 뒤 들고 있는 중 { from, t, time, height, hold, onLand }
  let reeling = null; // 낚아챈 뒤 끌어올리는 중 { from, to, p, holding, t, jolt, dir, size }
  let hushed = false; // 물기 직전 잠잠한 때
  let hushK = 0; // 잠잠해진 정도 (0 에서 1 로)
  let landT = 9; // 찌가 물에 닿은 뒤 흐른 시간. 닿을 때 출렁이다 멎는다
  let freeze = 0; // 낚아챈 순간 장면을 멈추는 시간 (히트스톱)
  let flashT = 0; // 물고기가 하얗게 번쩍이는 시간
  let fishScale = 1;
  let weight = 0.5; // 낚은 물고기의 무게감 (0~1)
  let body = null; // 캐릭터 몸의 찌그러짐·늘어남 { t, amount }. amount 가 +면 늘어나고 -면 납작해진다
  let fishSquash = null; // 손에 떨어진 물고기의 찌그러짐 { t, amount }
  let flapAmp = 0; // 지금 퍼덕임의 크기 (자동 시험이 읽는다)
  const fx = { weight: 0, freeze: 0, shake: 0, splash: 0, leapTime: 0, hushes: 0, catches: 0 };
  const spot = new THREE.Vector3();
  const holdAt = new THREE.Vector3();

  function placeShadow(x, z, dir, size, opacity) {
    shadow.visible = opacity > 0.01;
    shadow.position.x = x; shadow.position.z = z;
    shadow.scale.set(size * 0.42, size, 1);
    shadow.rotation.z = dir; // 원의 세로(로컬 y)가 물고기의 머리와 꼬리 방향이 되게 돌린다
    shadow.material.opacity = opacity;
  }
  // 몸과 물고기의 찌그러짐을 되돌린다. 부피를 지키도록 세로로 줄인 만큼 옆으로 늘린다
  const squash = (obj, sy, base = 1) => { const side = 1 / Math.sqrt(sy); obj.scale.set(base * side, base * sy, base * side); };
  function hideAll() {
    flight = null; swing = null; lift = null; fish = null; flee = null; leap = null; dip = 0; under = false;
    throwTo = null; retract = null; twitch = null; bobber.scale.set(1, 1, 1);
    hushed = false; hushK = 0; freeze = 0; flashT = 0; body = null; fishSquash = null; flapAmp = 0;
    reeling = null; figure.rotation.x = 0;
    fishMat.emissive.setHex(0x000000);
    figure.scale.set(1, 1, 1);
    leaperTail.rotation.set(0, 0, 0);
    bobber.visible = false; line.visible = false; shadow.visible = false; mark.visible = false; leaper.visible = false;
    rod.visible = false; rod.rotation.set(ROD_REST, 0, 0);
  }

  function updateLine() {
    if (!line.visible) return;
    const a = rodTip();
    const b = new THREE.Vector3(bobber.position.x, under ? WATER_Y : bobber.position.y + BOB_R + 0.24, bobber.position.z);
    // 물고기가 물면 줄이 팽팽해지고 떨린다
    const sag = flight ? 0.05 : under ? 0 : 0.32;
    const buzz = under && !calm ? 0.025 : 0;
    const arr = lineGeo.attributes.position.array;
    for (let i = 0; i < LINE_POINTS; i++) {
      const k = i / (LINE_POINTS - 1);
      const wob = buzz * Math.sin(floatT * 60 + i) * Math.sin(Math.PI * k);
      arr[i * 3] = a.x + (b.x - a.x) * k + wob;
      arr[i * 3 + 1] = a.y + (b.y - a.y) * k - Math.sin(Math.PI * k) * sag * (1 - k * 0.4);
      arr[i * 3 + 2] = a.z + (b.z - a.z) * k + wob;
    }
    lineGeo.attributes.position.needsUpdate = true;
  }

  // 무게감 w(0~1)에 맞춘 연출의 크기. 송사리는 가볍고 짧게, 메기는 크고 묵직하게
  const scaleBy = (w) => ({
    freeze: calm ? 0 : 0.04 + 0.08 * w, // 멈춤 0.04~0.12초
    shake: 0.04 + 0.11 * w, // 흔들림 (화면 폭의 약 0.4~1.3%)
    splash: Math.round(6 + 12 * w),
    splashPower: 0.7 + 0.6 * w,
    leapTime: 0.45 + 0.25 * w, // 무거우면 오래 난다
    leapHeight: 1.0 + 0.6 * w,
    stretch: 0.05 + 0.07 * w, // 낚아챌 때 몸이 늘어나는 정도
    land: 0.06 + 0.1 * w, // 손에 떨어질 때 몸이 납작해지는 정도
    fishSquash: 0.2 + 0.12 * w,
    flap: 0.32 + 0.12 * w, // 퍼덕임 처음 크기 (라디안)
    flapSpeed: 21 - 9 * w, // 큰 물고기는 느리고 크게 퍼덕인다
  });

  // 찌(끌어올리는 동안은 줄 끝의 물고기) 가까이인지
  const nearBobber = (p, r) => (bobber.visible || reeling) && Math.hypot(p.x - bobber.position.x, p.z - bobber.position.z) < r;
  // 연못 안내를 움직인다. 반짝임은 늘, 잠자리는 움직임 줄이기를 켜지 않았을 때, 뛰는 물고기는
  // 연못에서 멀리 있고 낚시를 하지 않을 때만 (가까이서는 던질 곳을 고르는 단서처럼 보이지 않게)
  function updateGuide(dt) {
    for (const m of glints) {
      const u = m.userData;
      if (u.life > 0) {
        u.life -= dt / 0.75;
        if (u.life <= 0) { m.visible = false; u.wait = 0.4 + Math.random() * 2.2; continue; }
        const k = Math.sin(Math.PI * u.life);
        m.material.opacity = k * 0.95;
        const size = calm ? 0.5 : 0.2 + 0.45 * k;
        m.scale.set(size, size, 1);
        m.material.rotation = u.spin + (calm ? 0 : (1 - u.life) * 0.6);
      } else if ((u.wait -= dt) <= 0) {
        const p = westSpot(-0.35);
        // 낚시하는 동안 찌 가까이에는 띄우지 않는다. 찌 둘레의 움직임은 입질 신호로만 읽히게 한다
        if (nearBobber(p, 1.6)) { u.wait = 0.3; continue; }
        m.position.set(p.x, WATER_Y + 0.06, p.z);
        u.life = 1; u.spin = Math.random() * Math.PI;
        m.visible = true;
      }
    }
    for (const d of dragonflies) {
      const u = d.userData;
      for (const [i, w] of u.wings.entries()) w.rotation.z = Math.sin(floatT * 55 + i * 1.3) * 0.5;
      if (u.t < 1) {
        u.t = Math.min(1, u.t + dt / u.time);
        const k = ease(u.t);
        d.position.lerpVectors(u.from, u.to, k);
        d.position.y += Math.sin(Math.PI * u.t) * 0.15;
      } else if ((u.hover -= dt) > 0) {
        d.position.y = u.to.y + Math.sin(floatT * 5 + u.to.x) * 0.04; // 머물며 살짝 오르내린다
      } else {
        u.from.copy(d.position);
        u.to.copy(dragonflyGoal());
        const dist = u.from.distanceTo(u.to);
        u.time = 0.25 + dist * 0.18; // 휙 날아간다
        u.t = 0;
        u.hover = 0.6 + Math.random() * 1.6;
        d.rotation.y = Math.atan2(u.to.x - u.from.x, u.to.z - u.from.z);
      }
    }
    const far = Math.hypot(figure.position.x - POND.x, figure.position.z - POND.z) > 7;
    if (jump) {
      jump.t = Math.min(1, jump.t + dt / 0.6);
      const k = jump.t;
      jumper.position.lerpVectors(jump.from, jump.to, k);
      jumper.position.y = WATER_Y + Math.sin(Math.PI * k) * 0.55;
      jumper.lookAt(jump.to.x, jumper.position.y + Math.cos(Math.PI * k) * 0.6, jump.to.z);
      jumper.userData.tail.rotation.y = Math.sin(floatT * 30) * 0.5;
      if (k >= 1) { jumper.visible = false; ripple(jump.to.x, jump.to.z, 0.7, 0.8); splash(jump.to.x, jump.to.z, 3, 0.45); jump = null; }
    } else if (!calm && far && !rod.visible && (jumpWait -= dt) <= 0) {
      const a = westSpot(-0.8, 0.85);
      const turn = Math.random() * Math.PI * 2;
      const to = new THREE.Vector3(a.x + Math.cos(turn) * 0.8, WATER_Y, a.z + Math.sin(turn) * 0.8);
      if (!inWater(to.x, to.z, -0.4)) to.set(a.x, WATER_Y, a.z + 0.01);
      jump = { from: new THREE.Vector3(a.x, WATER_Y, a.z), to, t: 0 };
      jumper.position.copy(jump.from);
      jumper.visible = true;
      ripple(a.x, a.z, 0.7, 0.8);
      splash(a.x, a.z, 3, 0.45);
      jumps++;
      jumpWait = 5 + Math.random() * 4;
    }
  }

  return {
    group,
    get bobberVisible() { return bobber.visible && !under; },
    // 나무에 가리면 안 되는 점: 떠 있는 찌(꼭지까지), 끌어올리는 동안의 물고기 그림자
    get watchPoints() {
      const out = [];
      if (bobber.visible) out.push({ x: bobber.position.x, y: bobber.position.y, z: bobber.position.z }, { x: bobber.position.x, y: bobber.position.y + 0.3, z: bobber.position.z });
      if (shadow.visible) out.push({ x: shadow.position.x, y: WATER_Y, z: shadow.position.z });
      return out;
    },
    // 연출 상태 (자동 시험이 읽는다)
    get fx() {
      return {
        ...fx, hushed, flapAmp, holdTime: leap && leap.t >= 1 ? leap.hold : 0, bodyScaleY: figure.scale.y, frozen: freeze > 0, flashing: flashT > 0, jumps,
        glints: glints.filter((m) => m.visible).map((m) => ({ x: m.position.x, z: m.position.z })),
        dragonflies: dragonflies.map((d) => ({ x: d.position.x, y: d.position.y, z: d.position.z })),
      };
    },
    // 낚싯대를 들고 찌를 to 로 던진다
    cast(to) {
      hideAll();
      rod.visible = true;
      swing = { t: 0 };
      throwTo = new THREE.Vector3(to.x, FLOAT_Y, to.z);
      bobber.position.copy(rodTip());
      bobber.visible = true;
      line.visible = true;
    },
    // 찌가 물에 닿았다. 물고기 그림자가 approach 초 동안 찌로 다가온다
    land(to, fishId, approach) {
      flight = null;
      bobber.position.set(to.x, FLOAT_Y, to.z);
      landT = 0; // 닿은 뒤 출렁이다 멎는다
      ripple(to.x, to.z, 0.8, 0.9);
      splash(to.x, to.z, 4, 0.6);
      // 찌에서 1.7 떨어진 물속에서 출발한다. 물 밖이면 다른 방향을 찾는다
      let from = null;
      for (let k = 0; k < 12 && !from; k++) {
        const a = k * 2.4 + to.x;
        const x = to.x + Math.cos(a) * 1.7, z = to.z + Math.sin(a) * 1.7;
        if (inWater(x, z, -0.35)) from = { x, z };
      }
      // 그래도 못 찾으면 깊은 쪽에서: 바다는 남쪽, 연못은 가운데 쪽
      from ||= waterAt(to.x, to.z) === 'sea' ? { x: to.x, z: to.z + 1.7 } : { x: (to.x + POND.x) / 2, z: (to.z + POND.z) / 2 };
      const near = { x: to.x + (from.x - to.x) * 0.22, z: to.z + (from.z - to.z) * 0.22 };
      fish = { from, to: near, t: 0, time: Math.max(0.3, approach), size: FISH[fishId].shadow * 1.3, dir: Math.atan2(to.x - from.x, to.z - from.z), jolt: 0 };
    },
    // 물고기가 찌를 건드린다: 찌가 톡 잠겼다 떠오르고, 그림자가 찌로 들이민다
    nibble() {
      dip = 1;
      ripple(bobber.position.x, bobber.position.z, 0.6, 0.9);
      splash(bobber.position.x, bobber.position.z, 2, 0.35);
      if (fish) fish.jolt = 1;
    },
    // 진짜로 물기 직전: 찌와 물고기가 잠잠해지고, 그림자가 살짝 물러난다 (세게 나가려면 먼저 반대로)
    hush() { hushed = true; fx.hushes++; },
    // 물고기가 물었다: 물러났던 그림자가 찌로 달려들고, 찌가 물속으로 끌려 들어가고, 물이 튀고, 낚싯대가 휜다
    bite() {
      hushed = false;
      under = true;
      underRipple = 0;
      if (fish) fish.jolt = 1;
      ripple(bobber.position.x, bobber.position.z, 1.3, 1);
      splash(bobber.position.x, bobber.position.z, 10, 1);
      mark.visible = true;
      view.shake?.(0.12);
    },
    // 놓쳤을 때: 물고기가 달아나고 찌가 떠오른다
    escape() {
      under = false; mark.visible = false; hushed = false;
      // 찌를 감아 들이고 낚싯대가 살짝 튀어 오른다 (놓친 것도 몸짓으로 끝맺는다)
      retract = { from: bobber.position.clone(), t: 0 };
      twitch = { t: 0 };
      if (fish) {
        flee = { x: shadow.position.x, z: shadow.position.z, dir: fish.dir + Math.PI, t: 0, size: fish.size };
        fish = null;
      }
      ripple(bobber.position.x, bobber.position.z, 0.6, 0.7);
    },
    // 낚아챘을 때(누르고 버티기의 시작). 그 순간에 신호를 몰아 준다: 장면이 잠깐 멈추고, 화면이 흔들리고, 물이 크게 튀고,
    // 몸이 늘어나며 낚싯대를 홱 챈다. 찌는 물속으로 끌려 들어가고, 물고기 그림자가 버둥대며 버틴다. 크기는 무게감 w 에 맞춘다
    hook(fishId, size, w = 0.5) {
      mark.visible = false; hushed = false;
      weight = w;
      const k = scaleBy(w);
      fishScale = THREE.MathUtils.clamp(size / 45, 0.38, 1.4);
      fishMat.color.setHex(FISH[fishId].color);
      const from = new THREE.Vector3(bobber.position.x, WATER_Y, bobber.position.z);
      // 끌어올 끝자리: 캐릭터 쪽으로 가다가 물가에 닿기 직전
      const dx = figure.position.x - from.x, dz = figure.position.z - from.z, len = Math.hypot(dx, dz) || 1;
      const to = from.clone();
      for (let d = 0; d < len; d += 0.1) {
        const x = from.x + (dx / len) * d, z = from.z + (dz / len) * d;
        if (!inWater(x, z, -0.35)) break;
        to.set(x, WATER_Y, z);
      }
      reeling = { from, to, p: 0, holding: false, t: 0, jolt: 1, dir: Math.atan2(dx, dz) + Math.PI, size: FISH[fishId].shadow * 1.3 };
      fish = null; flee = null;
      under = true; // 줄을 팽팽하게 그린다
      bobber.visible = false; line.visible = true;
      lift = null;
      rod.rotation.set(ROD_REST - 0.6, 0, 0); // 누른 결과는 그 프레임에 바로 보인다: 홱 챈 자세
      freeze = k.freeze;
      body = { t: 0, amount: calm ? 0 : k.stretch };
      squash(figure, 1 + body.amount);
      view.shake?.(k.shake);
      ripple(from.x, from.z, 0.9 + 0.8 * w, 1);
      splash(from.x, from.z, k.splash, k.splashPower);
      Object.assign(fx, { weight: w, freeze: k.freeze, shake: k.shake, splash: k.splash, leapTime: k.leapTime, catches: fx.catches + 1 });
    },
    // 끌어올린 정도(0~1)와 누르고 있는지. 누르고 있으면 낚싯대가 크게 휘고 몸이 뒤로 버틴다
    reel(p, holding) { if (reeling) { reeling.p = p; reeling.holding = holding; } },
    // 물고기가 한 번 홱 당긴다: 그림자가 튀고 물이 튄다
    tug() {
      if (!reeling) return;
      reeling.jolt = 1;
      ripple(shadow.position.x, shadow.position.z, 0.7, 0.8);
      splash(shadow.position.x, shadow.position.z, reeling.holding ? 4 : 2, 0.55);
    },
    // 다 끌어올렸다: 물고기가 하얗게 번쩍이며 물을 박차고 솟아 머리 위 손에 떨어진다
    // (몸과 물고기가 납작해졌다 돌아오고) 퍼덕임이 차츰 잦아든다
    leapOut(fishId, size, w = weight, onLand = null) {
      const k = scaleBy(w);
      const from = new THREE.Vector3(shadow.position.x, WATER_Y, shadow.position.z);
      reeling = null; under = false; shadow.visible = false;
      bobber.visible = false; line.visible = false;
      figure.rotation.x = 0;
      leaper.scale.setScalar(fishScale);
      leaper.position.copy(from);
      leaper.visible = true;
      leaper.rotation.set(-Math.PI / 2, 0, 0); // 물을 박차고 위로 솟는 모양
      leap = { from, t: 0, time: k.leapTime, height: k.leapHeight, hold: 0, onLand };
      lift = { t: 0 }; // 낚싯대를 휙 들어 올린다
      flashT = 0.09;
      fishMat.emissive.setHex(0xffffff);
      ripple(from.x, from.z, 0.8 + 0.6 * w, 1);
      splash(from.x, from.z, Math.round(k.splash * 0.7), k.splashPower);
    },
    get reeling() { return reeling ? { p: reeling.p, holding: reeling.holding } : null; },
    reset: hideAll,
    update(dt) {
      // 흰 번쩍은 멈춘 동안에도 센다. 멈춘 동안에는 아무것도 움직이지 않는다 (줄만 맞춘다)
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) fishMat.emissive.setHex(0x000000); }
      if (freeze > 0) { freeze -= dt; updateLine(); return; }
      floatT += dt;
      updateGuide(dt);
      hushK = Math.max(0, Math.min(1, hushK + (hushed ? dt / 0.15 : -dt / 0.08)));
      if (body) {
        // 늘어났다(+) 납작해졌다(-) 하며 줄어든다. 가장 심한 모양은 한순간만 보인다
        body.t += dt;
        const sy = 1 + body.amount * Math.exp(-body.t / 0.12) * Math.cos(Math.PI * body.t / 0.1);
        squash(figure, sy);
        if (body.t > 0.6) { body = null; figure.scale.set(1, 1, 1); }
      }
      if (swing) {
        // 뒤로 젖히며 몸도 뒤로 기울고 → 2프레임 만에 휙 내던지며 앞으로 → 낚싯대와 몸이 흔들리다 멎는다
        swing.t += dt;
        const t = swing.t;
        let bend;
        if (t < WIND) { const k = ease(t / WIND); rod.rotation.x = ROD_REST - 1.15 * k; bend = -0.12 * k; }
        else if (t < WIND + FLICK) { const k = (t - WIND) / FLICK; rod.rotation.x = ROD_REST - 1.15 + 1.45 * k; bend = -0.12 + 0.24 * k; }
        else { const u = t - WIND - FLICK; rod.rotation.x = ROD_REST + wobble(0.3, u, 0.12, 0.12); bend = wobble(0.12, u, 0.14, 0.12); }
        if (!calm) figure.rotation.x = bend;
        if (throwTo && t >= WIND) { flight = { from: rodTip(), to: throwTo, t: 0, time: CAST_TIME - WIND - FLICK / 2 }; throwTo = null; }
        if (t >= CAST_TIME) swing = null;
      } else if (twitch) {
        twitch.t += dt;
        rod.rotation.x = ROD_REST - 0.45 * Math.exp(-twitch.t / 0.18);
        if (twitch.t > 0.8) twitch = null;
      } else if (reeling) {
        // 처음 0.15초는 홱 챈 자세, 그 뒤로는 물고기에 끌려 휘고 떨린다. 누르고 있으면 더 크게 휘고 몸이 뒤로 버틴다
        reeling.t += dt;
        if (reeling.t > 0.15) {
          const bend = reeling.holding ? 0.5 : 0.25;
          const tremble = calm ? 0 : Math.sin(floatT * (reeling.holding ? 41 : 23)) * (reeling.holding ? 0.06 : 0.03);
          rod.rotation.x += (ROD_REST + bend + tremble - rod.rotation.x) * Math.min(1, dt * 18);
          rod.rotation.z = calm ? 0 : Math.sin(floatT * 17) * (reeling.holding ? 0.07 : 0.035);
        }
        if (!calm) figure.rotation.x = reeling.holding ? -0.1 : -0.03;
      } else if (lift) {
        lift.t += dt;
        rod.rotation.x = ROD_REST - ease(Math.min(1, lift.t / 0.25)) * 1.1; // 휙 들어 올린다
        rod.rotation.z = 0;
      } else if (rod.visible) {
        // 물고기가 물면 끝이 물 쪽으로 휘고 떨린다. 건드릴 때는 살짝 끌려간다. 잠잠할 때는 가만히 있다
        const pull = under ? 0.32 + (calm ? 0 : Math.sin(floatT * 38) * 0.05) : Math.sin(Math.PI * dip) * 0.12;
        rod.rotation.x += (ROD_REST + pull - rod.rotation.x) * Math.min(1, dt * 20);
        rod.rotation.z = under && !calm ? Math.sin(floatT * 23) * 0.06 : 0;
      }
      if (throwTo && bobber.visible) {
        bobber.position.copy(rodTip()); // 젖히는 동안은 낚싯대 끝에 매달려 있다
      } else if (flight) {
        flight.t = Math.min(1, flight.t + dt / flight.time);
        const k = flight.t;
        bobber.position.lerpVectors(flight.from, flight.to, k);
        bobber.position.y += Math.sin(Math.PI * k) * 1.4;
      } else if (retract) {
        retract.t += dt;
        const k = Math.min(1, retract.t / 0.32);
        bobber.position.lerpVectors(retract.from, rodTip(), ease(k));
        bobber.position.y += Math.sin(Math.PI * k) * 0.3;
        if (k >= 1) { retract = null; bobber.visible = false; line.visible = false; }
      } else if (bobber.visible) {
        dip = Math.max(0, dip - dt / 0.3);
        landT += dt;
        // 기다리는 동안은 찌가 조금씩 흔들려 볼 것이 있고, 물기 직전에는 딱 멈춘다.
        // 물에 닿으면 출렁이다 멎는다. 건드리면 거의 다 잠겼다가 떠오른다. 물면 물속으로 사라진다
        const idle = (1 - hushK) * (calm ? 0 : 1);
        const settle = calm ? 0 : -0.11 * Math.exp(-landT / 0.22) * Math.cos(2 * Math.PI * landT / 0.3);
        const target = under ? -0.45 : FLOAT_Y + Math.sin(floatT * 2.6) * 0.028 * idle + settle - Math.sin(Math.PI * dip) * 0.17;
        bobber.position.y += (target - bobber.position.y) * Math.min(1, dt * (under ? 26 : 22));
        bobber.rotation.z = Math.sin(floatT * 2.1) * 0.1 * idle + (calm ? 0 : Math.sin(Math.PI * dip) * Math.sin(floatT * 40) * 0.25);
        // 물에 닿는 순간 찌가 납작해졌다 돌아온다
        if (landT < 0.4 && !calm) squash(bobber, 1 + wobble(-0.35, landT, 0.08, 0.09)); else bobber.scale.set(1, 1, 1);
        if (under) { underRipple -= dt; if (underRipple <= 0) { ripple(bobber.position.x, bobber.position.z, 0.9, 0.9); splash(bobber.position.x, bobber.position.z, 2, 0.5); underRipple = 0.22; } }
      }
      if (fish) {
        fish.t = Math.min(1, fish.t + dt / fish.time);
        fish.jolt = Math.max(0, fish.jolt - dt / 0.3);
        const k = ease(fish.t);
        // 찌로 들이밀었다 물러난다. 물기 직전에는 찌에서 조금 물러나 멈춘다
        const push = Math.sin(Math.PI * fish.jolt) * 0.25 - hushK * HUSH_BACK;
        spot.set(fish.from.x + (fish.to.x - fish.from.x) * k + Math.sin(fish.dir) * push, 0, fish.from.z + (fish.to.z - fish.from.z) * k + Math.cos(fish.dir) * push);
        const wiggle = calm ? 0 : Math.sin(floatT * 6) * 0.14 * (1 - hushK);
        placeShadow(spot.x, spot.z, fish.dir + wiggle, fish.size, Math.min(SHADOW_OPACITY + 0.12 * hushK, fish.t * 1.4));
      }
      if (reeling) {
        // 물가 쪽으로 끌려오면서 좌우로 버둥댄다. 홱 당길 때마다 크게 튄다. 줄 끝(찌 자리)이 그림자를 따라간다
        reeling.jolt = Math.max(0, reeling.jolt - dt / 0.25);
        spot.lerpVectors(reeling.from, reeling.to, reeling.p);
        const side = calm ? 0 : Math.sin(floatT * (reeling.holding ? 9 : 6)) * 0.35 * (1 - reeling.p * 0.5) + Math.sin(Math.PI * reeling.jolt) * 0.2;
        spot.x += Math.cos(reeling.dir) * side;
        spot.z -= Math.sin(reeling.dir) * side;
        placeShadow(spot.x, spot.z, reeling.dir + (calm ? 0 : Math.sin(floatT * 12) * 0.5), reeling.size, 0.62);
        bobber.position.set(spot.x, WATER_Y, spot.z);
        if (!calm && Math.random() < dt * (reeling.holding ? 5 : 2)) ripple(spot.x, spot.z, 0.5, 0.6);
      }
      if (flee) {
        flee.t += dt;
        const k = flee.t / 0.7;
        placeShadow(flee.x + Math.sin(flee.dir) * k * 2.4, flee.z + Math.cos(flee.dir) * k * 2.4, flee.dir, flee.size, Math.max(0, SHADOW_OPACITY * (1 - k)));
        if (k >= 1) { flee = null; shadow.visible = false; }
      }
      if (leap) {
        // 머리 위 자리. 화면에서 옆으로 길게 보이게 든다. 몸이 납작해지면 손도 함께 내려간다
        holdAt.set(figure.position.x, 2.35 * figure.scale.y, figure.position.z);
        const basis = view.basis();
        const s = scaleBy(weight);
        if (leap.t < 1) {
          leap.t = Math.min(1, leap.t + dt / leap.time);
          const k = leap.t;
          leaper.position.lerpVectors(leap.from, holdAt, k);
          leaper.position.y += Math.sin(Math.PI * k) * leap.height;
          leaper.rotation.set(0, 0, 0);
          leaper.lookAt(holdAt.x, leaper.position.y + Math.cos(Math.PI * k) * 1.2, holdAt.z);
          // 빠를 때(뛰어오를 때와 떨어질 때) 나는 쪽으로 늘어나고, 꼭대기에서는 제 모양에 가깝다
          const stretch = calm ? 1 : 1 + 0.3 * Math.abs(Math.cos(Math.PI * k));
          leaper.scale.set(fishScale / Math.sqrt(stretch), fishScale / Math.sqrt(stretch), fishScale * stretch);
          leaperTail.rotation.y = calm ? 0 : Math.sin(floatT * 34) * 0.45;
          if (leap.t >= 1) {
            // 손에 떨어졌다: 몸과 물고기가 납작해졌다 돌아온다
            leap.hold = 0;
            body = { t: 0, amount: calm ? 0 : -s.land };
            fishSquash = calm ? null : { t: 0, amount: s.fishSquash };
            leap.onLand?.();
          }
        } else {
          // 들고 있는 동안 퍼덕인다. 처음엔 크게, 반 번 흔들 때마다 줄어 1.5초쯤에 거의 멎고
          // 끝의 작은 떨림만 조금 더 간다. 꼬리는 몸보다 늦게, 더 크게 따라온다
          leap.hold += dt;
          const h = leap.hold;
          flapAmp = calm ? 0 : s.flap * Math.exp(-h / 0.5) + 0.035 * Math.exp(-h / 2);
          const phase = s.flapSpeed * h;
          const flap = flapAmp * Math.sin(phase);
          leaper.position.copy(holdAt);
          leaper.lookAt(holdAt.x + basis.right.x, holdAt.y + flap * 0.4, holdAt.z + basis.right.z);
          leaper.rotateY(flap * 0.5);
          leaperTail.rotation.y = 1.7 * flapAmp * Math.sin(phase - 1.0);
          let sy = 1;
          if (fishSquash) {
            fishSquash.t += dt;
            sy = 1 - fishSquash.amount * Math.exp(-fishSquash.t / 0.1) * Math.cos(Math.PI * fishSquash.t / 0.09);
            if (fishSquash.t > 0.5) fishSquash = null;
          }
          squash(leaper, sy, fishScale);
        }
      }
      if (mark.visible) {
        const pulse = calm ? 1 : 1 + Math.abs(Math.sin(floatT * 9)) * 0.15;
        mark.scale.set(1.05 * pulse, 1.05 * pulse, 1);
        mark.position.set(figure.position.x, 2.6, figure.position.z);
      }
      for (const r of rings) {
        if (!r.visible) continue;
        r.userData.life -= dt / 0.8;
        if (r.userData.life <= 0) { r.visible = false; continue; }
        const k = 1 - r.userData.life;
        r.scale.setScalar(0.12 + k * r.userData.size);
        r.material.opacity = r.userData.life * r.userData.power;
      }
      for (const d of drops) {
        if (!d.visible) continue;
        const u = d.userData;
        u.life -= dt / 0.7;
        u.vy -= 9 * dt;
        d.position.x += u.vx * dt; d.position.y += u.vy * dt; d.position.z += u.vz * dt;
        if (u.life <= 0 || d.position.y < WATER_Y) { d.visible = false; continue; }
        d.material.opacity = Math.min(0.9, u.life * 1.5);
      }
      updateLine();
    },
  };
}
