import test from 'node:test';
import assert from 'node:assert/strict';
import { makeShareLink, readShareHash, PUBLIC_SHARE_URL } from '../src/share.js';
import { createState, createStore } from '../src/state.js';
import { serialize, parse } from '../src/save.js';

const HOME = 'https://sylbster-cpu.github.io/maeul/';
const house = () => ({
  version: 2,
  house: { level: 2, roof: 'terracotta', siding: 'cream', door: 'green' },
  spaces: {
    yard: { objects: { 'p1-2': { id: 'p1-2', part: 'stool', x: 10, y: 12, rot: 0, by: 'p1' } } },
    main: { floor: 'wood', wall: 'sage', objects: { 'p1-1': { id: 'p1-1', part: 'chair', x: 1, y: 2, rot: 1, by: 'p1' } } },
  },
});

test('집 스냅샷을 공유 링크로 만들고 그대로 읽는다', async () => {
  const state = house();
  const link = await makeShareLink(state, HOME);
  assert.ok(link.startsWith(HOME + '#home='));
  assert.deepEqual(await readShareHash(new URL(link).hash), state);
  assert.equal(await readShareHash(''), null);
});

test('기존 쿼리는 유지하고 이전 해시는 집 공유로 대체한다', async () => {
  const link = await makeShareLink(house(), HOME + '?preview=1#old');
  assert.equal(new URL(link).search, '?preview=1');
  assert.equal(new URL(link).hash.startsWith('#home='), true);
});

test('압축 미지원 브라우저도 링크를 만들고 읽는다', async () => {
  const previous = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const link = await makeShareLink(house(), HOME);
    assert.match(link, /#home=j/);
    assert.deepEqual(await readShareHash(new URL(link).hash), house());
  } finally {
    globalThis.CompressionStream = previous;
  }
});

test('손상된 링크를 거부한다', async () => {
  await assert.rejects(() => readShareHash('#home=gA!'), /손상/);
  await assert.rejects(() => readShareHash('#home=gAA'), /읽을 수 없습니다/);
  await assert.rejects(() => readShareHash('#home=j' + 'A'.repeat(6500)), /너무 깁니다/);
});

test('잘못된 가구 ID와 과도한 가구 수를 거부한다', async () => {
  const bad = house();
  Object.defineProperty(bad.spaces.yard.objects, '__proto__', { value: { id: '__proto__', part: 'chair' }, enumerable: true });
  await assert.rejects(() => makeShareLink(bad, HOME), /가구 정보/);
  const tooMany = house();
  tooMany.spaces.yard.objects = Object.fromEntries(Array.from({ length: 310 }, (_, i) => [
    `p1-${i + 10}`, { id: `p1-${i + 10}`, part: 'chair', x: i, y: 0, rot: 0 },
  ]));
  await assert.rejects(() => makeShareLink(tooMany, HOME), /너무 많습니다/);
});

test('공유를 위한 상태 변경은 발생하지 않는다', async () => {
  const state = house();
  const original = structuredClone(state);
  await makeShareLink(state, HOME);
  assert.deepEqual(state, original);
});

test('정식 GitHub Pages 주소를 공유 대상으로 사용한다', () => {
  assert.equal(PUBLIC_SHARE_URL, HOME);
});

test('프로토타입 속성명을 바닥재·외관·가구·집 단계로 사용할 수 없다', () => {
  const store = createStore(createState(), 'p1');
  assert.equal(store.dispatch({ type: 'setFinish', space: 'main', slot: 'floor', value: 'constructor' }).ok, false);
  assert.equal(store.dispatch({ type: 'setFinish', space: 'main', slot: 'wall', value: 'toString' }).ok, false);
  assert.equal(store.dispatch({ type: 'setFinish', space: 'main', slot: 'constructor', value: 'prototype' }).ok, false);
  assert.equal(store.dispatch({ type: 'setExterior', slot: 'roof', value: 'toString' }).ok, false);
  assert.equal(store.dispatch({ type: 'setExterior', slot: 'constructor', value: 'toString' }).ok, false);
  assert.equal(store.dispatch({ type: 'setLevel', level: 'constructor' }).ok, false);
  assert.equal(store.dispatch({ type: 'placeObject', space: 'main', id: 'p1-777', part: 'toString', x: 2, y: 3, rot: 0 }).ok, false);
});

test('조작된 집 링크에서 잘못된 마감·겉모습을 폐기하므로 로딩을 계속할 수 있다', async () => {
  const modified = house();
  modified.spaces.main.floor = 'constructor';
  modified.spaces.main.wall = 'toString';
  modified.house.roof = 'toString';
  modified.house.door = 'constructor';
  const url = await makeShareLink(modified, HOME);
  const received = await readShareHash(new URL(url).hash);
  const result = parse(serialize(received));
  assert.equal(result.ok, true);
  assert.ok(result.dropped >= 4, '잘못된 공유 내용은 방문 모드로 넘어가지 않도록 거절한다');
  assert.equal(result.state.spaces.main.floor, 'wood');
});

test('조작된 링크의 프로토타입 가구 이름은 실제 가구로 인정하지 않는다', async () => {
  const modified = house();
  modified.spaces.main.objects['p1-1'].part = 'toString';
  const url = await makeShareLink(modified, HOME);
  const result = parse(serialize(await readShareHash(new URL(url).hash)));
  assert.equal(result.ok, true);
  assert.ok(result.dropped > 0);
  assert.equal(Object.keys(result.state.spaces.main.objects).length, 0);
});
