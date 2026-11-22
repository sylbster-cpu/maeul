// 마당 남쪽의 바닷가를 그린다: 모래사장, 젖은 모래, 바다, 밀려왔다 빠지는 파도.
// 규칙(물이 어디인지)은 parts.js 의 BEACH·shoreZ 와 fishing.js 의 waterAt 이 정하고, 여기서는 그 모양대로 그리기만 한다.
// 2026-11-22 사용자 결정: 따로 된 장면이 아니라 바깥을 넓혀 걸어서 가는 바닷가.
// 움직임 줄이기를 켠 기기에서는 파도를 움직이지 않는다.
import * as THREE from './three.js';
import { BEACH, shoreZ } from './parts.js';

const WATER_Y = -0.035; // 연못과 같은 물 높이 (찌와 물보라가 같은 높이에 뜬다)
const X0 = -200, X1 = 220; // 옆으로는 화면 끝 너머까지 이어 그린다
const STEP = 1; // 물가선을 따라 이만큼마다 점을 찍는다
const FAR = 260; // 바다는 수평선 너머까지

// 물가선을 따라가는 띠. edge(x) 에서 시작해 rows 의 거리만큼 남쪽으로 줄을 더한다.
// colors 가 있으면 줄마다 색을 칠한다 (얕은 물은 밝게, 깊은 물은 짙게)
function ribbon(edge, rows, colors = null) {
  const cols = Math.round((X1 - X0) / STEP) + 1;
  const position = [], color = [], index = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols; c++) {
      const x = X0 + c * STEP;
      position.push(x, 0, edge(x) + rows[r]);
      if (colors) color.push(...colors[r]);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

export function createBeachView({ parent, calm }) {
  const group = new THREE.Group();
  parent.add(group);

  // 모래사장: 풀밭 끝(조금 굽이침)에서 물가선 너머까지. 바다가 그 위를 덮는다
  const sandEdge = (x) => BEACH.sand + 0.35 * Math.sin(x * 0.5) + 0.2 * Math.sin(x * 1.3 + 1);
  const sand = new THREE.Mesh(
    ribbon(sandEdge, [0, BEACH.shore + BEACH.wave + 3 - BEACH.sand]),
    new THREE.MeshStandardMaterial({ color: 0xeedcaa, roughness: 1 }),
  );
  sand.position.y = -0.06;
  sand.receiveShadow = true;
  // 젖은 모래: 물가선 바로 앞의 짙은 띠. 파도가 빠진 자리다
  const wet = new THREE.Mesh(ribbon(shoreZ, [-1.1, 0.2]), new THREE.MeshStandardMaterial({ color: 0xcdb985, roughness: 0.7 }));
  wet.position.y = -0.052;
  wet.receiveShadow = true;
  // 바다: 물가에서 멀어질수록 짙어진다
  const sea = new THREE.Mesh(
    ribbon(shoreZ, [0, 1.6, 5, 14, FAR], [rgb(0x8fd6d2), rgb(0x5fbfcc), rgb(0x3f9fc0), rgb(0x2f7fae), rgb(0x2a6c9c)]),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 }),
  );
  sea.position.y = WATER_Y;
  sea.receiveShadow = true;
  group.add(sand, wet, sea);

  // 파도: 물가에 붙은 거품(밀려왔다 빠진다)과, 바다에서 다가오다 부서지는 물마루 하나
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
  const foam = new THREE.Mesh(ribbon(shoreZ, [-0.18, 0.22]), foamMat);
  foam.position.y = WATER_Y + 0.006;
  const crestMat = foamMat.clone();
  const crest = new THREE.Mesh(ribbon(shoreZ, [0, 0.16]), crestMat);
  crest.position.y = WATER_Y + 0.005;
  group.add(foam, crest);

  // 바위 몇 개. 걷는 범위(x -3 ~ 27) 바깥 모래와 얕은 물에만 두어 길을 막지 않는다
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.95, flatShading: true });
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (const [x, dz, s] of [[-6.5, -0.6, 0.9], [-8, 0.8, 0.6], [31, -0.4, 1.1], [33.5, 1.2, 0.7], [-13, 2.5, 1.3]]) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, 0.1 * s, shoreZ(x) + dz);
    rock.scale.set(s, s * 0.55, s * 0.85);
    rock.rotation.set(x, x * 2, 0);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }

  let t = 0;
  const WAVE = 4.2; // 파도 한 번의 길이(초)
  return {
    group,
    update(dt) {
      if (calm) return;
      t += dt;
      // 거품은 물가에서 조금 올라왔다가 물러난다. 올라올 때 짙고, 물러날 때 옅어진다
      const swash = Math.sin((t / WAVE) * Math.PI * 2);
      foam.position.z = -0.35 * Math.max(0, swash) + 0.12;
      foamMat.opacity = 0.45 + 0.3 * Math.max(0, swash);
      // 물마루는 바다 쪽 3칸에서 물가까지 다가오며 나타났다 사라진다 (거품이 올라오기 직전에 닿는다)
      const k = ((t / WAVE) + 0.75) % 1;
      crest.position.z = 3.2 * (1 - k);
      crestMat.opacity = 0.55 * Math.sin(Math.PI * k);
    },
    // 자동 시험이 읽는다
    get waves() { return { foamZ: foam.position.z, crestZ: crest.position.z, crestOpacity: crestMat.opacity }; },
  };
}
