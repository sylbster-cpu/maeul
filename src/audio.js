// 놓고 치울 때의 짧은 소리와 낚시 소리. 첫 조작 뒤에만 소리가 난다 (브라우저 규칙).
// 소리 하나는 여러 조각으로 된다. 조각은 음([시작 높이, 끝 높이, 길이, 파형, 크기, 늦춤])이거나
// 물소리({ noise: 걸러 낼 높이, len: 길이, gain: 크기, at: 늦춤 })다
const tone = (from, to, len, type, gain, at = 0) => ({ from, to, len, type, gain, at });
const SOUNDS = {
  place: [tone(540, 330, 0.09, 'triangle', 0.16)],
  remove: [tone(240, 150, 0.1, 'triangle', 0.14)],
  error: [tone(150, 120, 0.12, 'square', 0.05)],
  step: [tone(660, 880, 0.08, 'sine', 0.08)],
  sit: [tone(420, 300, 0.1, 'sine', 0.1)],
  // 낚시. 찌를 건드릴 때(nibble, 톡)와 완전히 잠길 때(bite, 첨벙)를 귀로도 분명히 가른다
  cast: [{ noise: 1800, len: 0.22, gain: 0.1 }, tone(420, 760, 0.16, 'sine', 0.06)],
  splash: [{ noise: 1000, len: 0.16, gain: 0.18 }],
  nibble: [tone(980, 620, 0.07, 'sine', 0.16), { noise: 2600, len: 0.05, gain: 0.08 }],
  bite: [{ noise: 650, len: 0.4, gain: 0.42 }, tone(320, 110, 0.3, 'triangle', 0.2)],
  // 낚아챈 바로 그 순간: 묵직한 '툭'과 물이 찢기는 소리. 물고기가 클수록 낮고 크게 낸다(play 의 pitch, gain)
  hook: [tone(210, 62, 0.16, 'sine', 0.42), { noise: 760, len: 0.22, gain: 0.3 }, { noise: 2400, len: 0.06, gain: 0.12 }],
  // 물고기가 머리 위 손에 떨어질 때: 철썩 한 번과 짧은 가락
  catch: [tone(300, 170, 0.07, 'triangle', 0.16), tone(523, 523, 0.1, 'triangle', 0.15, 0.06),
    tone(659, 659, 0.1, 'triangle', 0.15, 0.16), tone(784, 1046, 0.26, 'triangle', 0.17, 0.26)],
  // 놓쳤을 때: 다그치지 않게 작고 부드럽게
  miss: [tone(392, 294, 0.2, 'sine', 0.07)],
  // 연못가의 작은 퐁 소리(바탕 소리). 입질 소리(nibble)보다 낮고 작고 둥글다. 기다리는 동안에는 내지 않는다
  plop: [tone(420, 240, 0.09, 'sine', 0.035), { noise: 700, len: 0.07, gain: 0.02 }],
  // 집을 키웠을 때: 쿵 내려앉는 소리 뒤에 올라가는 가락과 반짝이는 소리. 드문 큰일이라 다른 소리보다 길다
  upgrade: [tone(160, 80, 0.2, 'sine', 0.3), { noise: 500, len: 0.3, gain: 0.12 }, tone(392, 392, 0.12, 'triangle', 0.14, 0.12),
    tone(523, 523, 0.12, 'triangle', 0.14, 0.24), tone(659, 659, 0.12, 'triangle', 0.15, 0.36), tone(784, 1568, 0.4, 'sine', 0.12, 0.48)],
};

export function createAudio() {
  let ctx = null;
  let noise = null;
  let muted = false;
  // 바탕 물소리: 낮게 거른 잡음을 이어 틀고, 천천히 크기를 출렁이게 한다. 크기는 ambient() 로 정한다
  let bed = null;
  let bedTarget = -1, bedDucked = false, bedLevel = 0;
  function ensureBed() {
    if (bed || !ctx) return bed;
    const len = Math.floor(ctx.sampleRate * 3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let v = 0;
    for (let i = 0; i < len; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.015; d[i] = v * 7; }
    const fade = Math.floor(ctx.sampleRate * 0.05); // 이어 틀 때 끊기는 소리가 나지 않게 양 끝을 줄인다
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] *= k; d[len - 1 - i] *= k; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.17; // 물결이 밀려왔다 빠지는 박자
    const depth = ctx.createGain();
    depth.gain.value = 0;
    lfo.connect(depth).connect(gain.gain);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    lfo.start();
    bed = { gain, depth };
    return bed;
  }
  function noiseBuffer() {
    if (noise) return noise;
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }
  // pitch 는 높이를, loud 는 크기를 곱한다
  function part(p, now, pitch = 1, loud = 1) {
    const start = now + (p.at || 0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.6, p.gain * loud), start);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + p.len);
    let source;
    if (p.noise) {
      source = ctx.createBufferSource();
      source.buffer = noiseBuffer();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(p.noise * pitch, start);
      filter.Q.value = 0.9;
      source.connect(filter).connect(gain);
    } else {
      source = ctx.createOscillator();
      source.type = p.type;
      source.frequency.setValueAtTime(p.from * pitch, start);
      source.frequency.exponentialRampToValueAtTime(p.to * pitch, start + p.len);
      source.connect(gain);
    }
    gain.connect(ctx.destination);
    source.start(start);
    source.stop(start + p.len + 0.02);
  }
  return {
    get muted() { return muted; },
    setMuted(value) { muted = value; bedTarget = -1; },
    // 바탕 물소리의 크기(0~1). ducked 면 작게 줄인다(진짜로 물기 직전의 잠잠함). 첫 조작 전에는 소리가 나지 않는다
    ambient(level, ducked = false) {
      const quick = ducked !== bedDucked; // 잠잠해지고 풀리는 것은 빨리, 걸어서 멀어지고 가까워지는 것은 천천히
      bedLevel = level; bedDucked = ducked;
      if (!ctx) return;
      const target = muted ? 0 : level * 0.05 * (ducked ? 0.3 : 1);
      if (Math.abs(target - bedTarget) < 0.0005) return;
      bedTarget = target;
      if (target > 0 && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!ensureBed()) return;
      const now = ctx.currentTime;
      bed.gain.gain.setTargetAtTime(target, now, quick ? 0.06 : 0.35);
      bed.depth.gain.setTargetAtTime(target * 0.35, now, 0.35);
    },
    // 자동 시험이 읽는다
    get ambience() { return { level: bedLevel, ducked: bedDucked, target: Math.max(0, bedTarget) }; },
    unlock() {
      if (ctx) return;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    },
    // pitch: 높이를 곱한다(1 보다 작으면 낮게). gain: 크기를 곱한다
    play(name, { pitch = 1, gain = 1 } = {}) {
      if (muted || !ctx || !SOUNDS[name]) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      for (const p of SOUNDS[name]) part(p, now, pitch, gain);
    },
  };
}
