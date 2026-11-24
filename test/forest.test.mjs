import test from 'node:test';
import assert from 'node:assert/strict';
import { FOREST_DISCOVERIES, discoveryForDay, koreaDay, todaysDiscovery, discoverySiteForDay, FOREST_SITES, forestViewingPoint,
  forestFloorLayout, forestCue, seededRandom, FOREST_PATHS, FOREST_MOUTH, inForest } from '../src/forest.js';
import { TREES, TREE_RADIUS, LEVELS } from '../src/parts.js';
import { houseRect } from '../src/state.js';

test('한국 날짜 자정에 발견물이 바뀐다', () => {
  const before = new Date('2026-11-23T14:59:59Z');
  const after = new Date('2026-11-23T15:00:00Z');
  assert.equal(koreaDay(before), '2026-11-23');
  assert.equal(koreaDay(after), '2026-11-24');
  assert.notEqual(todaysDiscovery(before).id, todaysDiscovery(after).id);
});
test('날짜가 같으면 발견물도 같고 세 종류가 돌아온다', () => {
  const days = ['2026-11-23','2026-11-24','2026-11-25'];
  assert.equal(new Set(days.map(d=>discoveryForDay(d).id)).size, FOREST_DISCOVERIES.length);
  assert.deepEqual(discoveryForDay(days[0]),discoveryForDay(days[0]));
  assert.deepEqual(discoveryForDay(days[0]),discoveryForDay('2026-11-26'));
});
test('날마다 발견 위치가 달라지고 다시 순환한다', () => {
  const days = ['2026-11-23','2026-11-24','2026-11-25'];
  const sites = days.map(discoverySiteForDay);
  assert.equal(new Set(sites.map(p => p.x + ',' + p.z)).size, FOREST_SITES.length);
  assert.deepEqual(discoverySiteForDay('2026-11-23'), discoverySiteForDay('2026-11-26'));
});
test('잘못된 날짜 형식은 거부한다', () => {
  assert.throws(()=>discoveryForDay('2026/11/23'),TypeError);
  assert.throws(()=>koreaDay(new Date(NaN)),TypeError);
});

test('카메라 네 방향에서 발견물 뒤에 관찰 지점을 둔다', () => {
  const site = { x: -8, z: -6 };
  for (const forward of [{x:1,z:0},{x:-1,z:0},{x:0,z:1},{x:0,z:-1}]) {
    const point = forestViewingPoint(site, forward);
    assert.ok(Math.abs(Math.hypot(point.x-site.x,point.z-site.z)-1.15)<1e-9);
    assert.ok((point.x-site.x)*forward.x+(point.z-site.z)*forward.z>0);
  }
});

// ---- 2026-11-24 숲 연출 ----
test('씨앗이 같으면 바닥 꾸밈 자리가 같고, 씨앗이 다르면 다르다', () => {
  assert.deepEqual(forestFloorLayout(), forestFloorLayout());
  assert.notDeepEqual(forestFloorLayout(1), forestFloorLayout(2));
  const a = seededRandom(7), b = seededRandom(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});
test('바닥 꾸밈은 숲 안에, 길·줄기·발견 자리를 비우고 놓인다', () => {
  const { stones, tufts, flowers } = forestFloorLayout();
  const all = [...stones, ...tufts, ...flowers];
  assert.ok(stones.length >= 10 && tufts.length >= 20 && flowers.length >= 8, `${stones.length} ${tufts.length} ${flowers.length}`);
  for (const p of all) {
    assert.ok(inForest(p), JSON.stringify(p));
    assert.ok(!FOREST_PATHS.some(([x, z, w, d]) => Math.abs(p.x - x) < w / 2 && Math.abs(p.z - z) < d / 2), '길 위: ' + JSON.stringify(p));
    assert.ok(!TREES.some(([x, z]) => Math.hypot(p.x - x, p.z - z) < TREE_RADIUS + 0.3), '줄기 곁: ' + JSON.stringify(p));
    assert.ok(!FOREST_SITES.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < 1.2), '발견 자리 곁: ' + JSON.stringify(p));
  }
});
test('숲 밖에서는 숲길 어귀 쪽으로, 숲 안에서는 오늘의 발견 자리 쪽으로 단서가 흐른다', () => {
  const site = FOREST_SITES[1];
  const out = forestCue({ x: 4, z: 3 }, site);
  const toMouth = { x: FOREST_MOUTH.x - 4, z: FOREST_MOUTH.z - 3 };
  assert.ok(out.dir.x * toMouth.x + out.dir.z * toMouth.z > 0 && !out.inside);
  const pos = { x: -5, z: -5 };
  const inn = forestCue(pos, site);
  assert.ok(inn.inside && inn.dir.x * (site.x - pos.x) + inn.dir.z * (site.z - pos.z) > 0);
  assert.ok(Math.abs(Math.hypot(inn.dir.x, inn.dir.z) - 1) < 1e-9);
  assert.equal(forestCue({ x: site.x + 0.5, z: site.z }, site), null); // 거의 닿았으면 내지 않는다
  assert.equal(forestCue({ x: FOREST_MOUTH.x + 1, z: FOREST_MOUTH.z }, site), null);
  assert.throws(() => forestCue({ x: NaN, z: 0 }, site), TypeError);
});
test('집 앞에서는 단서가 집 벽을 가로지르지 않고 모서리를 돌아간다', () => {
  for (const level of Object.keys(LEVELS).map(Number)) {
    const r = houseRect(level);
    const front = { x: r.x0 + r.w / 2, z: r.z0 + r.d + 3.6 };
    const c = forestCue(front, FOREST_SITES[0], r);
    // 단서가 2.5칸쯤 흘러가는 길이 집 안을 지나지 않는다
    for (let k = 0; k <= 1; k += 0.05) {
      const x = c.x + c.dir.x * 2.8 * k, z = c.z + c.dir.z * 2.8 * k;
      assert.ok(!(x > r.x0 && x < r.x0 + r.w && z > r.z0 && z < r.z0 + r.d), `단계 ${level}: ${x.toFixed(2)},${z.toFixed(2)}`);
    }
    assert.ok(c.dir.x < 0, '숲(서쪽)을 향한다');
  }
});
