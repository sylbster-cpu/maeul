// 낚시 놀이의 흐름. 물(연못이나 바다)을 누르면 물가로 걸어가 찌를 던지고, 찌가 완전히 잠길 때 누르면 낚는다.
// 흐름: idle → walk(물가로) → cast(던짐) → wait(다가오고 건드림) → bite(잠김) → result → idle
// 기록은 fishing.js 의 명령으로만 바꾸고, 집 저장과 다른 열쇠에 둔다.
import {
  FISH, WATERS, HUSH, inWater, waterAt, rollFish, rollSize, planBite, judge, kstDay, todaysFish, catchWeight, sizeFeel, fishTier,
  createFishingStore, createFishingSaver, FISHING_KEY,
} from './fishing.js';
import { POND, shoreZ } from './parts.js';

const CAST_TIME = 0.7; // 뒤로 젖히는 예비동작(0.26초)과 날아가는 시간. fishing-view.js 와 같다
const RESULT_TIME = 0.8; // 놓쳤을 때 결과를 보이는 시간
const CATCH_TIME = 2.0; // 낚은 물고기를 들어 보이는 시간. 무거운 물고기는 조금 더 길게 본다
const SKIP_AFTER = 0.5; // 결과를 보이는 중 이만큼 지나 누르면 바로 넘어간다
// 누르고 버티기(2026-11-22 사용자 결정, GPT 제안): 낚아챈 뒤 화면을 누르고 있으면 REEL_TIME 만에 끌어올리고,
// 손을 떼면 REEL_SLOW 배로 느려진다. 놓쳐도 실패하지 않는다. 큰 물고기일수록 오래 걸린다(무게는 시간)
const reelTime = (weight) => 0.6 + 0.9 * weight; // 송사리 약 0.65초 ~ 메기 약 1.5초
const REEL_SLOW = 0.35;
// 드문 정도(fishing.js fishTier)에 따른 종소리 높이. 흔함 1.0, 드묾 1.26(장3도), 아주 드묾 1.5(완전5도)
const CHIME_PITCH = [1, 1.26, 1.5];
const REACH = 3.2; // 찌를 던지는 가장 먼 거리
const SHORE = 1.4; // 물가에서 이만큼 안에 서 있어야 던질 수 있다

// 받침이 있는지
const hasBatchim = (word) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
};
const objectParticle = (word) => (hasBatchim(word) ? '을' : '를'); // 을/를
const subjectParticle = (word) => (hasBatchim(word) ? '이' : '가'); // 이/가

