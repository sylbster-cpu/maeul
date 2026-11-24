// 숲의 하루 발견물. 한국 날짜만 사용하며 저장이나 접속 보상을 만들지 않는다.
// Three.js와 무관한 규칙: 브라우저와 기기에 관계없이 같은 날 같은 발견이다.
import { TREES, TREE_RADIUS, FOREST } from './parts.js';
export const FOREST_DISCOVERIES = Object.freeze([
  { id: 'pinecone', name: '솔방울', description: '바람에 떨어진 솔방울이 숲길에 놓여 있습니다.' },
  { id: 'mushroom', name: '작은 버섯', description: '나무 그늘에서 작은 버섯을 발견했습니다.' },
  { id: 'feather', name: '새 깃털', description: '새가 지나간 자리에 깃털 하나가 남았습니다.' },
]);

export function koreaDay(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('올바른 날짜가 필요합니다');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// 3일 단위 순환. 발견은 수집하거나 소비하지 않고, 바라보고 확인하는 경험이다.
export function discoveryForDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new TypeError('YYYY-MM-DD 날짜가 필요합니다');
  const index = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
  if (!Number.isFinite(index)) throw new TypeError('올바른 날짜가 필요합니다');
  return FOREST_DISCOVERIES[((index % FOREST_DISCOVERIES.length) + FOREST_DISCOVERIES.length) % FOREST_DISCOVERIES.length];
}
// 매일 다른 위치. 길의 중앙에서 벗어나 캐릭터가 발견물 위에 서지 않도록 한다.
export const FOREST_SITES = Object.freeze([
  Object.freeze({ x: -9.1, z: -5.0 }),
  Object.freeze({ x: -8.0, z: -10.0 }),
  Object.freeze({ x: -5.6, z: -8.1 }),
]);
export function discoverySiteForDay(day) {
  const item = discoveryForDay(day);
  return FOREST_SITES[FOREST_DISCOVERIES.findIndex(entry => entry.id === item.id)];
}
export function todaysDiscoverySite(now = new Date()) {
  return discoverySiteForDay(koreaDay(now));
}
export function todaysDiscovery(now = new Date()) {
  return discoveryForDay(koreaDay(now));
}

// 카메라 쪽에 서면 발견물이 몸 뒤로 가린다. 카메라 반대쪽 관찰 지점을 계산한다.
// view.basis().forward는 카메라에서 멀어지는 세계 방향이다.
export function forestViewingPoint(site, forward, distance = 1.15) {
  if (![site?.x, site?.z, forward?.x, forward?.z, distance].every(Number.isFinite) || distance <= 0) {
    throw new TypeError('올바른 발견 위치와 카메라 방향이 필요합니다');
  }
  const length = Math.hypot(forward.x, forward.z);
  if (length < 1e-6) throw new TypeError('카메라 방향이 필요합니다');
  return { x: site.x + forward.x / length * distance, z: site.z + forward.z / length * distance };
}

// ---- 숲 연출에 쓰는 규칙 (2026-11-24 사용자 결정: 숲 연출 네 가지, 코드는 Claude) ----
// 저장하지 않는다. 화면이 같은 답을 내도록 계산만 한다. three.js 를 부르지 않는다.
// 숲으로 이어지는 길 [가운데 x, 가운데 z, 너비, 깊이]. 화면(forest-view.js)과 바닥 꾸밈이 함께 쓴다
export const FOREST_PATHS = Object.freeze([[-1, -3, 8, 1.5], [-5.5, -3, 4, 1.5], [-8, -3.7, 2.2, 2.4], [-8, -9, 1.5, 7], [-3, -12, 11, 1.5]]);
// 주울 거리가 놓일 수 있는 자리 12곳 (4단계 채집, gathering.js). 날마다 이 가운데 6곳에 놓인다.
// 줄기에서 1.5칸, 오늘의 발견 자리에서 1.5칸, 서로 1.8칸 넘게 떨어져 있다. 길 위도 있고 나무 사이도 있다
export const GATHER_SPOTS = Object.freeze([
  [-12.3, -5.8], [-9.6, -7.4], [-6.4, -4.6], [-4.2, -5.6], [-6.2, -12.9], [-9.6, -9.9],
  [-12.6, -12.5], [-3.4, -9.6], [-2.9, -13.6], [-12.6, -3.2], [-7.1, -7.8], [-4.6, -11.9],
].map(([x, z]) => Object.freeze({ x, z })));
// 마당에서 숲길로 들어서는 곳 (입구 표지 곁)
export const FOREST_MOUTH = Object.freeze({ x: -1.5, z: -3 });

// 씨앗이 같으면 같은 수열 (docs/GAME_PRINCIPLES.md 1-11). mulberry32
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FOREST_SEED = 20261124;
export const inForest = (p) => p.x >= FOREST.x0 && p.x <= FOREST.x1 && p.z >= FOREST.z0 && p.z <= FOREST.z1;
const onPath = (x, z, pad) => FOREST_PATHS.some(([px, pz, w, d]) => Math.abs(x - px) < w / 2 + pad && Math.abs(z - pz) < d / 2 + pad);

