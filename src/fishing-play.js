// 낚시 놀이의 흐름. 물을 누르면 연못가로 걸어가 찌를 던지고, 찌가 완전히 잠길 때 누르면 낚는다.
// 흐름: idle → walk(물가로) → cast(던짐) → wait(다가오고 건드림) → bite(잠김) → result → idle
// 기록은 fishing.js 의 명령으로만 바꾸고, 집 저장과 다른 열쇠에 둔다.
import {
  FISH, HUSH, inWater, rollFish, rollSize, planBite, judge, kstDay, catchWeight,
  createFishingStore, createFishingSaver, FISHING_KEY,
} from './fishing.js';
import { POND } from './parts.js';

const CAST_TIME = 0.5;
const RESULT_TIME = 0.8; // 놓쳤을 때 결과를 보이는 시간
const CATCH_TIME = 2.0; // 낚은 물고기를 들어 보이는 시간. 무거운 물고기는 조금 더 길게 본다
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
  const loadProblem = first?.newer ? '더 새로운 판에서 저장한 낚시 기록이 있어, 이 화면에서는 낚시 기록을 저장하지 않습니다. 새로 고쳐 주세요'
    : first && !first.ok ? `${first.reason}. 새 기록으로 시작합니다`
    : first?.dropped ? `낚시 기록 가운데 ${first.dropped}개는 맞지 않아 빼고 불러왔습니다` : '';
  let phase = 'idle';
  let t = 0;
  let plan = null;
  let size = 0;
  let aim = null;
  let nibbles = 0;
  let hushedAt = null; // 물기 직전 잠잠해진 때 (자동 시험이 읽는다)
  let pressed = null; // 눌렀지만 아직 판정하지 않은 누름 { t, phase }. 두 손가락 확대인지 잠깐 본다(input.js)
  let plopWait = 3; // 연못가의 물소리 사이사이 작은 퐁 소리까지 남은 시간
  let wasNear = false;
  let stand = null; // 던진 자리. 걸어서 떠나기 전까지 카메라가 물가와 찌 사이를 가까이 본다
  let resultTime = RESULT_TIME;
  const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch { /* 진동이 없는 기기 */ } };
  let last = null; // 마지막 결과 (자동 시험이 읽는다)

  function setPhase(next) { phase = next; t = 0; onChange(); }
  const nearWater = () => character.place === 'yard' && inWater(character.pos.x, character.pos.z, SHORE);

  // 다른 탭에서 낚은 기록을 먼저 읽고 더한다. 덮어써서 지우지 않게 한다.
  // 웹 잠금(Web Locks)이 있는 브라우저에서는 탭끼리 차례를 지켜 읽고 쓴다. 거의 동시에 낚아도 하나가 빠지지 않는다.
  // 없는 브라우저에서는 차례를 지킬 수 없어, 두 탭에서 거의 동시에 낚으면 하나가 빠질 수 있다
  function record(cmd) {
    const run = () => {
      const latest = saver.load();
      if (latest?.ok) store.replace(latest.state);
      const r = store.dispatch(cmd);
      return r.ok ? saver.save(store.state) : false;
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
    if (locks?.request) return locks.request(FISHING_KEY, run).catch(() => run());
    return Promise.resolve(run());
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
    hushedAt = null;
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
      const weight = catchWeight(fish, size);
      const was = store.state.log[fish];
      record({ type: 'recordCatch', fish, size, day: kstDay(now()) }).then((saved) => {
        if (saved) return;
        ui.toast(saver.newerStored() ? '더 새로운 판의 낚시 기록이 있어 저장하지 않았습니다. 새로 고쳐 주세요' : '이 브라우저에서는 낚시 기록이 저장되지 않습니다', 'error');
      });
      const note = !was ? '처음 잡은 물고기입니다' : size > was.best ? '최고 기록입니다' : '';
      // 낚은 순간은 작은 알림 대신 화면 가운데 카드로 크게 보여 준다
      if (catchCard) catchCard.show({ label, size, note });
      else ui.toast(`${label}${objectParticle(label)} 낚았습니다! ${size}cm. ${note}`);
      // 낚아챈 바로 그 순간에 신호를 몰아 준다: 멈춤·흰 번쩍·흔들림·물보라(pondView), 묵직한 소리, 진동.
      // 크기는 무게감에 맞춘다. 송사리는 가볍게, 메기는 크게. 가락은 물고기가 손에 떨어질 때 울린다
      pondView.catchFish(fish, size, weight, () => audio.play('catch', { pitch: 1.12 - 0.2 * weight }));
      audio.play('hook', { pitch: 1.4 - 0.65 * weight, gain: 0.65 + 0.55 * weight });
      buzz(weight < 0.35 ? [25] : weight < 0.7 ? [35, 30, 35] : [55, 35, 70]);
      resultTime = CATCH_TIME + 0.3 * weight;
    } else {
      // 놓쳐도 빨간 오류로 다그치지 않는다. 무엇 때문이었는지만 알린다(여유 쪽 제안, 2026-11-22 사용자 결정)
      ui.toast({
        reeled: '찌를 거두었습니다',
        early: '물고기가 아직 찌를 건드려 보던 중이었습니다. 찌가 쏙 잠길 때 눌러 보세요',
        late: '물고기가 미끼만 먹고 갔습니다. 찌가 잠기면 조금 더 일찍 눌러 보세요',
      }[verdict], 'info');
      pondView.escape();
      audio.play(verdict === 'reeled' ? 'step' : 'miss');
      resultTime = RESULT_TIME;
    }
    setPhase('result');
  }

  // 바탕 소리: 연못에 가까울수록 물소리가 들린다(방 안에서는 없다). 낚시하는 동안은 가득,
  // 진짜로 물기 직전 잠잠할 때는 작게 줄인다(완전히 끄지는 않는다, docs/GAME_PRINCIPLES.md 1-2).
  // 기다리는 동안에는 퐁 소리를 내지 않는다. 입질 소리와 헷갈리면 속이는 신호가 되기 때문이다(1-8)
  function ambience(dt) {
    if (!audio.ambient) return;
    let level = 0;
    if (character.place === 'yard') {
      const r = Math.hypot((character.pos.x - POND.x) / POND.rx, (character.pos.z - POND.z) / POND.rz); // 물가에서 1
      level = phase !== 'idle' && phase !== 'walk' ? 1 : Math.max(0, Math.min(1, 1 - (r - 1.2) / 2.2));
    }
    const ducked = phase === 'wait' && hushedAt !== null;
    audio.ambient(level, ducked);
    if (level > 0.4 && phase === 'idle') {
      plopWait -= dt;
      if (plopWait <= 0) { audio.play('plop', { gain: level, pitch: 0.85 + Math.random() * 0.3 }); plopWait = 2.5 + Math.random() * 4; }
    }
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
    get hushedAt() { return hushedAt; },
    get fx() { return pondView.fx; }, // 연출 상태 (자동 시험이 읽는다)
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
    // 화면을 누른 때를 기억해 둔다. 판정은 이 때로 한다(press). 두 손가락 확대가 아니면 곧 판정을 매듭짓고(commitPress),
    // 확대이면 버린다(cancelPress). 던지는 중에는 누름을 흘려보낸다. 결과를 보이는 중에는 조금 지나 누르면 넘어간다
    press() { pressed = phase === 'wait' || phase === 'bite' || phase === 'result' ? { t, phase } : null; },
    cancelPress() { pressed = null; },
    commitPress() {
      const p = pressed;
      pressed = null;
      if (!p) return;
      if ((phase === 'wait' || phase === 'bite') && p.phase !== 'result') finish(judge(plan, p.t));
      else if (phase === 'result' && p.phase === 'result' && p.t >= SKIP_AFTER) endResult();
    },
    get pressPending() { return pressed !== null; },
    get ambience() { return audio.ambience ?? null; }, // 바탕 물소리 상태 (자동 시험이 읽는다)
    // 기다리지 않고 바로 당긴다 (마우스, 자동 시험)
    pull() { this.press(); this.commitPress(); },
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
        case 'bite': return '찌가 잠겼습니다. 화면을 눌러 낚아채세요.';
        default: return nearWater() ? '물을 누르면 찌를 던집니다. 잡은 물고기는 낚시 기록에 남습니다.' : null;
      }
    },
    // 한 화면만큼 진행한다. 바탕 소리는 이번 화면의 상태(잠잠해졌는지 등)가 정해진 뒤에 맞춘다
    update(dt) { advance(dt); ambience(dt); },
  };

  function advance(dt) {
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
        // 진짜로 물기 직전에는 잠잠해진다. 마지막 건드림과 무는 때 사이는 규칙이 띄워 둔다(fishing.js HUSH_GAP)
        if (hushedAt === null && t >= plan.bite - HUSH) { hushedAt = t; pondView.hush(); }
        // 찌가 물에 닿은 때부터 재므로 시간을 되돌리지 않고 이어 간다
        if (t >= plan.bite) { phase = 'bite'; pondView.bite(); audio.play('bite'); buzz([70, 30, 70]); onChange(); }
        return;
      }
      // 누른 것을 판정하기 전(두 손가락인지 보는 잠깐)에는 늦었다고 하지 않는다. 판정은 누른 때로 한다
      if (phase === 'bite') { if (!pressed && t > plan.bite + plan.window) finish('late'); return; }
      if (phase === 'result' && t >= resultTime) endResult();
  }
}