export function createFishing({ character, pondView, ui, audio, haptics = null, storage, catchCard = null, random: rng = Math.random, now = Date.now, onChange = () => {} }) {
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
  let reel = null; // 끌어올리는 중 { p, time, fish, size, weight, label, note, tug }
  let reelHolding = false; // 화면을 누르고 있는지 (input.js 가 알려 준다)
  let wasNear = false;
  let stand = null; // 던진 자리. 걸어서 떠나기 전까지 카메라가 물가와 찌 사이를 가까이 본다
  let resultTime = RESULT_TIME;
  // 진동(src/haptics.js). 아이폰은 횟수(ticks)로만 나눈다. 낚아챈 순간은 손가락이 닿을 때라 아이폰에서는 뗄 때 울린다
  const buzz = (pattern, ticks = 1) => {
    if (haptics) { haptics.pulse(pattern, { ticks }); return; }
    try { navigator.vibrate?.(pattern); } catch { /* 진동이 없는 기기 */ }
  };
  let last = null; // 마지막 결과 (자동 시험이 읽는다)

  function setPhase(next) { phase = next; t = 0; onChange(); }
  // 오늘 잘 잡히는 물고기를 알리는 문구(물마다 하나). 아직 잡아 보지 못한 물고기는 이름을 밝히지 않는다(기록 창과 같다)
  // 오늘 잘 잡히는 물고기의 이름. 아직 잡아 보지 못했으면 이름 대신 '아직 잡아 보지 못한 물고기'
  function todayLabel(w = 'pond') {
    const id = todaysFish(kstDay(now()), w);
    return store.state.log[id] ? FISH[id].label : '아직 잡아 보지 못한 물고기';
  }
  function todayText(w = 'pond') {
    const label = todayLabel(w);
    return `오늘 ${WATERS[w].label}에서는 ${label}${subjectParticle(label)} 잘 잡힙니다.`;
  }
  // 가까이 있는 물('pond', 'sea'). 물가에서 SHORE 안에 서 있지 않으면 null
  const nearWater = () => (character.place === 'yard' ? waterAt(character.pos.x, character.pos.z, SHORE) : null);
  let water = 'pond'; // 지금 낚시하는 물

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
    // 물가에서 너무 가까우면 물 안쪽으로 옮긴다. 연못은 가운데 쪽, 바다는 남쪽(먼바다 쪽)
    for (let k = 0; k < 12 && waterAt(b.x, b.z, -0.45) !== water; k++) {
      if (water === 'sea') { b.z = Math.max(b.z, shoreZ(b.x)) + 0.3; continue; }
      b.x += (POND.x - b.x) * 0.2; b.z += (POND.z - b.z) * 0.2;
    }
    return b;
  }
  function cast() {
    const spot = bobberSpot();
    character.face(spot.x, spot.z);
    aim = spot;
    const fish = rollFish(random, todaysFish(kstDay(now()), water), water);
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
    const here = nearWater();
    if (!here) {
      ui.toast(`${water === 'sea' ? '바닷가' : '연못가'}로 갈 수 없습니다. 가구가 길을 막고 있는지 보세요`, 'error');
      audio.play('error');
      setPhase('idle');
      return;
    }
    water = here;
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
      // 낚아챈 바로 그 순간에 신호를 몰아 준다: 멈춤·흔들림·물보라·낚싯대(pondView), 묵직한 소리, 진동.
      // 크기는 무게감에 맞춘다. 송사리는 가볍게, 메기는 크게. 기록은 지금 남기고(이미 낚았다), 카드는 다 끌어올린 뒤에 띄운다
      pondView.hook(fish, size, weight);
      audio.play('hook', { pitch: 1.4 - 0.65 * weight, gain: 0.65 + 0.55 * weight });
      buzz(weight < 0.35 ? [25] : weight < 0.7 ? [35, 30, 35] : [55, 35, 70], weight < 0.35 ? 1 : weight < 0.7 ? 2 : 3);
      // 가장 드문 물고기(메기·감성돔)를 처음 낚았을 때만 카드를 띄울 때 주변을 약하게 어둡게 하고 이름을 강조한다(2026-11-23 사용자 결정)
      const tier = fishTier(fish);
      reel = { p: 0, time: reelTime(weight), fish, size, weight, label, note, tug: 0.25, tier, rareFirst: tier === 2 && !was };
      setPhase('reel');
      return;
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
    let level = 0, surf = 0;
    if (character.place === 'yard') {
      const fishing = phase !== 'idle' && phase !== 'walk';
      const r = Math.hypot((character.pos.x - POND.x) / POND.rx, (character.pos.z - POND.z) / POND.rz); // 물가에서 1
      level = fishing && water === 'pond' ? 1 : Math.max(0, Math.min(1, 1 - (r - 1.2) / 2.2));
      // 파도 소리는 물가선에 가까울수록 크다. 마당 한가운데까지 아주 작게 들린다
      const d = shoreZ(character.pos.x) - character.pos.z;
      surf = fishing && water === 'sea' ? 1 : Math.max(0, Math.min(1, 1 - (d - 0.8) / 9));
    }
    const ducked = phase === 'wait' && hushedAt !== null;
    audio.ambient(level, ducked && water === 'pond');
    audio.surf?.(surf, ducked && water === 'sea');
    if (level > 0.4 && phase === 'idle') {
      plopWait -= dt;
      if (plopWait <= 0) { audio.play('plop', { gain: level, pitch: 0.85 + Math.random() * 0.3 }); plopWait = 2.5 + Math.random() * 4; }
    }
  }

  // 다 끌어올렸다: 물고기가 솟아 머리 위에 오고, 화면 가운데 카드로 크게 알린다. 가락은 물고기가 손에 떨어질 때 울린다
  function landFish() {
    const r = reel;
    reel = null;
    if (catchCard) catchCard.show({ label: r.label, size: r.size, note: r.note, rare: r.rareFirst });
    else ui.toast(`${r.label}${objectParticle(r.label)} 낚았습니다! ${r.size}cm. ${r.note}`);
    // 손에 떨어질 때 두 소리: 크기는 낮고 묵직한 철썩(클수록 낮고 크게), 드문 정도는 높은 종소리(드물수록 높게)
    const feel = sizeFeel(r.size);
    const landing = { tier: r.tier, rareFirst: r.rareFirst, land: { pitch: 1.15 - 0.5 * feel, gain: 0.6 + 0.7 * feel }, chime: { pitch: CHIME_PITCH[r.tier] } };
    last = { ...last, landing };
    pondView.leapOut(r.fish, r.size, r.weight, () => { audio.play('land', landing.land); audio.play('chime', landing.chime); });
    resultTime = CATCH_TIME + 0.3 * r.weight;
    setPhase('result');
  }

  // 결과 보이기를 끝내고 다음 던지기를 기다린다. 낚싯대는 내려놓고 카메라는 그대로 둔다
  function endResult() { pondView.reset(); catchCard?.hide(); setPhase('idle'); }

  return {
    store,
    todayText,
    todayLabel,
    loadProblem,
    get phase() { return phase; },
    get water() { return water; }, // 지금(또는 마지막으로) 낚시한 물 (자동 시험이 읽는다)
    get last() { return last; },
    get plan() { return plan; },
    get nibbled() { return nibbles; },
    get hushedAt() { return hushedAt; },
    get fx() { return pondView.fx; }, // 연출 상태 (자동 시험이 읽는다)
    get elapsed() { return t; }, // 지금 단계에 들어선 뒤 흐른 게임 시간(초). 찌가 물에 닿은 뒤로는 입질 계획과 같은 시계다
    // 자동 시험이 물고기와 입질을 정해 둘 때 쓴다
    setRandom(fn) { random = fn; },
    // 낚시를 하고 있으면 화면 누름은 줄을 당기는 데 쓴다 (걷지 않는다)
    get holding() { return phase === 'cast' || phase === 'wait' || phase === 'bite' || phase === 'reel' || phase === 'result'; },
    // 화면을 누르고 있는지. 끌어올리는 동안 누르고 있으면 빨리, 떼면 느리게 끌어올린다
    setHolding(value) { const v = !!value; if (v !== reelHolding) { reelHolding = v; if (phase === 'reel') onChange(); } },
    get reeling() { return phase === 'reel' && reel ? { p: reel.p, holding: reelHolding, time: reel.time } : null; },
    isWater: (point) => character.place === 'yard' && inWater(point.x, point.z, 0.15),
    // 물을 눌렀을 때. 물가로 걸어간 뒤 던진다
    start(point) {
      if (phase !== 'idle' && phase !== 'walk') return;
      aim = { x: point.x, z: point.z };
      water = waterAt(point.x, point.z, 0.15) || water;
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
    get surf() { return audio.surfing ?? null; }, // 바닷가 파도 소리 상태 (자동 시험이 읽는다)
    // 기다리지 않고 바로 당긴다 (마우스, 자동 시험)
    pull() { this.press(); this.commitPress(); },
    cancel() {
      stand = null;
      reel = null;
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
        case 'walk': return `${water === 'sea' ? '바닷가' : '연못가'}로 걸어가는 중입니다.`;
        case 'cast': case 'wait': return '찌가 흔들릴 때는 기다리고, 완전히 잠기면 화면을 누릅니다.';
        case 'bite': return '찌가 잠겼습니다. 화면을 눌러 낚아채세요.';
        case 'reel': return reelHolding ? '그대로 누르고 있으면 끌어올립니다.' : '화면을 누르고 있으면 더 빨리 끌어올립니다.';
        // 처음 온 사람에게는 기록이 남는다는 것을, 한 마리라도 잡은 뒤에는 오늘 잘 잡히는 물고기를 알린다
        default: return !nearWater() ? null
          : Object.keys(store.state.log).length ? `물을 누르면 찌를 던집니다. ${todayText(nearWater())}`
          : '물을 누르면 찌를 던집니다. 잡은 물고기는 낚시 기록에 남습니다.';
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
        if (t >= plan.bite) { phase = 'bite'; pondView.bite(); audio.play('bite'); buzz([70, 30, 70], 2); onChange(); }
        return;
      }
      // 누른 것을 판정하기 전(두 손가락인지 보는 잠깐)에는 늦었다고 하지 않는다. 판정은 누른 때로 한다
      if (phase === 'bite') { if (!pressed && t > plan.bite + plan.window) finish('late'); return; }
      if (phase === 'reel') {
        // 누르고 있으면 제 속도로, 떼면 느리게. 물고기는 가끔 홱 당긴다(누르고 있을 때 더 잦고, 진동도 함께)
        reel.p = Math.min(1, reel.p + (dt * (reelHolding ? 1 : REEL_SLOW)) / reel.time);
        pondView.reel(reel.p, reelHolding);
        reel.tug -= dt;
        if (reel.tug <= 0) {
          reel.tug = (reelHolding ? 0.22 : 0.45) + Math.random() * 0.15;
          pondView.tug();
          audio.play('reel', { pitch: reelHolding ? 1.1 : 0.85, gain: reelHolding ? 1 : 0.6 });
          if (reelHolding) buzz(14);
        }
        if (reel.p >= 1) landFish();
        return;
      }
      if (phase === 'result' && t >= resultTime) endResult();
  }
}
