// 숲에서 주운 것(솔방울, 작은 버섯, 새 깃털)의 모양. 모델 파일 없이 코드로 그린다.
// 숲에 놓인 주울 거리(forest-view.js)와 집에 놓은 것(view.js makeObject)이 같은 모양을 쓴다.
// 부를 때마다 새 기하와 재질을 만든다. 버리는 쪽이 dispose 한다
import * as THREE from './three.js';

export const FOUND_COLORS = Object.freeze({ pinecone: 0x9b653b, mushroom: 0xe5b98a, feather: 0xe6e2cf });

// 크기 1 일 때 숲에서 보이는 크기다. 집에 놓을 때는 키워서 쓴다(view.js)
export function buildFound(kind) {
  const g = new THREE.Group();
  const part = (geo, color, y) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    m.position.y = y; m.castShadow = true; g.add(m);
    return m;
  };
  if (kind === 'pinecone') part(new THREE.ConeGeometry(0.16, 0.34, 7), FOUND_COLORS.pinecone, 0.17);
  else if (kind === 'mushroom') {
    part(new THREE.CylinderGeometry(0.05, 0.065, 0.16, 7), 0xf3e6cc, 0.08);
    part(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd98c5f, 0.14);
  } else part(new THREE.ConeGeometry(0.06, 0.44, 5), FOUND_COLORS.feather, 0.07).rotation.z = Math.PI / 2;
  return g;
}
