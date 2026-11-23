import test from 'node:test';
import assert from 'node:assert/strict';
import { FOREST_DISCOVERIES, discoveryForDay, koreaDay, todaysDiscovery, discoverySiteForDay, FOREST_SITES } from '../src/forest.js';

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
