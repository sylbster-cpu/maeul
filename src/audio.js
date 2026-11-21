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
  catch: [{ noise: 900, len: 0.25, gain: 0.25 }, tone(523, 523, 0.1, 'triangle', 0.16, 0.08),
    tone(659, 659, 0.1, 'triangle', 0.16, 0.18), tone(784, 1046, 0.26, 'triangle', 0.18, 0.28)],
  miss: [tone(330, 200, 0.22, 'sine', 0.12)],
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
  function part(p, now) {
    const start = now + (p.at || 0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(p.gain, start);
    gain.gain.exponentialRampToValueAtTime(0.0008, start + p.len);
    let source;
    if (p.noise) {
      source = ctx.createBufferSource();
      source.buffer = noiseBuffer();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(p.noise, start);
      filter.Q.value = 0.9;
      source.connect(filter).connect(gain);
    } else {
      source = ctx.createOscillator();
      source.type = p.type;
      source.frequency.setValueAtTime(p.from, start);
      source.frequency.exponentialRampToValueAtTime(p.to, start + p.len);
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
    play(name) {
      if (muted || !ctx || !SOUNDS[name]) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      for (const p of SOUNDS[name]) part(p, now);
    },
  };
}
