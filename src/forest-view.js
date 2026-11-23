// 마을 북서쪽의 작은 숲. 기존 마당 배치와 낚시 물가는 바꾸지 않는다.
import * as THREE from './three.js';
import { todaysDiscovery } from './forest.js';
export const FOREST = Object.freeze({ x0: -13.5, x1: -2.5, z0: -14.5, z1: -2.5, clearingX: -8, clearingZ: -4 });
export function createForestView(parent) {
  const group = new THREE.Group();
  parent.add(group);
  const earth = new THREE.MeshStandardMaterial({ color: 0x648c50, roughness: 1 });
  const trail = new THREE.MeshStandardMaterial({ color: 0xc5ab7e, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x735139, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x477f49, roughness: 1, flatShading: true });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(11, 12), earth);
  ground.rotation.x = -Math.PI / 2; ground.position.set(-8, -0.035, -8.5); ground.receiveShadow = true; group.add(ground);
  // 숲으로 이어지는 길: 집 왼편에서 숲 안쪽 공터까지 이어진다.
  const paths = [[-1, -3, 8, 2.5], [-5.5, -3, 4, 2.5], [-8, -5.5, 2.5, 5]];
  for (const [x,z,w,d] of paths) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,d), trail);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.005, z); m.receiveShadow = true; group.add(m);
  }
  const trees = [[-12,-13],[-9,-13],[-5,-13],[-12,-10],[-4,-10],[-12,-6],[-4,-6],[-12,-3],[-5,-3]];
  for (const [x,z] of trees) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.31,1.8,6),trunkMat);
    trunk.position.set(x,0.9,z); trunk.castShadow = true; group.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2,0),leafMat);
    crown.position.set(x,2.5,z); crown.castShadow = true; group.add(crown);
  }
  const find = new THREE.Group();
  find.position.set(FOREST.clearingX,0,FOREST.clearingZ);
  group.add(find);
  let day = '';
  function refresh(now = new Date()) {
    const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    if (day === date) return;
    day = date;
    for (const child of [...find.children]) { find.remove(child); child.geometry?.dispose(); child.material?.dispose(); }
    const item = todaysDiscovery(now);
    const colors = {pinecone:0x9b653b,mushroom:0xe5b98a,feather:0xe6e2cf};
    const shape = item.id === 'feather' ? new THREE.ConeGeometry(0.17,0.7,6) :
      item.id === 'mushroom' ? new THREE.SphereGeometry(0.34,10,8) : new THREE.ConeGeometry(0.28,0.6,7);
    const mesh = new THREE.Mesh(shape,new THREE.MeshStandardMaterial({color:colors[item.id],roughness:0.8}));
    mesh.position.y = 0.4; mesh.castShadow = true; find.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.48,0.59,32),new THREE.MeshBasicMaterial({color:0xf5db83,side:THREE.DoubleSide}));
    ring.rotation.x = -Math.PI/2; ring.position.y = 0.025; find.add(ring);
  }
  refresh();
  return { update:refresh };
}
