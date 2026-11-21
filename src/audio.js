// 놓고 치울 때의 짧은 소리. 첫 조작 뒤에만 소리가 난다 (브라우저 규칙).
export function createAudio() {
  let ctx = null;
  let muted = false;
  const tones = {
    place: [540, 330, 0.09, 'triangle', 0.16],
    remove: [240, 150, 0.1, 'triangle', 0.14],
    error: [150, 120, 0.12, 'square', 0.05],
    step: [660, 880, 0.08, 'sine', 0.08],
    sit: [420, 300, 0.1, 'sine', 0.1],
    // 낚시. 찌를 건드릴 때(nibble)와 완전히 잠길 때(bite)를 귀로도 분명히 가른다
    cast: [480, 760, 0.12, 'sine', 0.08],
    splash: [320, 140, 0.12, 'triangle', 0.1],
    nibble: [900, 840, 0.05, 'sine', 0.06],
    bite: [760, 190, 0.26, 'triangle', 0.24],
    catch: [520, 1100, 0.24, 'triangle', 0.16],
    miss: [330, 210, 0.2, 'sine', 0.1],
  };
  return {
    get muted() { return muted; },
    setMuted(value) { muted = value; },
    unlock() {
      if (ctx) return;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
    },
    play(name) {
      if (muted || !ctx || !tones[name]) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const [from, to, len, type, gainValue] = tones[name];
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(to, now + len);
      gain.gain.setValueAtTime(gainValue, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + len + 0.02);
    },
  };
}
