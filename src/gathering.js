// 숲에서 줍기 (4단계 채집 실험, 2026-11-24 사용자 결정. 질문: 주운 것을 집에 두고 싶어 하는가).
// 날마다(한국 날짜) 숲의 12곳 가운데 6곳에 주울 거리가 놓이고, 금빛 고리의 "오늘의 발견"도 주울 수 있다.
// 놓이는 자리·종류·크기는 날짜만으로 정하므로 모두에게 같다(docs/GAME_PRINCIPLES.md 1-11). 하루에 주울 수는 제한하지 않는다.
// 기록을 바꾸는 것은 모두 명령을 거친다: validate → apply, 그리고 되돌리는 명령(inverseOf) (AGENTS.md 규칙 4).
// 기록은 집 저장·공유 링크·Firebase 와 섞지 않고 따로 둔다. 집에 놓기는 이번에 넣지 않는다.
// three.js 를 부르지 않는다.
import { FOREST_DISCOVERIES, GATHER_SPOTS, discoveryForDay, discoverySiteForDay, seededRandom } from './forest.js';

// 크기(cm). 같은 것이라도 크기가 달라, 더 큰 것을 찾으러 다닐 이유가 된다(2026-11-24 사용자 결정)
export const GATHER = Object.freeze({
  pinecone: Object.freeze({ label: '솔방울', min: 3, max: 12, unit: '개' }),
  mushroom: Object.freeze({ label: '작은 버섯', min: 2, max: 8, unit: '개' }),
  feather: Object.freeze({ label: '새 깃털', min: 6, max: 24, unit: '개' }),
});
export const GATHER_ORDER = FOREST_DISCOVERIES.map((d) => d.id);
export const DAILY_FINDS = 6;
export const SPECIAL_ID = 'special';
const SPECIAL_FROM = 0.85; // 보통 것은 크기 범위의 이만큼까지, 오늘의 발견은 그 위
// 이만큼 가까이 가면 줍는다. 오늘의 발견은 지금까지처럼 조금 더 멀리서(숲 연출의 발견하는 순간)
export const PICK_RADIUS = 0.8;
export const SPECIAL_RADIUS = 1.3;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86400000);
const round1 = (v) => Math.round(v * 10) / 10;

// 그날 숲에 놓이는 것들. [{ id, x, z, kind, size, special }]. 같은 날이면 늘 같은 답이다
const cache = new Map();
export function findsForDay(day) {
  if (typeof day !== 'string' || !DAY.test(day)) throw new TypeError('YYYY-MM-DD 날짜가 필요합니다');
  if (cache.has(day)) return cache.get(day);
  const rand = seededRandom((dayNumber(day) * 2654435761 + 0x5eed) >>> 0);
  const order = GATHER_SPOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const finds = order.slice(0, DAILY_FINDS).sort((a, b) => a - b).map((i) => {
    const kind = GATHER_ORDER[Math.floor(rand() * GATHER_ORDER.length)];
    const { min, max } = GATHER[kind];
    // 작은 것이 흔하고 큰 것은 드물다. 보통 것은 크기 범위의 85%까지만 나온다(그 위는 오늘의 발견)
    const size = round1(min + (max - min) * SPECIAL_FROM * rand() ** 1.6);
    return Object.freeze({ id: `s${i}`, ...GATHER_SPOTS[i], kind, size, special: false });
  });
  // 오늘의 발견: 금빛 고리 자리. 언제나 그날 보통 것보다 크다(크기 범위의 위쪽 15%)
  const kind = discoveryForDay(day).id;
  const { min, max } = GATHER[kind];
  const site = discoverySiteForDay(day);
  finds.push(Object.freeze({ id: SPECIAL_ID, x: site.x, z: site.z, kind, size: round1(min + (max - min) * (SPECIAL_FROM + 0.01 + (0.99 - SPECIAL_FROM) * rand())), special: true }));
  const out = Object.freeze(finds);
  cache.set(day, out);
  return out;
}
export const findById = (day, id) => findsForDay(day).find((f) => f.id === id) || null;

