// 더 새로운 판을 지키기 (2026-11-25, PR #42 GPT 검토 1): 이 화면이 모르는 부품이 든 집이나 더 새로운 판의 집을
// 읽으면 원문을 남기고 저장하지 않는다. 옛 화면이 새 판에서 놓은 물건을 빼고 덮어쓰지 않게 한다
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, createStore } from '../src/state.js';
import { serialize, parse, createSaver, isNewerHouse, SAVE_KEY, SAVE_VERSION } from '../src/save.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; };
// 지금 판의 집에, 미래의 부품 하나를 끼워 넣은 글자
function futureHouse() {
  const store = createStore(createState(), 'p1');
  store.dispatch({ type: 'placeObject', space: 'yard', id: 'c1', part: 'chair', x: 1, y: 1, rot: 0, by: 'p1' });
  const data = JSON.parse(serialize(store.state));
  data.state.spaces.yard.objects.f1 = { id: 'f1', part: 'future_thing', x: 3, y: 1, rot: 0, by: 'p1' };
  return JSON.stringify(data);
}

test('모르는 부품은 세어 알린다 (없어진 칸이나 겹침과 구별)', () => {
  const r = parse(futureHouse());
  assert.ok(r.ok);
  assert.equal(r.unknown, 1);
  assert.equal(r.dropped, 1);
  assert.equal(parse(JSON.stringify({ format: 'house-lab', version: SAVE_VERSION + 1, state: {} })).newer, true);
});
test('모르는 부품이 든 집을 읽으면 원문을 남기고 저장하지 않는다', () => {
  const st = memory();
  const text = futureHouse();
  st.setItem(SAVE_KEY, text);
  const saver = createSaver(st);
  const r = saver.load();
  assert.ok(r.ok && saver.locked);
  assert.equal(st.getItem(`${SAVE_KEY}:newer`), text);
  assert.equal(saver.save(r.state), false);
  assert.equal(st.getItem(SAVE_KEY), text, '원래 글자가 그대로다');
});
test('더 새로운 판의 집을 읽어도 저장하지 않는다 (처음 배치로 덮어쓰지 않는다)', () => {
  const st = memory();
  const text = JSON.stringify({ format: 'house-lab', version: SAVE_VERSION + 1, state: { anything: true } });
  st.setItem(SAVE_KEY, text);
  const saver = createSaver(st);
  assert.equal(saver.load().ok, false);
  assert.ok(saver.locked);
  assert.equal(saver.save(createState()), false);
  assert.equal(st.getItem(SAVE_KEY), text);
});
test('그사이 다른 탭이 새 판의 집을 저장했으면 그 위에 쓰지 않는다', () => {
  const st = memory();
  const saver = createSaver(st);
  assert.equal(saver.load(), null); // 처음
  assert.ok(saver.save(createState()));
  st.setItem(SAVE_KEY, futureHouse());
  assert.equal(saver.save(createState()), false);
  assert.ok(saver.locked);
});
test('보통 집은 그대로 읽고 저장한다', () => {
  const st = memory();
  st.setItem(SAVE_KEY, serialize(createState()));
  const saver = createSaver(st);
  assert.ok(saver.load().ok && !saver.locked);
  assert.ok(saver.save(createState()));
  assert.equal(isNewerHouse(st.getItem(SAVE_KEY)), false);
  assert.equal(isNewerHouse('not json'), false);
});
