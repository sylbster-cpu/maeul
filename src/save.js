// 저장과 불러오기. 상태를 글자(JSON)로 바꾸고 되읽는다.
// 불러올 때는 저장된 내용을 명령으로 하나씩 다시 적용해 본다. 지금의 규칙과 부품 목록에
// 맞지 않는 항목(없어진 가구, 겹치는 물건 등)은 버리고 나머지만 살린다.
// 저장소(localStorage 등)는 밖에서 넘겨받으므로 three.js 나 브라우저 없이도 실행된다.
//
// 더 새로운 판을 지키기(2026-11-25, PR #42 GPT 검토 1): 이 화면이 모르는 부품이 든 집이나 더 새로운 판의 집을 읽으면,
// 원문을 옆(:newer)에 남기고 이 화면에서는 저장하지 않는다(createSaver 의 locked). 예전에는 모르는 부품을 빼고 읽은 채
// 자동 저장해서, 새 판에서 놓은 물건이 옛 화면(브라우저에 남은 옛 파일, 되돌린 판)에서 사라질 수 있었다.
// 그래서 부품을 PARTS 에서 없앨 때는 SAVE_VERSION 을 올리고 MIGRATIONS 에서 지워야 한다. 그냥 빼면 그 부품이 든 집은 저장되지 않는다.

import { PARTS, LEVELS } from './parts.js';
import { createState, createStore, SPACES, layerOf, hasOwn } from './state.js';

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
  if (version > SAVE_VERSION) return { ok: false, newer: true, reason: '더 새로운 판에서 저장한 내용이라 읽을 수 없습니다' };
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
  let unknown = 0; // 이 화면이 모르는 부품 (더 새로운 판에서 놓은 것일 수 있다)
  const put = (cmd) => { const r = store.dispatch(cmd); if (!r.ok) dropped++; return r.ok; };
  const same = (r) => r.reason?.startsWith('이미 그'); // 기본값과 같은 것은 버린 것이 아니다

  // 집의 단계는 한 단계씩 올린다
  const level = Number.isInteger(src.house?.level) && hasOwn(LEVELS, src.house.level) ? src.house.level : 1;
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
      if (o && hasOwn(PARTS, o.part)) known.push(o); else { dropped++; if (o && typeof o.part === 'string') unknown++; }
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
  return { ok: true, state: store.state, pos, place, dropped, unknown, savedAt: data.savedAt || null };
}

// 저장된 글자가 이 화면보다 새로운 판의 집인지 (판 번호가 크거나, 모르는 부품이 있거나). 그런 집 위에는 쓰지 않는다
export function isNewerHouse(text) {
  let data;
  try { data = JSON.parse(text); } catch { return false; }
  if (!data || data.format !== 'house-lab') return false;
  if ((Number(data.version) || 0) > SAVE_VERSION) return true;
  for (const space of SPACES) {
    for (const o of Object.values(data.state?.spaces?.[space]?.objects || {})) {
      if (o && typeof o.part === 'string' && !hasOwn(PARTS, o.part)) return true;
    }
  }
  return false;
}

// 저장소 하나에 읽고 쓴다. 저장소가 없거나 막혀 있으면 조용히 실패한다.
// 더 새로운 판의 집을 읽었으면 locked 가 되어 저장하지 않는다(위 머리글). 쓰기 직전에도 저장소의 글자를 한 번 더 본다
export function createSaver(storage, key = SAVE_KEY) {
  let locked = false;
  return {
    available: !!storage,
    get locked() { return locked; },
    load() {
      if (!storage) return null;
      let text = null;
      try { text = storage.getItem(key); } catch { return null; }
      if (text === null) return null;
      const result = parse(text);
      // 읽지 못한 내용은 지우지 않고 옆에 남겨 둔다
      if (!result.ok) { try { storage.setItem(`${key}:broken`, text); } catch { /* 남기지 못해도 계속한다 */ } }
      // 더 새로운 판의 집: 원문을 옆에 남기고 이 화면에서는 저장하지 않는다
      if (result.newer || (result.ok && result.unknown > 0)) {
        locked = true;
        try { storage.setItem(`${key}:newer`, text); } catch { /* 남기지 못해도 저장은 막는다 */ }
      }
      return result;
    },
    save(state, extra) {
      if (!storage || locked) return false;
      try {
        const now = storage.getItem(key);
        if (now !== null && isNewerHouse(now)) { locked = true; return false; } // 그사이 새 판이 저장했다
        storage.setItem(key, serialize(state, extra));
        return true;
      } catch { return false; }
    },
  };
}
