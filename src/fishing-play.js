// 낚시 놀이의 흐름. 물을 누르면 연못가로 걸어가 찌를 던지고, 찌가 완전히 잠길 때 누르면 낚는다.
// 흐름: idle → walk(물가로) → cast(던짐) → wait(다가오고 건드림) → bite(잠김) → result → idle
// 기록은 fishing.js 의 명령으로만 바꾸고, 집 저장과 다른 열쇠에 둔다.
import {
  FISH, inWater, rollFish, rollSize, planBite, judge, kstDay,
  createFishingStore, createFishingSaver, FISHING_KEY,
} from './fishing.js';
import { POND } from './parts.js';

const CAST_TIME = 0.5;
const RESULT_TIME = 0.8; // 놓쳤을 때 결과를 보이는 시간
const CATCH_TIME = 2.0; // 낚은 물고기를 들어 보이는 시간
const SKIP_AFTER = 0.5; // 결과를 보이는 중 이만큼 지나 누르면 바로 넘어간다
const REACH = 3.2; // 찌를 던지는 가장 먼 거리
const SHORE = 1.4; // 물가에서 이만큼 안에 서 있어야 던질 수 있다

// 받침 '을/를'
const objectParticle = (word) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를';
};

export function createFishing({ character, pondView, ui, audio, storage, catchCard = null, random: rng = Math.random, now = Date.now, onChange = () => {} }) {
  let random = rng;
  const saver = createFishingSaver(storage);
  const first = saver.load();
  const store = createFishingStore(first?.ok ? first.state : undefined);
  const loadProblem = first && !first.ok ? `${first.reason}. 새 기록으로 시작합니다`
    : first?.dropped ? `낚시 기록 가운데 ${first.dropped}개는 맞지 않아 빼고 불러왔습니다` : '';
  let phase = 'idle';
  let t = 0;
  let plan = null;
  let size = 0;
  let aim = null;
  let nibbles = 0;
  let wasNear = false;
  let stand = null; // 던진 자리. 걸어서 떠나기 전까지 카메라가 물가와 찌 사이를 가까이 본다
  let resultTime = RESULT_TIME;
  const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* 진동이 없는 기기 */ } };
  let last = null; // 마지막 결과 (자동 시험이 읽는다)

  function setPhase(next) { phase = next; t = 0; onChange(); }
  const nearWater = () => character.place === 'yard' && inWater(character.pos.x, character.pos.z, SHORE);

  // 다른 탭에서 낚은 기록을 먼저 읽고 더한다. 덮어써서 지우지 않게 한다
  function record(cmd) {
    const latest = saver.load();
    if (latest?.ok) store.replace(latest.state);
    const r = store.dispatch(cmd);
    return r.ok ? saver.save(store.state) : false;
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== FISHING_KEY) return;
      const latest = saver.load();
      if (latest?.ok) store.replace(latest.state);
    });
  }

  // 찌가 떨어질 곳. 누른 쪽으로 던지되 너무 멀지 않게, 물가에서 조금 떨어진 물 위에 떨어지게 한다
  function bobberSpot() {
    const p = character.pos;
    let dx = aim.x - p.x, dz = aim.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const d = Math.min(Math.max(len, 1.2), REACH);
    const b = { x: p.x + dx * d, z: p.z + dz * d };
    for (let k = 0; k < 12 && !inWater(b.x, b.z, -0.45); k++) { b.x += (POND.x - b.x) * 0.2; b.z += (POND.z - b.z) * 0.2; }
    return b;
  }
  function cast() {
    const spot = bobberSpot();
    character.face(spot.x, spot.z);
    aim = spot;
    const fish = rollFish(random);
    plan = planBite(fish, random);
    size = rollSize(fish, random);
    nibbles = 0;
    stand = { x: character.pos.x, z: character.pos.z };
    pondView.cast(spot);
    audio.play('cast');
    setPhase('cast');
  }
  function arrive() {
    if (!nearWater()) {
      ui.toast('연못가로 갈 수 없습니다. 가구가 길을 막고 있는지 보세요', 'error');
      audio.play('error');
      setPhase('idle');
      return;
    }
    cast();
  }

  function finish(verdict) {
    last = { verdict, fish: plan.fish, size: verdict === 'caught' ? size : null };
    if (verdict === 'caught') {
      const fish = plan.fish;
      const label = FISH[fish].label;
      const was = store.state.log[fish];
      const saved = record({ type: 'recordCatch', fish, size, day: kstDay(now()) });
      const note = !was ? '처음 잡은 물고기입니다' : size > was.best ? '최고 기록입니다' : '';
      // 낚은 순간은 작은 알림 대신 화면 가운데 카드로 크게 보여 준다
      if (catchCard) catchCard.show({ label, size, note });
      else ui.toast(`${label}${objectParticle(label)} 낚았습니다! ${size}cm. ${note}`);
      if (!saved) ui.toast('이 브라우저에서는 낚시 기록이 저장되지 않습니다', 'error');
      pondView.catchFish(fish, size);
      audio.play('catch');
      buzz([30, 40, 30]);
      resultTime = CATCH_TIME;
    } else {
      ui.toast({
        reeled: '찌를 거두었습니다',
        early: '너무 일찍 당겼습니다. 찌가 완전히 잠길 때 누르세요',
        late: '늦었습니다. 찌가 잠기면 바로 누르세요',
      }[verdict], verdict === 'reeled' ? 'info' : 'error');
      pondView.escape();
      audio.play(verdict === 'reeled' ? 'step' : 'miss');
      resultTime = RESULT_TIME;
    }
    setPhase('result');
  }

  // 결과 보이기를 끝내고 다음 던지기를 기다린다. 낚싯대는 내려놓고 카메라는 그대로 둔다
  function endResult() { pondView.reset(); catchCard?.hide(); setPhase('idle'); }

  return {
    store,
    loadProblem,
    get phase() { return phase; },
    get last() { return last; },
    get plan() { return plan; },
    get nibbled() { return nibbles; },
    get elapsed() { return t; }, // 지금 단계에 들어선 뒤 흐른 게임 시간(초). 찌가 물에 닿은 뒤로는 입질 계획과 같은 시계다
    // 자동 시험이 물고기와 입질을 정해 둘 때 쓴다
    setRandom(fn) { random = fn; },
    // 낚시를 하고 있으면 화면 누름은 줄을 당기는 데 쓴다 (걷지 않는다)
    get holding() { return phase === 'cast' || phase === 'wait' || phase === 'bite' || phase === 'result'; },
    isWater: (point) => character.place === 'yard' && inWater(point.x, point.z, 0.15),
    // 물을 눌렀을 때. 물가로 걸어간 뒤 던진다
    start(point) {
      if (phase !== 'idle' && phase !== 'walk') return;
      aim = { x: point.x, z: point.z };
      if (character.goTo(point.x, point.z)) setPhase('walk');
      else arrive();
    },
    // 화면을 눌러 줄을 당긴다. 던지는 중에는 누름을 흘려보낸다. 결과를 보이는 중에는 조금 지나 누르면 넘어간다
    pull() {
      if (phase === 'wait' || phase === 'bite') finish(judge(plan, t));
      else if (phase === 'result' && t >= SKIP_AFTER) endResult();
    },
    cancel() {
      stand = null;
      if (phase === 'idle') return;
      pondView.reset();
      catchCard?.hide();
      setPhase('idle');
    },
    // 카메라가 가까이 볼 곳 (물가와 찌 사이). 낚시를 하지 않거나 물가를 떠났으면 null
    focus() {
      if (!stand || !aim || phase === 'walk') return null;
      if (Math.hypot(character.pos.x - stand.x, character.pos.z - stand.z) > 0.4) { stand = null; return null; }
      return { x: (stand.x + aim.x) / 2, z: (stand.z + aim.z) / 2 };
    },
    hint() {
      switch (phase) {
        case 'walk': return '연못가로 걸어가는 중입니다.';
        case 'cast': case 'wait': return '찌가 흔들릴 때는 기다리고, 완전히 잠기면 화면을 누릅니다.';
        case 'bite': return '지금 누르세요!';
        default: return nearWater() ? '물을 누르면 찌를 던집니다. 잡은 물고기는 낚시 기록에 남습니다.' : null;
      }
    },
    update(dt) {
      pondView.update(dt);
      const near = phase === 'idle' && nearWater();
      if (near !== wasNear) { wasNear = near; onChange(); }
      if (phase === 'idle') return;
      t += dt;
      if (phase === 'walk') { if (!character.walking) arrive(); return; }
      if (phase === 'cast') {
        if (t >= CAST_TIME) { pondView.land(aim, plan.fish, plan.approach); audio.play('splash'); setPhase('wait'); }
        return;
      }
      if (phase === 'wait') {
        while (nibbles < plan.nibbles.length && t >= plan.nibbles[nibbles]) { nibbles++; pondView.nibble(); audio.play('nibble'); buzz(12); }
        // 찌가 물에 닿은 때부터 재므로 시간을 되돌리지 않고 이어 간다
        if (t >= plan.bite) { phase = 'bite'; pondView.bite(); audio.play('bite'); buzz([70, 30, 70]); onChange(); }
        return;
      }
      if (phase === 'bite') { if (t > plan.bite + plan.window) finish('late'); return; }
      if (phase === 'result' && t >= resultTime) endResult();
    },
  };
}
