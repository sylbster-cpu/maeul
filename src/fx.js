// 공통 연출 계층. 게임 규칙과 상태는 건드리지 않고, 일어난 일에 맞춰 화면만 움직인다.
// 집 꾸미기, 마을, 낚시가 docs/GAME_PRINCIPLES.md 의 원리를 같은 방식으로 쓰도록 여기에 모은다
// (이슈 #4 의 GPT 제안: 규칙과 분리된 공통 연출 계층). 움직임 줄이기를 켠 기기에서는 입자를 만들지 않는다.
import * as THREE from './three.js';

// 줄어들며 흔들리는 값 (따라오기·찌그러짐의 되돌아옴).
// amount 에서 시작해 half 초마다 방향을 바꾸고, decay 초마다 e 분의 1 로 줄어든다
export const wobble = (amount, t, half = 0.1, decay = 0.12) => amount * Math.exp(-t / decay) * Math.cos(Math.PI * t / half);

// 부피를 지키는 찌그러짐. 세로를 sy 배로 하면 가로는 1/√sy 배가 된다 (바람 빠진 공처럼 보이지 않게)
export function squash(obj, sy, base = 1) {
  const side = 1 / Math.sqrt(sy);
  obj.scale.set(base * side, base * sy, base * side);
}

function roundTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFx({ scene, calm }) {
  // 먼지: 가운데가 짙고 가장자리가 흐린 동그라미
  const dustTex = roundTexture((g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.55, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
  // 반짝임: 네 갈래 빛
  const starTex = roundTexture((g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,250,220,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, d = i % 2 ? 4 : 30; g.lineTo(32 + Math.cos(a) * d, 32 + Math.sin(a) * d); }
    g.closePath(); g.fill();
  });

  const pool = [];
  function sprite(map, additive) {
    let s = pool.find((p) => !p.visible && p.material.map === map);
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.renderOrder = 5;
      pool.push(s);
    }
    return s;
  }
  // 나뭇잎: 작은 마름모 판. 흔들리며 천천히 떨어진다
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.09, 0.05, 0, 0, 0, 0, 0.09, -0.05, 0, 0], 3));
  leafGeo.setIndex([0, 1, 2, 0, 2, 3]);
  leafGeo.computeVertexNormals();
  const leaves = [];
  const live = []; // { obj, kind, t, life, v, size, spin, sway }

  function add(obj, parent, item) {
    if (obj.parent !== parent) parent.add(obj);
    obj.visible = true;
    live.push({ obj, ...item, t: 0 });
  }

  return {
    get count() { return live.length; },
    // 먼지가 퍼진다. 가구가 내려앉을 때, 캐릭터가 멈출 때, 집이 커질 때. 클수록 많이, 넓게.
    // rx, rz 를 주면 그 크기의 타원 둘레(가구의 가장자리)에서 일어나 밖으로 퍼진다. 가구 밑에 가려지지 않게 한다
    puff(x, y, z, { count = 6, spread = 0.5, size = 0.32, color = 0xfffaf0, rise = 0.25, life = 0.5, rx = 0, rz = 0, parent = scene } = {}) {
      if (calm) return;
      for (let i = 0; i < count; i++) {
        const s = sprite(dustTex, false);
        s.material.color.setHex(color);
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        s.position.set(x + Math.cos(a) * (rx + spread * 0.25), y + 0.05, z + Math.sin(a) * (rz + spread * 0.25));
        const speed = spread * (0.7 + Math.random() * 0.6) / life;
        add(s, parent, { kind: 'dust', life, size: size * (0.7 + Math.random() * 0.6), v: new THREE.Vector3(Math.cos(a) * speed, rise / life, Math.sin(a) * speed) });
      }
    },
    // 반짝임이 흩어진다. 집을 키우거나 겉모습을 바꿀 때처럼 드문 일에만 쓴다
    sparkle(x, y, z, { count = 8, radius = 1.5, size = 0.45, life = 0.8, parent = scene } = {}) {
      if (calm) return;
      for (let i = 0; i < count; i++) {
        const s = sprite(starTex, true);
        s.material.color.setHex(0xffffff);
        const a = Math.random() * Math.PI * 2, r = radius * Math.sqrt(Math.random());
        s.position.set(x + Math.cos(a) * r, y + Math.random() * radius * 0.6, z + Math.sin(a) * r);
        add(s, parent, { kind: 'star', life: life * (0.7 + Math.random() * 0.6), size, delay: Math.random() * 0.25, v: new THREE.Vector3(0, 0.4, 0) });
      }
    },
    // 나뭇잎이 떨어진다. 나무를 스쳐 지나갈 때
    leaf(x, y, z, color, { count = 3, parent = scene } = {}) {
      if (calm) return;
      for (let i = 0; i < count; i++) {
        let m = leaves.find((l) => !l.visible);
        if (!m) { m = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide })); leaves.push(m); }
        m.material.color.setHex(color);
        m.position.set(x + (Math.random() - 0.5) * 1.4, y - Math.random() * 0.6, z + (Math.random() - 0.5) * 1.4);
        m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        m.scale.setScalar(1.6 + Math.random() * 0.8);
        add(m, parent, { kind: 'leaf', life: 1.6 + Math.random() * 0.6, sway: Math.random() * 6, v: new THREE.Vector3(0, -(0.9 + Math.random() * 0.5), 0) });
      }
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.t += dt;
        const k = p.t / p.life;
        if (k >= 1 || (p.kind === 'leaf' && p.obj.position.y < 0.02)) { p.obj.visible = false; live.splice(i, 1); continue; }
        if (p.kind === 'dust') {
          // 처음엔 빨리 퍼지고 곧 느려진다 (감속). 커지면서 옅어진다
          const slow = Math.max(0, 1 - k * 1.6);
          p.obj.position.addScaledVector(p.v, dt * slow);
          const s = p.size * (0.6 + 0.9 * k);
          p.obj.scale.set(s, s, 1);
          p.obj.material.opacity = 0.75 * (1 - k) * (1 - k);
        } else if (p.kind === 'star') {
          const kk = Math.max(0, (p.t - p.delay) / (p.life - p.delay));
          const s = p.size * Math.sin(Math.PI * Math.min(1, kk));
          p.obj.scale.set(s, s, 1);
          p.obj.material.opacity = Math.sin(Math.PI * Math.min(1, kk));
          p.obj.material.rotation = kk * 1.2;
          p.obj.position.addScaledVector(p.v, dt);
        } else {
          // 좌우로 흔들리며 내려온다
          p.obj.position.y += p.v.y * dt;
          p.obj.position.x += Math.sin(p.t * 3 + p.sway) * 0.6 * dt;
          p.obj.rotation.z += dt * 2.4;
          p.obj.rotation.x = Math.sin(p.t * 4 + p.sway) * 0.8;
        }
      }
    },
  };
}
