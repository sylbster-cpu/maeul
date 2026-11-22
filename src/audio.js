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
  miss: [tone(330, 200, 0.22, 'sine', 0.12)],
  // 집을 키웠을 때: 쿵 내려앉는 소리 뒤에 올라가는 가락과 반짝이는 소리. 드문 큰일이라 다른 소리보다 길다
  upgrade: [tone(160, 80, 0.2, 'sine', 0.3), { noise: 500, len: 0.3, gain: 0.12 }, tone(392, 392, 0.12, 'triangle', 0.14, 0.12),
    tone(523, 523, 0.12, 'triangle', 0.14, 0.24), tone(659, 659, 0.12, 'triangle', 0.15, 0.36), tone(784, 1568, 0.4, 'sine', 0.12, 0.48)],
};

export function createAudio() {
  let ctx = null;
  let noise = null;
  let muted = false;
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
    setMuted(value) { muted = value; },
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