// ---- 채집 기록 ----
// state = { version, log: { 종류: { best, first, count } }, day: 주운 자리를 적은 날 | null, picked: [그날 주운 자리] }
// picked 는 날이 바뀌면 비운 것으로 본다(pickedOn)
export const GATHER_VERSION = 1;
export function createGatherState() { return { version: GATHER_VERSION, log: {}, day: null, picked: [] }; }
export const pickedOn = (state, day) => (state.day === day ? state.picked : []);

const knownKind = (kind) => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(GATHER, kind);
const sizeFits = (kind, size) => Number.isFinite(size) && size >= GATHER[kind].min && size <= GATHER[kind].max;
function entryFits(kind, entry) {
  return !!entry && typeof entry === 'object' && sizeFits(kind, entry.best) &&
    typeof entry.first === 'string' && DAY.test(entry.first) && Number.isInteger(entry.count) && entry.count >= 1;
}
function pickedFits(day, picked) {
  if (day === null) return Array.isArray(picked) && picked.length === 0;
  if (typeof day !== 'string' || !DAY.test(day) || !Array.isArray(picked)) return false;
  return new Set(picked).size === picked.length && picked.every((id) => findById(day, id));
}

export function validate(state, cmd) {
  switch (cmd?.type) {
    case 'pick': {
      // 명령에는 날짜와 자리만 있다. 종류와 크기는 규칙이 날짜로 정하므로 지어낼 수 없다
      if (typeof cmd.day !== 'string' || !DAY.test(cmd.day)) return { ok: false, reason: '날짜가 맞지 않습니다' };
      if (!findById(cmd.day, cmd.id)) return { ok: false, reason: '그날 그 자리에는 주울 것이 없습니다' };
      if (pickedOn(state, cmd.day).includes(cmd.id)) return { ok: false, reason: '이미 주웠습니다' };
      return { ok: true };
    }
    case 'setGatherEntry':
      if (!knownKind(cmd.kind)) return { ok: false, reason: '모르는 것입니다' };
      if (cmd.entry !== null && !entryFits(cmd.kind, cmd.entry)) return { ok: false, reason: '기록이 맞지 않습니다' };
      if ('day' in cmd && !pickedFits(cmd.day, cmd.picked)) return { ok: false, reason: '주운 자리 기록이 맞지 않습니다' };
      return { ok: true };
    case 'setPicked':
      if (!pickedFits(cmd.day, cmd.picked)) return { ok: false, reason: '주운 자리 기록이 맞지 않습니다' };
      return { ok: true };
    default:
      return { ok: false, reason: '모르는 명령입니다' };
  }
}

// 명령을 적용한 새 상태를 돌려준다. 받은 상태는 고치지 않는다
export function apply(state, cmd) {
  const log = { ...state.log };
  let { day, picked } = state;
  if (cmd.type === 'pick') {
    const find = findById(cmd.day, cmd.id);
    const was = log[find.kind];
    log[find.kind] = was
      ? { best: Math.max(was.best, find.size), first: was.first, count: was.count + 1 }
      : { best: find.size, first: cmd.day, count: 1 };
    picked = [...pickedOn(state, cmd.day), cmd.id];
    day = cmd.day;
  } else if (cmd.type === 'setGatherEntry') {
    if (cmd.entry) log[cmd.kind] = { ...cmd.entry }; else delete log[cmd.kind];
    if ('day' in cmd) { day = cmd.day; picked = [...cmd.picked]; }
  } else if (cmd.type === 'setPicked') {
    day = cmd.day; picked = [...cmd.picked];
  }
  return { ...state, log, day, picked };
}

// 명령을 되돌리는 명령. 적용하기 전의 상태로 구한다
export function inverseOf(state, cmd) {
  if (cmd.type === 'pick') {
    const kind = findById(cmd.day, cmd.id).kind;
    const was = state.log[kind];
    return { type: 'setGatherEntry', kind, entry: was ? { ...was } : null, day: state.day, picked: [...state.picked] };
  }
  if (cmd.type === 'setGatherEntry') {
    const was = state.log[cmd.kind];
    const back = { type: 'setGatherEntry', kind: cmd.kind, entry: was ? { ...was } : null };
    return 'day' in cmd ? { ...back, day: state.day, picked: [...state.picked] } : back;
  }
  return { type: 'setPicked', day: state.day, picked: [...state.picked] };
}

