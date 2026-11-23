// 마을 북서쪽의 작은 숲. 기존 마당 배치와 낚시 물가는 바꾸지 않는다.
import * as THREE from './three.js';
import { todaysDiscovery, todaysDiscoverySite, koreaDay } from './forest.js';
import { TREES, TREE_RADIUS, FOREST } from './parts.js';
export function createForestView(parent) {
  const group = new THREE.Group();
  parent.add(group);
  const earth = new THREE.MeshStandardMaterial({ color: 0x648c50, roughness: 1 });
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
  const paths = [[-1,-3,8,1.5],[-5.5,-3,4,1.5],[-8,-3.7,2.2,2.4],[-8,-9,1.5,7],[-3,-12,11,1.5]];
  for (const [x,z,w,d] of paths) {
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
  // 집에서 보이는 숲 입구의 표지. 안내 UI를 추가하지 않는다.
  const sign = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,1.3,6),trunkMat);
  post.position.y=0.65; sign.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.42,0.12),trail);
  board.position.set(0,1.25,0); board.rotation.y=0.2; sign.add(board);
  sign.position.set(5,-0.01,6.5); group.add(sign);
  const find = new THREE.Group();
  find.position.set(FOREST.clearingX,0,FOREST.clearingZ);
  group.add(find);
  let day = '';
  function refresh(now = new Date()) {
    const date = koreaDay(now);
    if (day === date) return;
    day = date;
    for (const child of [...find.children]) { find.remove(child); child.geometry?.dispose(); child.material?.dispose(); }
    const item = todaysDiscovery(now);
    const site = todaysDiscoverySite(now);
    find.position.set(site.x, 0, site.z);
    const colors = {pinecone:0x9b653b,mushroom:0xe5b98a,feather:0xe6e2cf};
    const shape = item.id === 'feather' ? new THREE.ConeGeometry(0.17,0.7,6) :
      item.id === 'mushroom' ? new THREE.SphereGeometry(0.34,10,8) : new THREE.ConeGeometry(0.28,0.6,7);
    const mesh = new THREE.Mesh(shape,new THREE.MeshStandardMaterial({color:colors[item.id],roughness:0.8}));
    mesh.position.y = 0.85; mesh.castShadow = true; find.add(mesh);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.48,0.59,32),new THREE.MeshBasicMaterial({color:0xf5db83,side:THREE.DoubleSide}));
    ring.rotation.x = -Math.PI/2; ring.position.y = 0.025; find.add(ring);
  }
  refresh();
  let elapsed = 0;
  function update(dt = 0, now = new Date()) {
    // 날짜 검사는 5초마다 한 번만 수행한다.
    if (elapsed === 0 || Math.floor(elapsed / 5) !== Math.floor((elapsed + dt) / 5)) refresh(now);
    if (!Number.isFinite(dt) || dt < 0) return;
    elapsed += dt;
    const object = find.children[0];
    if (object) object.rotation.y = elapsed * 0.5;
    const halo = find.children[1];
    if (halo) halo.scale.setScalar(1 + 0.08 * Math.sin(elapsed * 2));
  }
  return { update };
}
