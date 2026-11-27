// 화환의 모양(5단계 작은 만들기). 모델 파일 없이 코드로 그린다.
// 덩굴 고리에 칸 6개가 있고, 칸마다 숲에서 주운 것(found-model.js 와 같은 모양)을 꽂는다. 아래에 리본을 단다.
// 벽에 거는 것처럼 앞(+z)을 보고, 가운데가 원점이다. 부를 때마다 새 기하와 재질을 만든다. 버리는 쪽이 dispose 한다
import * as THREE from './three.js';
import { buildFound } from './found-model.js';
import { WREATH_SLOTS, WREATH_RIBBONS, DEFAULT_WREATH } from './parts.js';

const RADIUS = 0.36; // 고리의 반지름 (벽 한 칸 너비 안에 든다. 0.3 은 방 화면에서 액자만큼 작아 잘 안 보였다)
const mat = (color, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness });

// 칸 k 의 각도. 오른쪽 위(60도)에서 시작해 시계 방향으로 돈다(만들기 창의 칸 순서와 같다).
// 맨 아래 칸을 비워 리본이 보이게, 맨 위 칸을 비워 걸린 모양이 둥글게 보이게 30도 돌려 둔다
export const slotAngle = (k) => Math.PI / 3 - (k * 2 * Math.PI) / WREATH_SLOTS;

export function buildWreath(look = DEFAULT_WREATH) {
  const g = new THREE.Group();
  const add = (mesh) => { mesh.castShadow = true; g.add(mesh); return mesh; };
  // 누름 판정용 원판. 고리 가운데가 비어 있어 가운데를 눌러도 화환을 집게 한다. 그리지 않는다(색도 깊이도 쓰지 않음).
  // 미리 보기(view.js showGhosts)에서는 감춘다
  const hit = new THREE.Mesh(new THREE.CircleGeometry(RADIUS + 0.06, 20), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  hit.position.z = 0.05;
  hit.userData.pickOnly = true;
  g.add(hit);
  // 덩굴 고리와 잎 뭉치(두 가지 초록이 번갈아)
  add(new THREE.Mesh(new THREE.TorusGeometry(RADIUS, 0.06, 8, 32), mat(0x6b5a3a))).position.z = 0.04;
  const leafGeo = new THREE.IcosahedronGeometry(0.066, 0);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const leaf = add(new THREE.Mesh(leafGeo, mat(i % 2 ? 0x4f7a3a : 0x6f9a4c)));
    leaf.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, 0.06);
    leaf.rotation.set(a, a * 2, 0);
  }
  // 칸마다 꽂은 것. 위(y)가 고리 바깥을 보게 돌려 꽂는다
  look.slots.forEach((kind, k) => {
    if (!kind) return;
    const a = slotAngle(k);
    const item = buildFound(kind);
    item.scale.setScalar(0.72);
    item.position.set(Math.cos(a) * RADIUS * 0.92, Math.sin(a) * RADIUS * 0.92, 0.1);
    item.rotation.z = a - Math.PI / 2;
    g.add(item);
  });
  // 리본: 맨 아래에 매듭 하나와 고리 둘, 꼬리 둘
  if (look.ribbon && WREATH_RIBBONS[look.ribbon]) {
    const color = new THREE.Color(WREATH_RIBBONS[look.ribbon].color);
    const ribbon = new THREE.Group();
    ribbon.position.set(0, -RADIUS - 0.02, 0.12);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), mat(color, 0.6));
    ribbon.add(knot);
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 8), mat(color, 0.6));
      loop.rotation.z = side * Math.PI / 2;
      loop.position.x = side * 0.07;
      loop.scale.z = 0.4;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.012), mat(color, 0.6));
      tail.position.set(side * 0.035, -0.08, 0);
      tail.rotation.z = side * 0.35;
      ribbon.add(loop, tail);
    }
    ribbon.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(ribbon);
  }
  return g;
}
