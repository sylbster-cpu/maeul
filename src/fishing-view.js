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
  const handleGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.42, 8); handleGeo.translate(0, 0.21, 0);
  const shaftGeo = new THREE.CylinderGeometry(0.011, 0.024, ROD_LEN - 0.4, 6); shaftGeo.translate(0, 0.4 + (ROD_LEN - 0.4) / 2, 0);
  rod.add(new THREE.Mesh(handleGeo, flat(0x5b3a24)), new THREE.Mesh(shaftGeo, flat(0xd2ad62)));
  rod.traverse((o) => { o.castShadow = true; });
  rod.position.set(0.3, 0.72, 0.18);
  const ROD_REST = 0.95; // 앞으로 기울인 각도 (라디안)
  rod.rotation.x = ROD_REST;
  rod.visible = false;
  figure.add(rod);
  const tipLocal = new THREE.Vector3(0, ROD_LEN, 0);
  const rodTip = () => { rod.updateWorldMatrix(true, false); return rod.localToWorld(tipLocal.clone()); };

  // ---- 찌와 줄 ----
  const bobber = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(0xe0473a, { roughness: 0.5 }));
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat(0xf7f4ea, { roughness: 0.5 }));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), flat(0x2a2320));
  stick.position.y = 0.16;
  bobber.add(top, bottom, stick);
  bobber.visible = false;
  group.add(bobber);
  const LINE_POINTS = 16;
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(LINE_POINTS * 3), 3));
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfbfbf4, transparent: true, opacity: 0.85 }));
  line.frustumCulled = false;
  line.visible = false;
  group.add(line);

  // ---- 물고기 그림자, 물결, 느낌표, 뛰어오르는 물고기 ----
  const shadow = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x173038, transparent: true, opacity: 0, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = WATER_Y + 0.004;
  shadow.visible = false;
  group.add(shadow);

  const ringGeo = new THREE.RingGeometry(0.82, 1, 36);
  const rings = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.userData = { life: 0, size: 1, power: 0.8 };
    group.add(m);
    return m;
  });
  function ripple(x, z, size = 0.6, power = 0.7) {
    const m = rings.find((r) => !r.visible) || rings[0];
    m.position.set(x, WATER_Y + 0.008, z);
    m.userData = { life: 1, size, power };
    m.visible = true;
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
  mark.scale.set(0.75, 0.75, 1);
  mark.renderOrder = 10;
  mark.visible = false;
  view.scene.add(mark);

  const fishBody = new THREE.SphereGeometry(0.5, 14, 10);
  const fishTail = new THREE.ConeGeometry(0.28, 0.36, 4);
  fishTail.rotateX(Math.PI / 2); // 뾰족한 끝이 몸 쪽, 넓은 쪽이 꼬리 끝
  fishTail.scale(0.35, 1, 1);
  fishTail.translate(0, 0, -0.66);
  const fishMat = flat(0xffffff, { roughness: 0.5 });
  const leaper = new THREE.Group();
  const leaperBody = new THREE.Mesh(fishBody, fishMat);
  leaperBody.scale.set(0.42, 0.55, 1);
  leaper.add(leaperBody, new THREE.Mesh(fishTail, fishMat));
  leaper.traverse((o) => { o.castShadow = true; });
  leaper.visible = false;
  group.add(leaper);

  // ---- 움직임 상태 ----
  let flight = null; // 던진 찌가 날아가는 중 { from, to, t }
  let swing = null; // 낚싯대를 휘두르는 중 { t }
  let floatT = 0;
  let dip = 0; // 건드릴 때 찌가 잠깐 잠기는 정도
  let under = false; // 찌가 완전히 잠겼는지
  let underRipple = 0;
  let fish = null; // 다가오는 물고기 { from, to, t, time, size, dir }
  let flee = null;
  let leap = null;
  const spot = new THREE.Vector3();

  function placeShadow(x, z, dir, size, opacity) {
    shadow.visible = opacity > 0.01;
    shadow.position.x = x; shadow.position.z = z;
    shadow.scale.set(size * 0.42, size, 1);
    shadow.rotation.z = dir; // 원의 세로(로컬 y)가 물고기의 머리와 꼬리 방향이 되게 돌린다
    shadow.material.opacity = opacity;
  }
  function hideAll() {
    flight = null; swing = null; fish = null; flee = null; leap = null; dip = 0; under = false;
    bobber.visible = false; line.visible = false; shadow.visible = false; mark.visible = false; leaper.visible = false;
    rod.visible = false; rod.rotation.x = ROD_REST;
  }

  function updateLine() {
    if (!line.visible) return;
    const a = rodTip();
    const b = new THREE.Vector3(bobber.position.x, under ? WATER_Y : bobber.position.y + 0.24, bobber.position.z);
    const sag = flight ? 0.05 : 0.35;
    const arr = lineGeo.attributes.position.array;
    for (let i = 0; i < LINE_POINTS; i++) {
      const k = i / (LINE_POINTS - 1);
      arr[i * 3] = a.x + (b.x - a.x) * k;
      arr[i * 3 + 1] = a.y + (b.y - a.y) * k - Math.sin(Math.PI * k) * sag * (1 - k * 0.4);
      arr[i * 3 + 2] = a.z + (b.z - a.z) * k;
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
      flight = { from, to: new THREE.Vector3(to.x, 0.02, to.z), t: 0 };
      bobber.position.copy(from);
      bobber.visible = true;
      line.visible = true;
    },
    // 찌가 물에 닿았다. 물고기 그림자가 approach 초 동안 찌로 다가온다
    land(to, fishId, approach) {
      flight = null;
      bobber.position.set(to.x, 0.02, to.z);
      ripple(to.x, to.z, 0.7, 0.8);
      // 찌에서 1.6 떨어진 물속에서 출발한다. 물 밖이면 다른 방향을 찾는다
      let from = null;
      for (let k = 0; k < 12 && !from; k++) {
        const a = k * 2.4 + to.x;
        const x = to.x + Math.cos(a) * 1.6, z = to.z + Math.sin(a) * 1.6;
        if (inWater(x, z, -0.35)) from = { x, z };
      }
      from ||= { x: (to.x + POND.x) / 2, z: (to.z + POND.z) / 2 };
      const near = { x: to.x + (from.x - to.x) * 0.18, z: to.z + (from.z - to.z) * 0.18 };
      fish = { from, to: near, t: 0, time: Math.max(0.3, approach), size: FISH[fishId].shadow, dir: Math.atan2(to.x - from.x, to.z - from.z) };
    },
    nibble() {
      dip = 1;
      ripple(bobber.position.x, bobber.position.z, 0.35, 0.55);
      if (fish) fish.jolt = 1;
    },
    bite() {
      under = true;
      underRipple = 0;
      ripple(bobber.position.x, bobber.position.z, 0.9, 1);
      mark.visible = true;
    },
    // 놓쳤을 때: 물고기가 달아나고 찌가 떠오른다
    escape() {
      under = false; mark.visible = false;
      if (fish) {
        const away = fish.dir + Math.PI;
        flee = { x: shadow.position.x, z: shadow.position.z, dir: away, t: 0, size: fish.size };
        fish = null;
      }
      ripple(bobber.position.x, bobber.position.z, 0.5, 0.6);
    },
    // 낚았을 때: 물고기가 물 밖으로 뛰어 캐릭터 쪽으로 온다
    catchFish(fishId, size) {
      under = false; mark.visible = false;
      fish = null; shadow.visible = false;
      const len = THREE.MathUtils.clamp(size / 60, 0.22, 1.1);
      leaper.scale.setScalar(len);
      fishMat.color.setHex(FISH[fishId].color);
      const from = bobber.position.clone(); from.y = 0;
      const to = new THREE.Vector3(figure.position.x, 0.9, figure.position.z).lerp(from, 0.25);
      leap = { from, to, t: 0 };
      leaper.visible = true;
      bobber.visible = false; line.visible = false;
      ripple(from.x, from.z, 1, 1);
    },
    reset: hideAll,
    update(dt) {
      floatT += dt;
      if (swing) {
        swing.t += dt;
        const k = swing.t / CAST_TIME;
        rod.rotation.x = k < 0.3 ? ROD_REST - ease(k / 0.3) * 0.8 : ROD_REST - 0.8 + ease(Math.min(1, (k - 0.3) / 0.4)) * 1.1;
        if (k >= 1) { swing = null; rod.rotation.x = ROD_REST + 0.3; }
      }
      if (flight) {
        flight.t = Math.min(1, flight.t + dt / CAST_TIME);
        const k = flight.t;
        bobber.position.lerpVectors(flight.from, flight.to, k);
        bobber.position.y += Math.sin(Math.PI * k) * 1.3;
      } else if (bobber.visible) {
        dip = Math.max(0, dip - dt / 0.22);
        const target = under ? -0.22 : 0.02 + Math.sin(floatT * 3) * 0.012 - Math.sin(Math.PI * dip) * 0.07;
        bobber.position.y += (target - bobber.position.y) * Math.min(1, dt * (under ? 30 : 18));
        bobber.rotation.z = Math.sin(floatT * 2.1) * 0.08;
        if (under) { underRipple -= dt; if (underRipple <= 0) { ripple(bobber.position.x, bobber.position.z, 0.7, 0.9); underRipple = 0.28; } }
      }
      if (fish) {
        fish.t = Math.min(1, fish.t + dt / fish.time);
        fish.jolt = Math.max(0, (fish.jolt || 0) - dt / 0.25);
        const k = ease(fish.t);
        const push = Math.sin(Math.PI * fish.jolt) * 0.12;
        spot.set(fish.from.x + (fish.to.x - fish.from.x) * k + Math.sin(fish.dir) * push, 0, fish.from.z + (fish.to.z - fish.from.z) * k + Math.cos(fish.dir) * push);
        const wiggle = calm ? 0 : Math.sin(floatT * 6) * 0.12;
        placeShadow(spot.x, spot.z, fish.dir + wiggle, fish.size, Math.min(0.38, fish.t * 1.2));
      }
      if (flee) {
        flee.t += dt;
        const k = flee.t / 0.8;
        placeShadow(flee.x + Math.sin(flee.dir) * k * 2, flee.z + Math.cos(flee.dir) * k * 2, flee.dir, flee.size, Math.max(0, 0.38 * (1 - k)));
        if (k >= 1) { flee = null; shadow.visible = false; }
      }
      if (leap) {
        leap.t = Math.min(1, leap.t + dt / 0.6);
        const k = leap.t;
        leaper.position.lerpVectors(leap.from, leap.to, k);
        leaper.position.y += Math.sin(Math.PI * k) * 1.5;
        leaper.lookAt(leap.to.x, leaper.position.y + Math.cos(Math.PI * k) * 0.8, leap.to.z);
        if (k >= 1) { leap = null; leaper.visible = false; }
      }
      if (mark.visible) {
        mark.position.set(figure.position.x, 2.45 + (calm ? 0 : Math.abs(Math.sin(floatT * 9)) * 0.12), figure.position.z);
      }
      for (const r of rings) {
        if (!r.visible) continue;
        r.userData.life -= dt / 0.75;
        if (r.userData.life <= 0) { r.visible = false; continue; }
        const k = 1 - r.userData.life;
        r.scale.setScalar(0.1 + k * r.userData.size);
        r.material.opacity = r.userData.life * r.userData.power;
      }
      updateLine();
    },
  };
}
