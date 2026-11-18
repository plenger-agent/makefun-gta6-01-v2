// audio.js — every sound in Azahar is synthesised live with WebAudio: the
// engine's growl, pistol cracks, punches, sirens that swell as the Patrulla
// closes in, till-bells for cash, and three radio stations sequenced note by
// note (salsa, synth, rumba). No audio files exist in this game.
import { RADIO_STATIONS } from './config.js';
import { clamp } from './rng.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.radioIdx = 0;
    this.seqStep = 0;
    this.seqNext = 0;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass, gain follows the throttle.
    this.engineOsc = ctx.createOscillator(); this.engineOsc.type = 'sawtooth';
    this.engineOsc2 = ctx.createOscillator(); this.engineOsc2.type = 'square';
    this.engineFilter = ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 300;
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter); this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();

    // Siren: a triangle whose pitch wails by LFO, gain set by police distance.
    this.sirenOsc = ctx.createOscillator(); this.sirenOsc.type = 'triangle'; this.sirenOsc.frequency.value = 800;
    this.sirenLfo = ctx.createOscillator(); this.sirenLfo.frequency.value = 0.7;
    this.sirenLfoGain = ctx.createGain(); this.sirenLfoGain.gain.value = 190;
    this.sirenLfo.connect(this.sirenLfoGain); this.sirenLfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain(); this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
    this.sirenOsc.start(); this.sirenLfo.start();

    // Radio bus.
    this.radioGain = ctx.createGain(); this.radioGain.gain.value = 0.16;
    this.radioGain.connect(this.master);
    this.seqNext = ctx.currentTime + 0.1;

    this.started = true;
  }

  setEngine(norm, driving) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const f = 55 + norm * 165;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5 + 2, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(240 + norm * 900, t, 0.08);
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + norm * 0.075 : 0, t, 0.09);
  }

  setSiren(nearestDist) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const g = nearestDist === null ? 0 : clamp(1 - nearestDist / 130, 0, 1) * 0.05;
    this.sirenGain.gain.setTargetAtTime(g, t, 0.15);
  }

  noiseBurst(dur, filterFreq, gain, type = 'bandpass') {
    if (!this.started) return;
    const ctx = this.ctx;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  blip(freq, dur, gain, type = 'square', slideTo = null, dest = null) {
    if (!this.started) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  shot() { this.noiseBurst(0.16, 900, 0.5, 'lowpass'); this.blip(160, 0.1, 0.3, 'sawtooth', 40); }
  enemyShot() { this.noiseBurst(0.12, 1200, 0.2, 'lowpass'); }
  punch() { this.noiseBurst(0.09, 300, 0.4, 'lowpass'); }
  thud() { this.noiseBurst(0.2, 180, 0.5, 'lowpass'); }
  crash() { this.noiseBurst(0.45, 500, 0.55, 'lowpass'); this.blip(90, 0.3, 0.3, 'sawtooth', 35); }
  honk() { this.blip(370, 0.16, 0.12, 'square'); this.blip(466, 0.16, 0.1, 'square'); }
  cash() { this.blip(1320, 0.09, 0.16, 'square'); setTimeout(() => this.blip(1760, 0.16, 0.16, 'square'), 70); }
  sting(ok = true) {
    if (!this.started) return;
    const seq = ok ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 0.14, 'triangle'), i * 110));
  }
  click() { this.blip(880, 0.05, 0.08, 'square'); }
  pickup() { this.blip(740, 0.08, 0.12, 'triangle', 1180); }
  wantedUp() { this.blip(196, 0.16, 0.2, 'sawtooth'); setTimeout(() => this.blip(196, 0.2, 0.2, 'sawtooth'), 130); }

  cycleRadio() {
    this.radioIdx = (this.radioIdx + 1) % RADIO_STATIONS.length;
    return RADIO_STATIONS[this.radioIdx];
  }

  // ---- the radio sequencer ---------------------------------------------------
  // A step clock over the audio timeline; each station is a pattern of bass,
  // chord and lead notes drawn from a scale. Cheerful, tinny, very 1989.
  update() {
    if (!this.started) return;
    const station = RADIO_STATIONS[this.radioIdx];
    if (station.style === 'off') return;
    const ctx = this.ctx;
    const spb = station.style === 'salsa' ? 0.21 : station.style === 'rumba' ? 0.24 : 0.19;
    while (this.seqNext < ctx.currentTime + 0.18) {
      this.playStep(station.style, this.seqStep, this.seqNext);
      this.seqStep = (this.seqStep + 1) % 32;
      this.seqNext += spb;
    }
  }

  playStep(style, step, when) {
    const ctx = this.ctx;
    const note = (freq, dur, gain, type) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(g); g.connect(this.radioGain);
      o.start(when); o.stop(when + dur + 0.02);
    };
    const N = { A2: 110, C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196, A3: 220, B3: 246.9, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, E5: 659.3 };
    if (style === 'salsa') {
      const bass = [N.A2, 0, N.A2, 0, N.E3, 0, N.A2, 0, N.F3, 0, N.F3, 0, N.E3, 0, N.E3, 0];
      const chord = [N.C4, N.E4, N.A4];
      if (bass[step % 16]) note(bass[step % 16], 0.2, 0.5, 'triangle');
      if (step % 4 === 2) for (const f of chord) note(f, 0.16, 0.13, 'square');
      if (step % 8 === 6) note([N.E5, N.C5, N.A4][(step / 8 | 0) % 3], 0.18, 0.12, 'square');
    } else if (style === 'synth') {
      const arp = [N.A2 * 2, N.C4, N.E4, N.A4, N.C5, N.A4, N.E4, N.C4];
      note(arp[step % 8], 0.16, 0.16, 'sawtooth');
      if (step % 16 === 0) note(N.A2, 0.8, 0.4, 'triangle');
      if (step % 16 === 8) note(N.F3, 0.8, 0.35, 'triangle');
    } else { // rumba
      const pluck = [N.E3, 0, N.G3, N.A3, 0, N.G3, N.E3, 0, N.D3, 0, N.E3, N.G3, 0, N.A3, 0, 0];
      if (pluck[step % 16]) note(pluck[step % 16], 0.22, 0.3, 'triangle');
      if (step % 2 === 0) { // shaker tick
        const len = (0.03 * ctx.sampleRate) | 0;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const s = ctx.createBufferSource(); s.buffer = buf;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
        const g = ctx.createGain(); g.gain.value = 0.05;
        s.connect(f); f.connect(g); g.connect(this.radioGain);
        s.start(when);
      }
    }
  }
}
