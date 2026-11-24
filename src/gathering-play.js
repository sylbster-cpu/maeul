// 숲에서 줍기의 흐름 (4단계 채집). 주울 거리에 가까이 가면 줍는다. 주울 거리를 누르면 그 곁으로 걸어간다.
// 기록은 gathering.js 의 명령으로만 바꾸고, 집 저장·낚시 기록과 다른 열쇠에 둔다.
import {
  GATHER, SPECIAL_ID, PICK_RADIUS, SPECIAL_RADIUS, findsForDay, pickedOn, createGatherStore, createGatherSaver, GATHER_KEY,
} from './gathering.js';
import { koreaDay, forestViewingPoint, FOREST_DISCOVERIES } from './forest.js';

const TAP_RADIUS = 0.75; // 주울 거리를 이만큼 가까이 누르면 그것을 누른 것으로 본다
const STAND = 0.5; // 보통 주울 거리를 눌렀을 때 그 뒤로 이만큼 떨어져 선다(걸어가는 도중 PICK_RADIUS 안에 들면 줍는다)

export function createGathering({ character, view, ui, audio, haptics = null, storage, now = () => new Date() }) {
  const saver = createGatherSaver(storage);
  const first = saver.load();
  const store = createGatherStore(first?.ok ? first.state : undefined);
  const loadProblem = first?.newer ? '더 새로운 판에서 저장한 채집 기록이 있어, 이 화면에서는 채집 기록을 저장하지 않습니다. 새로 고쳐 주세요'
    : first && !first.ok ? `${first.reason}. 새 기록으로 시작합니다`
    : first?.dropped ? `채집 기록 가운데 ${first.dropped}개는 맞지 않아 빼고 불러왔습니다` : '';
  let day = koreaDay(now());
  let checkT = 0;
  const pending = new Set(); // 저장하는 중인 자리 (같은 자리를 두 번 줍지 않게)

  const pickedToday = () => pickedOn(store.state, day);
  const left = () => { const done = pickedToday(); return findsForDay(day).filter((f) => !done.includes(f.id) && !pending.has(f.id)); };
  const sync = () => view.forest.setPicked(day, [...pickedToday(), ...pending]);
  store.subscribe(sync);
  sync();

  // 다른 탭에서 주운 기록을 먼저 읽고 더한다. 웹 잠금이 있으면 탭끼리 차례를 지킨다(낚시 기록과 같다)
  function record(cmd) {
    const run = () => {
      const latest = saver.load();
      if (latest?.ok) store.replace(latest.state);
      const r = store.dispatch(cmd);
      return r.ok ? saver.save(store.state) : 'already'; // 다른 탭에서 먼저 주웠으면 'already'
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
        ui.toast(saver.newerStored() ? '더 새로운 판의 채집 기록이 있어 저장하지 않았습니다. 새로 고쳐 주세요' : '이 브라우저에서는 채집 기록이 저장되지 않습니다', 'error');
      }
    });
  }

  return {
    store,
    loadProblem,
    get day() { return day; },
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
      if (checkT >= 5) {
        checkT = 0;
        const d = koreaDay(now());
        if (d !== day) { day = d; sync(); }
      }
      if (character.place !== 'yard') return;
      const p = character.pos;
      for (const f of left()) {
        if (Math.hypot(p.x - f.x, p.z - f.z) < (f.special ? SPECIAL_RADIUS : PICK_RADIUS)) pick(f);
      }
    },
  };
}
