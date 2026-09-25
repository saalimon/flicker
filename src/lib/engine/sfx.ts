/*
 * Tiny WebAudio synth, ported from Flicker. `enabled()` is read on every sound
 * so the mute toggle applies immediately.
 */

export type Sfx = ReturnType<typeof createSfx>;

export function createSfx(enabled: () => boolean) {
  let ac: AudioContext | null = null;

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        try {
          ac = new AC();
        } catch {
          ac = null;
        }
      }
    }
    if (ac && ac.state === "suspended") void ac.resume();
    return ac;
  }

  function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.12, when = 0, slideTo?: number) {
    if (!enabled()) return;
    const a = ensure();
    if (!a) return;
    const t0 = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  return {
    unlock: ensure,
    pop(combo: number) {
      const f = 440 * Math.pow(2, Math.min(combo, 24) / 24);
      tone(f, 0.13, "triangle", 0.17, 0, f * 1.6);
    },
    gold() { [660, 880, 1320].forEach((f, i) => tone(f, 0.13, "sine", 0.13, i * 0.07)); },
    hazard() { tone(170, 0.38, "square", 0.1, 0, 70); },
    miss() { tone(320, 0.14, "sine", 0.05, 0, 220); },
    level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, "triangle", 0.12, i * 0.08)); },
    badge() { tone(988, 0.1, "sine", 0.12); tone(1319, 0.22, "sine", 0.12, 0.09); },
    tick() { tone(1250, 0.05, "square", 0.04); },
    count(go: boolean) { tone(go ? 880 : 440, go ? 0.32 : 0.12, "triangle", 0.15); },
    end() { [784, 659, 523, 392].forEach((f, i) => tone(f, 0.2, "triangle", 0.11, i * 0.11)); },
  };
}
