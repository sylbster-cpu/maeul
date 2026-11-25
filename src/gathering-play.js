// 숲에서 줍기의 흐름 (4단계 채집). 주울 거리에 가까이 가면 줍는다. 주울 거리를 누르면 그 곁으로 걸어간다.
// 기록은 gathering.js 의 명령으로만 바꾸고, 집 저장·낚시 기록과 다른 열쇠에 둔다.
// 숲 화면(forest-view.js)이 지금 어느 날·시간대의 것을 그릴지는 여기서 정해 알린다(시계는 여기 하나).
import {
  GATHER, SPECIAL_ID, PICK_RADIUS, SPECIAL_RADIUS, findsForDay, pickedOn, kstSlot, createGatherStore, createGatherSaver, GATHER_KEY,
} from './gathering.js';
import { forestViewingPoint, FOREST_DISCOVERIES } from './forest.js';

const TAP_RADIUS = 0.75; // 주울 거리를 이만큼 가까이 누르면 그것을 누른 것으로 본다
const STAND = 0.5; // 보통 주울 거리를 눌렀을 때 그 뒤로 이만큼 떨어져 선다(걸어가는 도중 PICK_RADIUS 안에 들면 줍는다)

export function createGathering({ character, view, ui, audio, haptics = null, storage, now: clock = () => new Date() }) {
  let now = clock;
  const saver = createGatherSaver(storage);
  const first = saver.load();
  const store = createGatherStore(first?.ok ? first.state : undefined);
  const loadProblem = first?.newer ? '더 새로운 판에서 저장한 채집 기록이 있어, 이 화면에서는 채집 기록을 저장하지 않습니다. 새로 고쳐 주세요'
    : first && !first.ok ? `${first.reason}. 새 기록으로 시작합니다`
    : first?.dropped ? `채집 기록 가운데 ${first.dropped}개는 맞지 않아 빼고 불러왔습니다` : '';
  let { day, slot } = kstSlot(now());
  let checkT = 0;
  const pending = new Set(); // 저장하는 중인 자리 (같은 자리를 두 번 줍지 않게)

  const pickedToday = () => pickedOn(store.state, day);
  // 지금 시간대에 놓인 것과 오늘의 발견 가운데 아직 줍지 않은 것
  const left = () => { const done = pickedToday(); return findsForDay(day, slot).filter((f) => !done.includes(f.id) && !pending.has(f.id)); };
  const sync = () => view.forest.setPicked(day, slot, [...pickedToday(), ...pending]);
  // 날이나 시간대가 바뀌었으면 숲을 새로 놓는다
  function tick() {
    const at = kstSlot(now());
    if (at.day !== day || at.slot !== slot) { ({ day, slot } = at); sync(); }
  }
  store.subscribe(sync);
  sync();

  // 다른 탭에서 주운 기록을 먼저 읽고 더한다. 웹 잠금이 있으면 탭끼리 차례를 지킨다(낚시 기록과 같다).
  // 저장소가 있는데 쓰지 못했으면 줍기 전으로 되돌린다. 메모리에만 남기면 다음 줍기가 저장소의 옛 기록을 읽어
  // 앞서 주운 것을 소리 없이 지운다(PR #41 GPT 검토 2). 저장소가 아예 없는 브라우저에서는 이번 접속 동안만 메모리에 남긴다
  function record(cmd) {
    const run = () => {
      const latest = saver.load();
      if (latest?.ok) store.replace(latest.state);
      const before = store.state;
      const r = store.dispatch(cmd);
      if (!r.ok) return 'already'; // 다른 탭에서 먼저 주웠으면 'already'
      const saved = saver.save(store.state);
      if (!saved && saver.available) store.replace(before);
      return saved;
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
    if (locks?.request) return locks.request(GATHER_KEY, run).catch(() => run());
    return Promise.resolve(run());
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== GATHER_KEY) return;
      const latest = saver.load();
      if (latest?.ok) store.replace(latest.state);
    });
  }

  function pick(f) {
    const was = store.state.log[f.kind];
    const label = GATHER[f.kind].label;
    pending.add(f.id);
    // 연출은 닿은 바로 그 화면에 (1-1). 기록은 뒤따라 저장한다
    if (f.special) {
      view.forest.found(character.pos);
      audio.play('find');
      const about = FOREST_DISCOVERIES.find((d) => d.id === f.kind)?.description || '';
      ui.toast(`숲에서 발견: ${label} ${f.size}cm를 주웠습니다. ${about}`);
    } else {
      view.forest.pick(f.id);
      audio.play('pick');
      haptics?.pulse(8);
      const note = !was ? ` 처음 주운 ${label}입니다.` : f.size > was.best ? ` 가장 큰 ${label}입니다!` : '';
      ui.toast(`${label} ${f.size}cm를 주웠습니다.${note}`);
    }
    record({ type: 'pick', day, id: f.id }).then((saved) => {
      pending.delete(f.id);
      sync();
      if (saved === false) {
        ui.toast(!saver.available ? '이 브라우저에서는 채집 기록이 저장되지 않습니다. 이번 접속 동안만 남습니다'
          : saver.newerStored() ? '더 새로운 판의 채집 기록이 있어 줍지 못했습니다. 새로 고쳐 주세요'
            : '채집 기록을 저장하지 못해 줍지 못했습니다. 저장 공간을 확인해 주세요', 'error');
      }
    });
  }

  return {
    store,
    loadProblem,
    get day() { return day; },
    get slot() { return slot; },
    // 자동 시험이 시간을 옮겨 본다 (시간대가 바뀌면 새로 놓인다)
    setClock(fn) { now = fn || clock; tick(); },
    // 오늘 아직 줍지 않은 것 (자동 시험과 기록 창이 읽는다)
    get left() { return left(); },
    pickedToday: (id) => pickedToday().includes(id) || pending.has(id),
    // 누른 땅이 주울 거리 곁이면 걸어갈 자리를 돌려준다. 카메라 반대쪽에 서서 몸이 주울 거리를 가리지 않게 한다
    walkTarget(pt, forward) {
      if (character.place !== 'yard' || !pt) return null;
      let best = null, bestD = TAP_RADIUS;
      for (const f of left()) { const d = Math.hypot(pt.x - f.x, pt.z - f.z); if (d < bestD) { best = f; bestD = d; } }
      if (!best) return null;
      return best.special ? forestViewingPoint(best, forward) : forestViewingPoint(best, forward, STAND);
    },
    update(dt) {
      checkT += dt;
      if (checkT >= 5) { checkT = 0; tick(); }
      if (character.place !== 'yard') return;
      const p = character.pos;
      for (const f of left()) {
        if (Math.hypot(p.x - f.x, p.z - f.z) < (f.special ? SPECIAL_RADIUS : PICK_RADIUS)) pick(f);
      }
    },
  };
}