export function createGatherStore(initial = createGatherState()) {
  let state = initial;
  const listeners = new Set();
  return {
    get state() { return state; },
    can: (cmd) => validate(state, cmd),
    // 검증하고 적용한다. 통과하면 되돌리는 명령(inverse)도 돌려준다
    dispatch(cmd) {
      const result = validate(state, cmd);
      if (!result.ok) return result;
      const inverse = inverseOf(state, cmd);
      state = apply(state, cmd);
      for (const fn of listeners) fn(cmd);
      return { ok: true, inverse };
    },
    // 다른 탭이 저장한 기록으로 바꾼다
    replace(next) { state = next; for (const fn of listeners) fn({ type: 'replace' }); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

// ---- 저장 ----
export const GATHER_KEY = 'maeul:gathering';
// 형식을 바꾸면 GATHER_VERSION 을 올리고 여기에 변환을 더한다. MIGRATIONS[1] 은 1판을 2판으로 바꾼다
const MIGRATIONS = {};

export function serializeGather(state) {
  return JSON.stringify({ format: 'gather-log', version: GATHER_VERSION, log: state.log, day: state.day, picked: state.picked });
}

// 글자를 기록으로 되읽는다. 지금 규칙에 맞지 않는 항목은 명령으로 다시 넣어 보며 걸러 낸다
export function parseGather(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, reason: '채집 기록을 읽을 수 없습니다' }; }
  if (!data || data.format !== 'gather-log' || typeof data.log !== 'object' || data.log === null) {
    return { ok: false, reason: '채집 기록의 형식이 다릅니다' };
  }
  let version = Number(data.version) || 0;
  if (version > GATHER_VERSION) return { ok: false, newer: true, reason: '더 새로운 판에서 저장한 채집 기록이라 읽을 수 없습니다' };
  while (version < GATHER_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return { ok: false, reason: `${version}판 채집 기록을 바꾸는 방법이 없습니다` };
    data = step(data);
    version++;
  }
  const store = createGatherStore();
  let dropped = 0;
  for (const [kind, entry] of Object.entries(data.log)) {
    if (!store.dispatch({ type: 'setGatherEntry', kind, entry }).ok) dropped++;
  }
  // 주운 자리가 맞지 않으면 그날 것만 비운다. 종류별 기록은 남는다
  if (data.day !== undefined && data.day !== null && !store.dispatch({ type: 'setPicked', day: data.day, picked: data.picked }).ok) dropped++;
  return { ok: true, state: store.state, dropped };
}

function isNewerRecord(text) {
  try { const data = JSON.parse(text); return data?.format === 'gather-log' && Number(data.version) > GATHER_VERSION; } catch { return false; }
}

// 저장소 하나에 읽고 쓴다. 낚시 기록(fishing.js createFishingSaver)과 같은 규칙이다.
// 읽지 못한 기록은 지우지 않고 옆(:broken)에 남긴다. 더 새로운 판의 기록은 읽지도 덮어쓰지도 않는다
export function createGatherSaver(storage, key = GATHER_KEY) {
  return {
    available: !!storage,
    load() {
      if (!storage) return null;
      let text = null;
      try { text = storage.getItem(key); } catch { return null; }
      if (text === null) return { ok: true, state: createGatherState(), dropped: 0 };
      const result = parseGather(text);
      if (!result.ok && !result.newer) {
        try { if (storage.getItem(`${key}:broken`) === null) storage.setItem(`${key}:broken`, text); } catch { /* 남기지 못해도 계속한다 */ }
      }
      return result;
    },
    save(state) {
      if (!storage) return false;
      try {
        const now = storage.getItem(key);
        if (now !== null && isNewerRecord(now)) return false;
        storage.setItem(key, serializeGather(state));
        return true;
      } catch { return false; }
    },
    newerStored() {
      if (!storage) return false;
      try { const now = storage.getItem(key); return now !== null && isNewerRecord(now); } catch { return false; }
    },
  };
}

