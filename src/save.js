// 저장과 불러오기. 상태를 글자(JSON)로 바꾸고 되읽는다.
// 불러올 때는 저장된 내용을 명령으로 하나씩 다시 적용해 본다. 지금의 규칙과 부품 목록에
// 맞지 않는 항목(없어진 가구, 겹치는 물건 등)은 버리고 나머지만 살린다.
// 저장소(localStorage 등)는 밖에서 넘겨받으므로 three.js 나 브라우저 없이도 실행된다.

import { PARTS, LEVELS } from './parts.js';
import { createState, createStore, SPACES, layerOf } from './state.js';

export const SAVE_KEY = 'house-lab-web:save';
export const SAVE_VERSION = 2;

// 저장 형식을 바꾸면 SAVE_VERSION 을 올리고 여기에 변환 함수를 더한다.
// MIGRATIONS[2] 는 버전 2 자료를 버전 3 으로 바꾸는 함수다.
// 버전 1 (벽을 직접 긋던 판) 은 집의 구조가 달라 바꿀 수 없다.
const MIGRATIONS = {};

export function serialize(state, extra = {}) {
  return JSON.stringify({ format: 'house-lab', version: SAVE_VERSION, savedAt: new Date().toISOString(), ...extra, state });
}

export function parse(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: '저장된 내용을 읽을 수 없습니다' }; }
  if (!data || data.format !== 'house-lab' || typeof data.state !== 'object' || data.state === null) {
    return { ok: false, reason: '저장된 내용의 형식이 다릅니다' };
  }
  let version = Number(data.version) || 0;
  if (version > SAVE_VERSION) return { ok: false, reason: '더 새로운 판에서 저장한 내용이라 읽을 수 없습니다' };
  if (version === 1) return { ok: false, reason: '벽을 직접 긋던 예전 판의 집은 불러올 수 없습니다' };
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, reason: `버전 ${version} 저장 내용을 바꾸는 방법이 없습니다` };
    data = step(data);
    version++;
  }

  const src = data.state;
  const store = createStore(createState(), 'load');
  let dropped = 0;
  const put = (cmd) => { const r = store.dispatch(cmd); if (!r.ok) dropped++; return r.ok; };
  const same = (r) => r.reason?.startsWith('이미 그'); // 기본값과 같은 것은 버린 것이 아니다

  // 집의 단계는 한 단계씩 올린다
  const level = Number.isInteger(src.house?.level) && Object.hasOwn(LEVELS, src.house.level) ? src.house.level : 1;
  for (let l = 2; l <= level; l++) put({ type: 'setLevel', level: l });
  for (const slot of ['roof', 'siding', 'door']) {
    const r = store.dispatch({ type: 'setExterior', slot, value: src.house?.[slot] });
    if (!r.ok && !same(r)) dropped++;
  }
  for (const slot of ['floor', 'wall']) {
    const r = store.dispatch({ type: 'setFinish', space: 'main', slot, value: src.spaces?.main?.[slot] });
    if (!r.ok && !same(r)) dropped++;
  }
  for (const space of SPACES) {
    const known = [];
    for (const o of Object.values(src.spaces?.[space]?.objects || {})) {
      if (o && Object.hasOwn(PARTS, o.part)) known.push(o); else dropped++;
    }
    // 소품은 받치는 가구가 놓인 뒤에 놓는다
    known.sort((a, b) => (layerOf(a.part) === 'top') - (layerOf(b.part) === 'top'));
    for (const o of known) {
      const where = layerOf(o.part) === 'wall' ? { wall: o.wall, i: o.i } : { x: o.x, y: o.y, rot: o.rot };
      put({ type: 'placeObject', space, id: String(o.id), part: o.part, ...where, by: o.by });
    }
  }

  const pos = data.pos && Number.isFinite(data.pos.x) && Number.isFinite(data.pos.z) ? { x: data.pos.x, z: data.pos.z } : null;
  const place = SPACES.includes(data.place) ? data.place : 'yard';
  return { ok: true, state: store.state, pos, place, dropped, savedAt: data.savedAt || null };
}

// 저장소 하나에 읽고 쓴다. 저장소가 없거나 막혀 있으면 조용히 실패한다.
export function createSaver(storage, key = SAVE_KEY) {
  return {
    available: !!storage,
    load() {
      if (!storage) return null;
      let text = null;
      try { text = storage.getItem(key); } catch { return null; }
      if (text === null) return null;
      const result = parse(text);
      // 읽지 못한 내용은 지우지 않고 옆에 남겨 둔다
      if (!result.ok) { try { storage.setItem(`${key}:broken`, text); } catch { /* 남기지 못해도 계속한다 */ } }
      return result;
    },
    save(state, extra) {
      if (!storage) return false;
      try { storage.setItem(key, serialize(state, extra)); return true; } catch { return false; }
    },
  };
}
