// 연못과 낚시 장면을 그린다. 규칙 판정은 하지 않고, fishing-play.js 가 부르는 대로 움직인다.
// 연못은 마당 장면(outside)에 넣어 방 안에서는 보이지 않는다.
import * as THREE from './three.js';
import { POND } from './parts.js';
import { FISH, inWater } from './fishing.js';

const WATER_Y = -0.035; // 물 표면의 높이. 땅(-0.05, -0.07)보다 조금 위다
const CAST_TIME = 0.5;
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
  const drops = Array.from({ length: 18 }, () => {
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
  fishTail.translate(0, 0, -0.68);
  const fishMat = flat(0xffffff, { roughness: 0.4 });
  const eyeMat = flat(0x1b1b1b);
  const leaper = new THREE.Group();
  const leaperBody = new THREE.Mesh(fishBody, fishMat);
  leaperBody.scale.set(0.36, 0.5, 1);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), eyeMat);
  eye.position.set(0.17, 0.08, 0.32);
  const eye2 = eye.clone(); eye2.position.x = -0.17;
  leaper.add(leaperBody, new THREE.Mesh(fishTail, fishMat), eye, eye2);
  leaper.traverse((o) => { o.castShadow = true; });
  leaper.visible = false;
  group.add(leaper);

  // ---- 움직임 상태 ----
  let flight = null; // 던진 찌가 날아가는 중 { from, to, t }
  let swing = null; // 낚싯대를 휘두르는 중 { t }
  let lift = null; // 낚아채며 낚싯대를 드는 중 { t }
  let floatT = 0;
  let dip = 0; // 건드릴 때 찌가 잠깐 잠기는 정도 (1 에서 0 으로)
  let under = false; // 찌가 완전히 잠겼는지
  let underRipple = 0;
  let fish = null; // 다가오는 물고기 { from, to, t, time, size, dir, jolt }
  let flee = null;
  let leap = null; // 물고기가 뛰어올라 머리 위로 오는 중, 그 뒤 들고 있는 중 { from, t, hold }
  const spot = new THREE.Vector3();
  const holdAt = new THREE.Vector3();

  function placeShadow(x, z, dir, size, opacity) {
    shadow.visible = opacity > 0.01;
    shadow.position.x = x; shadow.position.z = z;
    shadow.scale.set(size * 0.42, size, 1);
    shadow.rotation.z = dir; // 원의 세로(로컬 y)가 물고기의 머리와 꼬리 방향이 되게 돌린다
    shadow.material.opacity = opacity;
  }
  function hideAll() {
    flight = null; swing = null; lift = null; fish = null; flee = null; leap = null; dip = 0; under = false;
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

  return {
    group,
    get bobberVisible() { return bobber.visible && !under; },
    // 낚싯대를 들고 찌를 to 로 던진다
    cast(to) {
      hideAll();
      rod.visible = true;
      swing = { t: 0 };
      const from = rodTip();
      flight = { from, to: new THREE.Vector3(to.x, FLOAT_Y, to.z), t: 0 };
      bobber.position.copy(from);
      bobber.visible = true;
      line.visible = true;
    },
    // 찌가 물에 닿았다. 물고기 그림자가 approach 초 동안 찌로 다가온다
    land(to, fishId, approach) {
      flight = null;
      bobber.position.set(to.x, FLOAT_Y, to.z);
      ripple(to.x, to.z, 0.8, 0.9);
      splash(to.x, to.z, 4, 0.6);
      // 찌에서 1.7 떨어진 물속에서 출발한다. 물 밖이면 다른 방향을 찾는다
      let from = null;
      for (let k = 0; k < 12 && !from; k++) {
        const a = k * 2.4 + to.x;
        const x = to.x + Math.cos(a) * 1.7, z = to.z + Math.sin(a) * 1.7;
        if (inWater(x, z, -0.35)) from = { x, z };
      }
      from ||= { x: (to.x + POND.x) / 2, z: (to.z + POND.z) / 2 };
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
    // 물고기가 물었다: 찌가 물속으로 끌려 들어가고, 물이 튀고, 낚싯대가 휜다
    bite() {
      under = true;
      underRipple = 0;
      ripple(bobber.position.x, bobber.position.z, 1.3, 1);
      splash(bobber.position.x, bobber.position.z, 10, 1);
      mark.visible = true;
      view.shake?.(0.12);
    },
    // 놓쳤을 때: 물고기가 달아나고 찌가 떠오른다
    escape() {
      under = false; mark.visible = false;
      if (fish) {
        flee = { x: shadow.position.x, z: shadow.position.z, dir: fish.dir + Math.PI, t: 0, size: fish.size };
        fish = null;
      }
      ripple(bobber.position.x, bobber.position.z, 0.6, 0.7);
    },
    // 낚았을 때: 낚싯대를 들어 올리고, 물고기가 물 밖으로 뛰어 캐릭터 머리 위로 온다
    catchFish(fishId, size) {
      under = false; mark.visible = false;
      fish = null; shadow.visible = false;
      leaper.scale.setScalar(THREE.MathUtils.clamp(size / 45, 0.38, 1.4));
      fishMat.color.setHex(FISH[fishId].color);
      const from = bobber.position.clone(); from.y = WATER_Y;
      leap = { from, t: 0 };
      leaper.position.copy(from);
      leaper.visible = true;
      bobber.visible = false; line.visible = false;
      lift = { t: 0 };
      ripple(from.x, from.z, 1.2, 1);
      splash(from.x, from.z, 14, 1.1);
    },
    reset: hideAll,
    update(dt) {
      floatT += dt;
      if (swing) {
        swing.t += dt;
        const k = swing.t / CAST_TIME;
        rod.rotation.x = k < 0.3 ? ROD_REST - ease(k / 0.3) * 1.0 : ROD_REST - 1.0 + ease(Math.min(1, (k - 0.3) / 0.4)) * 1.0;
        if (k >= 1) swing = null;
      } else if (lift) {
        lift.t += dt;
        rod.rotation.x = ROD_REST - ease(Math.min(1, lift.t / 0.25)) * 1.1; // 휙 들어 올린다
        rod.rotation.z = 0;
      } else if (rod.visible) {
        // 물고기가 물면 끝이 물 쪽으로 휘고 떨린다. 건드릴 때는 살짝 끌려간다
        const pull = under ? 0.32 + (calm ? 0 : Math.sin(floatT * 38) * 0.05) : Math.sin(Math.PI * dip) * 0.12;
        rod.rotation.x += (ROD_REST + pull - rod.rotation.x) * Math.min(1, dt * 20);
        rod.rotation.z = under && !calm ? Math.sin(floatT * 23) * 0.06 : 0;
      }
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / CAST_TIME);
        const k = flight.t;
        bobber.position.lerpVectors(flight.from, flight.to, k);
        bobber.position.y += Math.sin(Math.PI * k) * 1.4;
      } else if (bobber.visible) {
        dip = Math.max(0, dip - dt / 0.3);
        // 건드리면 찌가 거의 다 잠겼다가 떠오른다. 물면 물속으로 사라진다
        const target = under ? -0.45 : FLOAT_Y + Math.sin(floatT * 2.6) * 0.015 - Math.sin(Math.PI * dip) * 0.17;
        bobber.position.y += (target - bobber.position.y) * Math.min(1, dt * (under ? 26 : 22));
        bobber.rotation.z = Math.sin(floatT * 2.1) * 0.08 + (calm ? 0 : Math.sin(Math.PI * dip) * Math.sin(floatT * 40) * 0.25);
        if (under) { underRipple -= dt; if (underRipple <= 0) { ripple(bobber.position.x, bobber.position.z, 0.9, 0.9); splash(bobber.position.x, bobber.position.z, 2, 0.5); underRipple = 0.22; } }
      }
      if (fish) {
        fish.t = Math.min(1, fish.t + dt / fish.time);
        fish.jolt = Math.max(0, fish.jolt - dt / 0.3);
        const k = ease(fish.t);
        const push = Math.sin(Math.PI * fish.jolt) * 0.25; // 찌로 들이밀었다 물러난다
        spot.set(fish.from.x + (fish.to.x - fish.from.x) * k + Math.sin(fish.dir) * push, 0, fish.from.z + (fish.to.z - fish.from.z) * k + Math.cos(fish.dir) * push);
        const wiggle = calm ? 0 : Math.sin(floatT * 6) * 0.14;
        placeShadow(spot.x, spot.z, fish.dir + wiggle, fish.size, Math.min(SHADOW_OPACITY, fish.t * 1.4));
      }
      if (flee) {
        flee.t += dt;
        const k = flee.t / 0.7;
        placeShadow(flee.x + Math.sin(flee.dir) * k * 2.4, flee.z + Math.cos(flee.dir) * k * 2.4, flee.dir, flee.size, Math.max(0, SHADOW_OPACITY * (1 - k)));
        if (k >= 1) { flee = null; shadow.visible = false; }
      }
      if (leap) {
        // 머리 위 자리. 화면에서 옆으로 길게 보이게 든다
        holdAt.set(figure.position.x, 2.35, figure.position.z);
        const basis = view.basis();
        if (leap.t < 1) {
          leap.t = Math.min(1, leap.t + dt / 0.55);
          const k = leap.t;
          leaper.position.lerpVectors(leap.from, holdAt, k);
          leaper.position.y += Math.sin(Math.PI * k) * 1.4;
          leaper.rotation.set(0, 0, 0);
          leaper.lookAt(holdAt.x, leaper.position.y + Math.cos(Math.PI * k) * 1.2, holdAt.z);
        } else {
          // 들고 있는 동안 퍼덕인다
          const flap = calm ? 0 : Math.sin(floatT * 16) * 0.35;
          leaper.position.copy(holdAt);
          leaper.lookAt(holdAt.x + basis.right.x, holdAt.y + flap * 0.4, holdAt.z + basis.right.z);
          leaper.rotateY(flap * 0.5);
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
