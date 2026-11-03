// All sounds are synthesized with WebAudio - no audio files needed.
class SfxEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.muted = false;
    this.engine = null;
  }

  // Must be called from a user gesture (mobile browsers block audio until then).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolume(volume, muted) {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume();
  }

  applyVolume() {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.9;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const o1 = c.createOscillator();
    o1.type = 'sawtooth';
    const o2 = c.createOscillator();
    o2.type = 'square';
    const sub = c.createGain();
    sub.gain.value = 0.45;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    const g = c.createGain();
    g.gain.value = 0;
    o1.connect(f);
    o2.connect(sub).connect(f);
    f.connect(g).connect(this.master);
    o1.frequency.value = 45;
    o2.frequency.value = 22;
    o1.start();
    o2.start();

    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.9;
    const sg = c.createGain();
    sg.gain.value = 0;
    src.connect(bp).connect(sg).connect(this.master);
    src.start();
    this.engine = { o1, o2, f, g, src, sg };
  }

  updateEngine(rpm, throttle, speedFrac, skid, active = true) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const freq = 42 + rpm * 125 + speedFrac * 25;
    e.o1.frequency.setTargetAtTime(freq, t, 0.03);
    e.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.03);
    e.f.frequency.setTargetAtTime(450 + rpm * 1700 + throttle * 700, t, 0.05);
    e.g.gain.setTargetAtTime(active ? 0.05 + throttle * 0.06 + speedFrac * 0.03 : 0, t, 0.06);
    e.sg.gain.setTargetAtTime(active ? Math.min(0.13, skid * 0.13) : 0, t, 0.05);
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, 0.05);
    e.sg.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => {
      try {
        e.o1.stop();
        e.o2.stop();
        e.src.stop();
      } catch {
        /* already stopped */
      }
    }, 400);
  }

  tone(freq, dur, { type = 'sine', vol = 0.25, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, freq, vol) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  light() {
    this.tone(520, 0.18, { vol: 0.22 });
  }

  go() {
    this.tone(880, 0.5, { vol: 0.28 });
  }

  thud(strength) {
    const s = Math.min(1, strength / 500);
    this.noiseBurst(0.18 + s * 0.2, 220 + s * 300, 0.25 + s * 0.45);
  }

  bump(strength) {
    const s = Math.min(1, strength / 400);
    this.noiseBurst(0.1 + s * 0.1, 600, 0.15 + s * 0.3);
  }

  click() {
    this.tone(700, 0.06, { type: 'triangle', vol: 0.15 });
  }

  coin() {
    this.tone(988, 0.12, { type: 'square', vol: 0.08 });
    this.tone(1319, 0.3, { type: 'square', vol: 0.08, delay: 0.09 });
  }

  fanfare() {
    [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.35, { type: 'triangle', vol: 0.18, delay: k * 0.12 }));
  }

  whoosh() {
    this.tone(300, 0.25, { type: 'sine', vol: 0.12, slide: 2.2 });
  }

  // brake warning: two short high beeps
  warn() {
    this.tone(1320, 0.07, { type: 'square', vol: 0.07 });
    this.tone(1320, 0.07, { type: 'square', vol: 0.07, delay: 0.11 });
  }

  drift() {
    this.tone(660, 0.18, { type: 'triangle', vol: 0.14, slide: 1.6 });
  }
}

export const sfx = new SfxEngine();