// 숲 바닥에 흩뿌릴 돌·풀·꽃의 자리. 모두에게 같다(씨앗 고정).
// 발견물과 닮은 것(버섯, 솔방울, 깃털)은 흩뿌리지 않는다. 진짜 발견을 가짜와 헷갈리지 않게 한다(1-8).
// 길 위, 나무줄기 곁, 발견 자리 곁은 비운다. 걷기를 막지 않는 장식이다
export function forestFloorLayout(seed = FOREST_SEED, { stones = 16, tufts = 30, flowers = 14 } = {}) {
  const rand = seededRandom(seed);
  const cx = (FOREST.x0 + FOREST.x1) / 2, cz = (FOREST.z0 + FOREST.z1) / 2;
  const hx = (FOREST.x1 - FOREST.x0) / 2 - 0.4, hz = (FOREST.z1 - FOREST.z0) / 2 - 0.4;
  const taken = [];
  const free = (x, z, gap) =>
    ((x - cx) / hx) ** 4 + ((z - cz) / hz) ** 4 <= 1 && // 네모 모서리를 깎은 둥근 모양 안
    !onPath(x, z, 0.25) &&
    !TREES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < TREE_RADIUS + 0.35) &&
    !FOREST_SITES.some((s) => Math.hypot(x - s.x, z - s.z) < 1.3) &&
    !GATHER_SPOTS.some((s) => Math.hypot(x - s.x, z - s.z) < 0.8) && // 주울 거리와 헷갈리지 않게
    !taken.some((p) => Math.hypot(x - p.x, z - p.z) < gap);
  function scatter(n, gap) {
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 40; tries++) {
      const x = cx + (rand() * 2 - 1) * hx, z = cz + (rand() * 2 - 1) * hz;
      if (!free(x, z, gap)) continue;
      const p = { x: +x.toFixed(2), z: +z.toFixed(2), size: +(0.7 + rand() * 0.6).toFixed(2), turn: +(rand() * Math.PI * 2).toFixed(2), tone: Math.floor(rand() * 3) };
      out.push(p); taken.push(p);
    }
    return out;
  }
  return { stones: scatter(stones, 0.7), tufts: scatter(tufts, 0.45), flowers: scatter(flowers, 0.4) };
}

// 선분 (a→b) 이 네모 r = {x0, z0, w, d} 를 지나는가
function crosses(a, b, r) {
  for (let i = 0; i <= 20; i++) {
    const k = i / 20, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
    if (x > r.x0 && x < r.x0 + r.w && z > r.z0 && z < r.z0 + r.d) return true;
  }
  return false;
}

// 숲 쪽으로 이끄는 단서가 일어날 자리와 흘러갈 방향 (1-10, 움직이는 것으로 길 안내).
// 숲 밖이면 숲길 어귀로, 숲 안이면 오늘의 발견 자리로 향한다. 거의 닿았으면 null.
// block (집 네모)을 가로지르면 집 모서리를 돌아가는 쪽을 가리킨다. 잎이 집 벽 속으로 흘러가지 않게 한다
export function forestCue(pos, site, block = null) {
  if (![pos?.x, pos?.z, site?.x, site?.z].every(Number.isFinite)) throw new TypeError('올바른 자리가 필요합니다');
  const inside = inForest(pos);
  let goal = inside ? site : FOREST_MOUTH;
  if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 1.8) return null;
  if (block && !inside) {
    const r = { x0: block.x0 - 1, z0: block.z0 - 1, w: block.w + 2, d: block.d + 2 };
    if (crosses(pos, goal, r)) {
      const corners = [[r.x0, r.z0], [r.x0 + r.w, r.z0], [r.x0, r.z0 + r.d], [r.x0 + r.w, r.z0 + r.d]].map(([x, z]) => ({ x, z }));
      const inner = { x0: block.x0 - 0.2, z0: block.z0 - 0.2, w: block.w + 0.4, d: block.d + 0.4 };
      const ok = corners.filter((c) => !crosses(pos, c, inner) && !crosses(c, goal, inner));
      if (ok.length) {
        const len = (c) => Math.hypot(c.x - pos.x, c.z - pos.z) + Math.hypot(goal.x - c.x, goal.z - c.z);
        goal = ok.reduce((best, c) => (len(c) < len(best) ? c : best));
      }
    }
  }
  const dx = goal.x - pos.x, dz = goal.z - pos.z, d = Math.hypot(dx, dz);
  if (d < 0.5) return null;
  const ux = dx / d, uz = dz / d, ahead = Math.min(2.2, d * 0.5);
  return { x: pos.x + ux * ahead, z: pos.z + uz * ahead, dir: { x: ux, z: uz }, inside };
}
