// Tiny synthesized sound effects. The AudioContext starts on the first tap.
import { getTrack } from './music-files.js';

let ac = null, master = null, noise = null, volume = 0.8;
const BASE_GAIN = 0.4;

// 0..1 from the settings screen
export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = BASE_GAIN * v;
}

export const audioRunning = () => !!ac && ac.state === 'running';

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = BASE_GAIN * volume;
    master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ac = null; }
}

function tone(type, f0, f1, vol, dur, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export function sfxLaser(f0 = 1500, f1 = 220, vol = 0.09, type = 'sawtooth') { tone(type, f0, f1, vol, 0.1); }

export function sfxBoom(size) {
  if (!ac) return;
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(1800 / (size * 0.2 + 1), t);
  f.frequency.exponentialRampToValueAtTime(80, t + 0.25 + size * 0.05);
  const dur = 0.3 + size * 0.06;
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.05);
}

// Hits as heard inside the ship. k: 0..1 strength.
function noiseBurst(t, type, f0, f1, q, vol, dur) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.6); s.stop(t + dur + 0.05);
}
// Shield takes it: an electric crackle with a falling hum
export function sfxShieldHit(k = 0.5) {
  if (!ac) return;
  const t = ac.currentTime, v = 0.12 + 0.2 * k;
  noiseBurst(t, 'bandpass', 3200, 900, 1.2, v, 0.16 + 0.1 * k);
  tone('sawtooth', 240 + Math.random() * 40, 70, v * 0.35, 0.22 + 0.12 * k);
}
// The hull is hit: a dull thump through the frame and a metallic ring
export function sfxHullHit(k = 0.5) {
  if (!ac) return;
  const t = ac.currentTime, v = 0.25 + 0.35 * k;
  noiseBurst(t, 'lowpass', 900, 60, 0.7, v, 0.3 + 0.25 * k);
  tone('sine', 95, 42, v * 0.7, 0.35 + 0.2 * k);
  const base = 380 + Math.random() * 160;
  for (const [m, a] of [[1, 0.09], [2.76, 0.06], [5.4, 0.035]]) tone('triangle', base * m, base * m * 0.97, a * (0.6 + k), 0.5 + 0.5 * k);
}
// Ramming a station or a rock: a heavy crunch with a scrape
export function sfxCrash(k = 0.7) {
  if (!ac) return;
  const t = ac.currentTime, v = 0.35 + 0.35 * k;
  noiseBurst(t, 'lowpass', 1400, 50, 0.8, v, 0.55 + 0.3 * k);
  noiseBurst(t + 0.05, 'bandpass', 2600, 1200, 3, v * 0.35, 0.45);
  tone('sine', 70, 32, v * 0.8, 0.5 + 0.3 * k);
  tone('triangle', 290, 270, 0.07 * (0.6 + k), 0.8);
}
// Damaged engine coughing: a short low burst of filtered noise
export function sfxSputter(vol = 1) {
  if (!ac) return;
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise;
  f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(90, t + 0.12);
  g.gain.setValueAtTime(0.32 * vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + 0.16);
  tone('square', 62, 44, 0.05 * vol, 0.1);
}
// Critical hull: a slow, insistent two-tone warning
export function sfxWarn() { tone('square', 980, 980, 0.07, 0.18); tone('square', 740, 740, 0.07, 0.24, 0.22); }
export function sfxAlarm() { for (let i = 0; i < 3; i++) tone('triangle', i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.12, 0.13, i * 0.16); }
export function sfxChime() { tone('sine', 660, 660, 0.12, 0.25); tone('sine', 990, 990, 0.1, 0.4, 0.14); }
export function sfxScoop() { tone('sine', 520, 1040, 0.1, 0.14); }
export function sfxCruise(on) { on ? tone('sawtooth', 90, 420, 0.07, 0.9) : tone('sawtooth', 420, 80, 0.06, 0.6); }
export function sfxTick() { tone('sine', 1320, 1320, 0.07, 0.08); }
export function sfxHyper() {
  tone('sawtooth', 60, 1800, 0.08, 2.2);
  tone('triangle', 120, 2400, 0.06, 2.4, 0.1);
}
export function sfxRail() { tone('sawtooth', 2600, 300, 0.06, 0.07); tone('square', 160, 90, 0.04, 0.06); }
export function sfxMissile() { tone('sawtooth', 160, 620, 0.07, 0.5); }
// Promotion fanfare in space-opera style (Björn wanted more pomp): an original dotted brass
// call in E flat over low brass and timpani, ending on a held chord. The ceremony (grand) adds a
// snare roll before it, a cymbal crash and strings under the last chord. Own compressor bus.
const FAN_NOTE = { Eb2: 77.78, Ab2: 103.83, Bb2: 116.54, Eb3: 155.56, G3: 196, Bb3: 233.08, D4: 293.66, Eb4: 311.13, F4: 349.23, G4: 392, Ab4: 415.3, Bb4: 466.16, C5: 523.25, Eb5: 622.25 };
export function sfxFanfare(grand = false) {
  if (!ac) return;
  const bus = ac.createDynamicsCompressor(), out = ac.createGain();
  bus.threshold.value = -16; bus.ratio.value = 4; bus.attack.value = 0.005; bus.release.value = 0.2;
  out.gain.value = 1.1; bus.connect(out); out.connect(master);
  const t0 = ac.currentTime + 0.05 + (grand ? 0.75 : 0);
  // brass: detuned saws through a lowpass that opens on the attack (the "blat" of a horn)
  const brass = (n, at, dur, v = 0.05, vib = dur > 0.4) => {
    const f = FAN_NOTE[n], t = t0 + at, g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.exponentialRampToValueAtTime(f * 7, t + 0.06); lp.frequency.exponentialRampToValueAtTime(f * 3.5, t + 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.035);
    g.gain.setValueAtTime(v * 0.8, t + Math.max(0.05, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    lp.connect(g); g.connect(bus);
    for (const d of [1, 1.006, 0.995]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * d;
      if (vib) {                                   // a little vibrato on held notes
        const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
        l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.2);
      }
      o.connect(lp); o.start(t); o.stop(t + dur + 0.2);
    }
  };
  const timp = (n, at, v = 0.32) => {
    const f = FAN_NOTE[n], t = t0 + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 1.04, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 1.4);
    hit(t, 'lowpass', 400, 120, 0.7, v * 0.6, 0.18);
  };
  const hit = (t, type, f0, f1, q, v, dur) => {
    const sN = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    sN.buffer = noise; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sN.connect(f); f.connect(g); g.connect(bus); sN.start(t, Math.random() * 0.5); sN.stop(t + dur + 0.05);
  };
  if (grand) {                                     // snare roll swelling into the call
    for (let k = 0; k < 16; k++) hit(t0 - 0.75 + k * 0.045, 'bandpass', 2600, 1900, 0.9, 0.03 + k * 0.006, 0.07);
    timp('Bb2', -0.75, 0.12); timp('Bb2', -0.4, 0.18);
  }
  // the call
  [['Eb4', 0, 0.26], ['Bb3', 0.28, 0.09], ['Eb4', 0.38, 0.2], ['G4', 0.6, 0.2], ['Bb4', 0.82, 0.55],
   ['C5', 1.4, 0.13], ['Bb4', 1.55, 0.13], ['G4', 1.7, 0.3], ['Ab4', 2.03, 0.25], ['F4', 2.3, 0.25],
   ['Bb4', 2.57, 0.45], ['G4', 3.05, 0.11], ['Bb4', 3.19, 0.11], ['Eb5', 3.33, grand ? 2.1 : 1.3]].forEach(([n, at, d]) => brass(n, at, d, 0.05));
  // horns underneath
  [['G3', 0, 0.8], ['G4', 0.82, 0.55], ['Ab4', 1.4, 0.28], ['Eb4', 1.7, 0.3], ['D4', 2.03, 0.5], ['F4', 2.57, 0.45]].forEach(([n, at, d]) => brass(n, at, d, 0.028));
  // low brass
  [['Eb3', 0, 0.78], ['Bb2', 0.82, 0.55], ['Ab2', 1.4, 0.6], ['Bb2', 2.03, 0.95], ['Bb2', 3.05, 0.26]].forEach(([n, at, d]) => brass(n, at, d, 0.04, false));
  timp('Eb2', 0); timp('Bb2', 0.82); timp('Bb2', 2.57, 0.26); timp('Bb2', 3.19, 0.2);
  // final chord with a suspension (Ab resolving to G) and the bass on E flat
  const fin = 3.33, hold = grand ? 2.1 : 1.3;
  brass('Bb4', fin, hold, 0.032); brass('Eb4', fin, hold, 0.03); brass('Eb3', fin, hold, 0.04, false); brass('Eb2', fin, hold, 0.035, false);
  brass('Ab4', fin, 0.4, 0.03); brass('G4', fin + 0.42, hold - 0.42, 0.03);
  timp('Eb2', fin, 0.4); timp('Eb2', fin + 0.18, 0.2);
  if (grand) {
    hit(t0 + fin, 'highpass', 6000, 3500, 0.5, 0.16, 2.6);       // cymbal crash
    hit(t0 + fin, 'bandpass', 9000, 7000, 0.7, 0.06, 3.0);
    for (const [n, d] of [['Eb4', 1], ['G4', 1.003], ['Bb4', 0.997], ['Eb5', 1.002]]) {   // strings
      const t = t0 + fin, o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = FAN_NOTE[n] * d; lp.type = 'lowpass'; lp.frequency.value = 2200;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.9);
      o.connect(lp); lp.connect(g); g.connect(bus); o.start(t); o.stop(t + hold + 1);
    }
  }
}
export function sfxClick() { tone('square', 1200, 900, 0.04, 0.04); }
export function sfxDeny() { tone('square', 220, 180, 0.06, 0.12); }

// Hangar ambience while docked: a low machine drone and the hiss of air vents
let hum = null;
const HUM_GAIN = 0.22;
function duckHum(v) {
  if (!hum) return;
  const g = hum.out.gain, t = ac.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(0.0001, g.value), t);
  g.exponentialRampToValueAtTime(v, t + 1);
}
export function startHum() {
  if (!ac || hum) return;
  const t = ac.currentTime, out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(music ? 0.03 : HUM_GAIN, t + 2.5);
  out.connect(master);
  const low = ac.createBiquadFilter();
  low.type = 'lowpass'; low.frequency.value = 220;
  low.connect(out);
  const nodes = [];
  for (const [f, v] of [[55, 0.25], [55.4, 0.2], [110.3, 0.07]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; g.gain.value = v;
    o.connect(g); g.connect(low); o.start(t);
    nodes.push(o);
  }
  // Air: filtered noise, slowly breathing
  const s = ac.createBufferSource(), bp = ac.createBiquadFilter(), ng = ac.createGain();
  s.buffer = noise; s.loop = true;
  bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
  ng.gain.value = 0.12;
  const lfo = ac.createOscillator(), lg = ac.createGain();
  lfo.frequency.value = 0.12; lg.gain.value = 0.06;
  lfo.connect(lg); lg.connect(ng.gain);
  s.connect(bp); bp.connect(ng); ng.connect(out);
  s.start(t); lfo.start(t);
  nodes.push(s, lfo);
  hum = { out, nodes };
}
export function stopHum() {
  if (!hum) return;
  const t = ac.currentTime, h = hum;
  hum = null;
  h.out.gain.cancelScheduledValues(t);
  h.out.gain.setValueAtTime(Math.max(0.0001, h.out.gain.value), t);
  h.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  h.nodes.forEach(n => n.stop(t + 0.9));
}

/* ---------- Station music in the style of an Amiga tracker module ---------- */
// "Sampled" instruments (detuned saw stacks, plucks, reeds), voices panned left/right, a short echo.
// Shipyard: the Blue Danube (Johann Strauss II, 1866, public domain) as in the original Elite.
// Bar: an original swing tune in the spirit of a space-port band. Market: an original disco tune.
// Title: Ride of the Valkyries. The player can replace each station tune with an own file (music-files.js).
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const hz = n => { const m = /^([A-G][#b]?)(\d)$/.exec(n); return 440 * 2 ** ((NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12); };
let music = null;
const waves = {};

// Band-limited pulse (fixed duty) and a hollow clarinet tone (odd harmonics)
function wave(kind) {
  if (!waves[kind]) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      if (kind === 'pulse') re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
      else im[k] = k % 2 ? Math.exp(-k * 0.25) / k : 0.04 / k;
    }
    waves[kind] = ac.createPeriodicWave(re, im, { disableNormalization: false });
  }
  return waves[kind];
}

/* Shipyard: Blue Danube, first waltz theme. One phrase = 4 bars of 3 beats.
   mel: [beat, note, beats] (-1 = pickup), answers: the lead's two-note replies, ch: chord per bar. */
// Bass alternates root and fifth from bar to bar, like the tuba in a real oom-pah
const W_CHORDS = {
  D: [['D2', 'A1'], 'F#4', 'A4', 'D5'], A7: [['A1', 'E2'], 'C#4', 'E4', 'G4'], G: [['G2', 'D2'], 'G4', 'B4', 'D5'],
  Em: [['E2', 'B1'], 'E4', 'G4', 'B4'], E7: [['E2', 'B1'], 'E4', 'G#4', 'D5'],
};
const P = (x, y, z, top, hi1, hi2, ch) => ({
  mel: [[-1, x, 1], [0, x, 1], [1, y, 1], [2, z, 1], [3, top, 2.6]],
  answers: [[7, hi1], [8, hi1], [10, hi2], [11, hi2]], ch,
});
const WALTZ = [
  P('D4', 'F#4', 'A4', 'A4', 'A5', 'F#5', ['D', 'D', 'D', 'D']),
  P('D4', 'F#4', 'A4', 'A4', 'A5', 'G5', ['D', 'D', 'A7', 'A7']),
  P('C#4', 'E4', 'B4', 'B4', 'B5', 'G5', ['A7', 'A7', 'A7', 'A7']),
  P('C#4', 'E4', 'B4', 'B4', 'B5', 'F#5', ['A7', 'A7', 'A7', 'D']),
  P('D4', 'F#4', 'A4', 'D5', 'D6', 'A5', ['D', 'D', 'D', 'D']),
  P('D4', 'F#4', 'A4', 'D5', 'D6', 'B5', ['D', 'D', 'G', 'G']),
  { mel: [[-1, 'E4', 1], [0, 'E4', 1], [1, 'G4', 1], [2, 'B4', 1], [3, 'B4', 3], [6, 'B4', 1], [7, 'G#4', 1], [8, 'A4', 1], [9, 'F#5', 3]],
    answers: [], ch: ['Em', 'Em', 'E7', 'D'] },
  { mel: [[0, 'E5', 2], [2, 'A4', 1], [3, 'D5', 5]], answers: [[9, 'A4'], [10, 'D5'], [11, 'D5']], ch: ['A7', 'D', 'D', 'A7'] },
];

// Amiga version: strings carry the tune, pizzicato strings play the pah-pah, a saw bass the oom
function playWaltz(out, t0) {
  const B = 0.36, mix = amigaMixer(out, 0.1);
  return barwise(WALTZ.length, 12 * B, t0, (i, tp) => {
    const ph = WALTZ[i];
    for (const [b, n, len] of ph.mel) {
      strings(mix.L, hz(n), tp + b * B, len * B * 0.88, 0.05, 0.03, len > 1.5);
      strings(mix.R, hz(n) / 2, tp + b * B, len * B * 0.88, 0.022, 0.05);              // violas an octave below
    }
    for (const [b, n] of ph.answers) pluckA(mix.R, hz(n), tp + b * B, 0.06, 0.4, 7);   // the replies, plucked
    ph.ch.forEach((name, bar) => {
      const [bass, ...upper] = W_CHORDS[name], tb = tp + bar * 3 * B;
      const root = name === ph.ch[bar - 1] && bar % 2 ? bass[1] : bass[0];          // fifth on a repeated chord
      bassA(mix.C, hz(root), tb, B * 0.8, 0.17);                                        // oom
      for (const k of [1, 2]) for (const n of upper) pluckA(k === 1 ? mix.L : mix.R, hz(n), tb + k * B, 0.022, 0.22, 5);   // pah pah
    });
  });
}

/* Bar: original swing tune in D minor, 8 bars of 4 beats. mel: [beat, note, beats] in the bar,
   offbeat eighths written as .5 and swung to 2/3 when played. */
const C_BARS = [
  { ch: 'Dm', walk: ['D2', 'F2', 'A2', 'C3'], mel: [[0, 'D5', .5], [.5, 'C#5', .5], [1, 'D5', .5], [1.5, 'F5', .5], [2, 'A5', .5], [2.5, 'G#5', .5], [3, 'A5', 1]] },
  { ch: 'Dm', walk: ['D2', 'A2', 'D3', 'C#3'], mel: [[0, 'C#5', .5], [.5, 'D5', .5], [1, 'A4', 2]] },
  { ch: 'Gm', walk: ['G2', 'Bb2', 'D3', 'Bb2'], mel: [[0, 'Bb4', .5], [.5, 'D5', .5], [1, 'G5', 1], [2, 'F5', .5], [2.5, 'E5', .5], [3, 'D5', .5], [3.5, 'Bb4', .5]] },
  { ch: 'A7', walk: ['A2', 'C#3', 'E3', 'G3'], mel: [[0, 'A4', .5], [.5, 'C#5', .5], [1, 'E5', .5], [1.5, 'G5', .5], [2, 'A5', 1.5]] },
  { ch: 'Dm', walk: ['D2', 'F2', 'A2', 'C3'], mel: [[0, 'D5', .5], [.5, 'F5', .5], [1, 'A5', .5], [1.5, 'C6', .5], [2, 'Bb5', .5], [2.5, 'A5', .5], [3, 'G5', .5], [3.5, 'F5', .5]] },
  { ch: 'Bb7', walk: ['Bb1', 'D2', 'F2', 'Ab2'], mel: [[0, 'F5', .5], [.5, 'Ab5', .5], [1, 'G5', .5], [1.5, 'F5', .5], [2, 'D5', 1], [3, 'Bb4', .5]] },
  { ch: 'A7', walk: ['A1', 'C#2', 'E2', 'G2'], mel: [[0, 'C#5', .5], [.5, 'E5', .5], [1, 'G5', .5], [1.5, 'Bb5', .5], [2, 'A5', .5], [2.5, 'G5', .5], [3, 'E5', .5], [3.5, 'C#5', .5]] },
  { ch: 'Dm', walk: ['D2', 'A1', 'D2', 'E2'], mel: [[0, 'D5', 1], [1, 'A4', .5], [1.5, 'D5', .5], [2, 'D5', 1]] },
];
const C_CHORDS = { Dm: ['D4', 'F4', 'A4'], Gm: ['G3', 'Bb3', 'D4'], A7: ['G3', 'C#4', 'E4'], Bb7: ['Ab3', 'D4', 'F4'] };

// Amiga version: clarinet lead (a second one an octave down the second time), piano comping,
// plucked double bass walking, brushes and ride cymbal
function playCantina(out, t0) {
  const B = 0.24, sw = b => Math.floor(b) + (b % 1 ? 2 / 3 : 0), mix = amigaMixer(out, 0.1);
  return barwise(16, 4 * B, t0, (k, tb) => {
    const bar = C_BARS[k % 8], rep = k >= 8;
    for (const [b, n, len] of bar.mel) {
      const f = hz(n), t = tb + sw(b) * B;
      reed(mix.L, f, t, len * B * 0.6, 0.075, len >= 1);
      if (rep) reed(mix.R, f / 2, t, len * B * 0.6, 0.04);
    }
    bar.walk.forEach((n, b) => pluckA(mix.C, hz(n), tb + b * B, 0.2, B * 1.1, 2.5));        // double bass
    for (const b of [1, 3]) for (const n of C_CHORDS[bar.ch]) pluckA(mix.R, hz(n), tb + (b + 2 / 3) * B, 0.035, 0.3, 4);   // piano
    for (let b = 0; b < 4; b++) {
      cymbal(mix.R, tb + b * B, b % 2 ? 0.035 : 0.025, 0.35);                                  // ride
      cymbal(mix.R, tb + (b + 2 / 3) * B, 0.015, 0.2);
      if (b % 2) snareA(mix.L, tb + b * B, 0.07, true);                                        // brushes on 2 and 4
    }
  });
}

/* Market: original disco tune in A minor, 8 bars of 4 beats, four on the floor. */
const D_BARS = [
  ['A2', [[0, 'E5', .5], [.5, 'E5', .5], [1, 'C5', .5], [1.5, 'A4', .5], [2, 'E5', 1], [3, 'D5', .5], [3.5, 'C5', .5]], ['A4', 'C5', 'E5']],
  ['A2', [[0, 'B4', .5], [.5, 'C5', .5], [1, 'A4', 1.5], [3, 'G4', .5], [3.5, 'A4', .5]], ['A4', 'C5', 'E5']],
  ['F2', [[0, 'C5', .5], [.5, 'F5', .5], [1, 'A5', .5], [1.5, 'G5', .5], [2, 'F5', 1], [3, 'E5', .5], [3.5, 'F5', .5]], ['F4', 'A4', 'C5']],
  ['G2', [[0, 'G5', 1], [1, 'D5', .5], [1.5, 'B4', .5], [2, 'D5', 1.5]], ['G4', 'B4', 'D5']],
  ['A2', [[0, 'A5', .5], [.5, 'A5', .5], [1, 'E5', .5], [1.5, 'C5', .5], [2, 'A5', 1], [3, 'G5', .5], [3.5, 'E5', .5]], ['A4', 'C5', 'E5']],
  ['A2', [[0, 'E5', .5], [.5, 'D5', .5], [1, 'C5', 1], [2, 'B4', .5], [2.5, 'C5', .5], [3, 'E5', 1]], ['A4', 'C5', 'E5']],
  ['D2', [[0, 'F5', .5], [.5, 'E5', .5], [1, 'D5', .5], [1.5, 'A4', .5], [2, 'D5', 1], [3, 'F5', 1]], ['D4', 'F4', 'A4']],
  ['E2', [[0, 'E5', 1], [1, 'G#4', .5], [1.5, 'B4', .5], [2, 'D5', .5], [2.5, 'E5', 1.5]], ['E4', 'G#4', 'B4', 'D5']],
];

// Amiga version: brass lead, octave synth bass, string stabs, four on the floor
function playDisco(out, t0) {
  const B = 0.25, mix = amigaMixer(out, 0.12);
  return barwise(16, 4 * B, t0, (k, tb) => {
    const [root, mel, chord] = D_BARS[k % 8], rep = k >= 8, r = hz(root);
    for (const [b, n, len] of mel) brass(mix.L, hz(n), tb + b * B, len * B * 0.8, 0.05, len >= 1);
    for (let e = 0; e < 8; e++) bassA(mix.C, e % 2 ? r * 2 : r, tb + e * B / 2, B * 0.35, 0.13);   // octave bass
    for (let b = 0; b < 4; b++) {
      kickA(mix.C, tb + b * B);
      if (b % 2) snareA(mix.C, tb + b * B);
      cymbal(mix.R, tb + (b + 0.5) * B, 0.03, 0.12);                                             // open hat on the offbeat
    }
    for (const b of [0.5, 2.5]) for (const n of chord) strings(mix.R, hz(n), tb + b * B, B * (rep ? 0.9 : 0.4), 0.02, 0.01);   // string stabs
  });
}

/* Intro: Ride of the Valkyries (Richard Wagner, 1856, public domain), own arrangement in the
   style of an Amiga tracker module (Björn found the C64 version too thin): "sampled" brass from
   detuned saws with an opening filter, string chords and a string tremolo, a saw bass, timpani
   and cymbals, voices panned left and right, a soft low-pass and a short echo like in old mods.
   9/8, eighth = E seconds. Each bar of the theme: X (dotted eighth), Y (sixteenth), X (eighth),
   Z held, then the pickup W into the next bar. Three phrases: B minor, D minor, B minor. */
const V_BARS = [
  ['B4', 'F#4', 'D5', 'B4', 'Bm'], ['D5', 'B4', 'F#5', 'D5', 'Bm'], ['F#5', 'D5', 'A5', 'A4', 'D'], ['D5', 'A4', 'F#5', 'F#4', 'D'],
  ['D5', 'A4', 'F5', 'D5', 'Dm'], ['F5', 'D5', 'A5', 'F5', 'Dm'], ['A5', 'F5', 'C6', 'C5', 'F'], ['F5', 'C5', 'A5', 'F#4', 'F#'],
  ['B4', 'F#4', 'D5', 'B4', 'Bm'], ['D5', 'B4', 'F#5', 'D5', 'Bm'], ['F#5', 'D5', 'B5', 'F#5', 'G'], ['A#5', 'F#5', 'B5', null, 'Bm'],
];
const V_CHORDS = {
  Bm: ['B1', 'B3', 'D4', 'F#4'], D: ['D2', 'D4', 'F#4', 'A4'], Dm: ['D2', 'D4', 'F4', 'A4'],
  F: ['F2', 'F4', 'A4', 'C5'], 'F#': ['F#1', 'F#4', 'A#4', 'C#5'], G: ['G1', 'G3', 'B3', 'D4'],
};

// Envelope with sustain level and release; returns the end time
function adsr(g, t, vol, att, dur, rel, sus = 0.8) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + att);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * sus), t + att + Math.min(0.15, dur * 0.5));
  g.gain.setValueAtTime(Math.max(0.0001, vol * sus), t + att + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + att + dur + rel);
  return t + att + dur + rel;
}
// A stack of detuned oscillators (cents) into one filter
function stack(dst, f, t, end, type, cents, filt) {
  return cents.map(c => {
    const o = ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = c;
    o.connect(filt); o.start(t); o.stop(end + 0.05);
    return o;
  });
}
// Brass: three saws, the filter opens with the attack and settles, vibrato on long notes
function brass(dst, f, t, dur, vol, vib = false) {
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 1.6;
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.exponentialRampToValueAtTime(Math.min(9000, f * 9), t + 0.05);
  lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 4), t + 0.3);
  lp.connect(g); g.connect(dst);
  const end = adsr(g, t, vol, 0.035, dur, 0.12, 0.75);
  const oscs = stack(dst, f, t, end, 'sawtooth', [-8, 0, 7], lp);
  if (vib) {                              // one shared LFO, in cents, fading in
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 5.2;
    lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + 0.2); lg.gain.linearRampToValueAtTime(16, t + 0.5);
    l.connect(lg); oscs.forEach(o => lg.connect(o.detune));
    l.start(t); l.stop(end + 0.05);
  }
}
// Strings: two saws, darker, quick bow
function strings(dst, f, t, dur, vol, att = 0.04, vib = false) {
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(5000, f * 5); lp.Q.value = 0.7;
  lp.connect(g); g.connect(dst);
  const end = adsr(g, t, vol, att, dur, 0.1, 0.85);
  const oscs = stack(dst, f, t, end, 'sawtooth', [-11, 10], lp);
  if (vib) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t + 0.15); lg.gain.linearRampToValueAtTime(12, t + 0.4);
    l.connect(lg); oscs.forEach(o => lg.connect(o.detune)); l.start(t); l.stop(end + 0.05);
  }
}
// Bass: saw plus a sine an octave down, plucked
function bassA(dst, f, t, dur, vol) {
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(380, t + dur);
  lp.connect(g); g.connect(dst);
  const end = adsr(g, t, vol, 0.008, dur, 0.06, 0.6);
  stack(dst, f, t, end, 'sawtooth', [0], lp);
  stack(dst, f / 2, t, end, 'sine', [0], lp);
}
// Timpani: falling sine and a dull thud of noise
function timpani(dst, f, t, vol) {
  const g = ac.createGain(), o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g); g.connect(dst); o.start(t); o.stop(t + 0.95);
  const s = ac.createBufferSource(), lp = ac.createBiquadFilter(), ng = ac.createGain();
  s.buffer = noise; lp.type = 'lowpass'; lp.frequency.value = 500;
  ng.gain.setValueAtTime(vol * 0.8, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  s.connect(lp); lp.connect(ng); ng.connect(dst); s.start(t, Math.random() * 0.5); s.stop(t + 0.3);
}
function cymbal(dst, t, vol, len = 1.4) {
  const s = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; s.loop = true; hp.type = 'highpass'; hp.frequency.value = 5200;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(hp); hp.connect(g); g.connect(dst); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.05);
}

// Mixer like a 4-channel tracker: two voices left, two right, then a soft low-pass and a short echo
function amigaMixer(out, echoMix = 0.16) {
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 7200; lp.Q.value = 0.5;
  lp.connect(out);
  const echo = ac.createDelay(0.5), fb = ac.createGain(), wet = ac.createGain(), elp = ac.createBiquadFilter();
  echo.delayTime.value = 0.285; fb.gain.value = 0.22; wet.gain.value = echoMix;
  elp.type = 'lowpass'; elp.frequency.value = 2600;
  lp.connect(echo); echo.connect(elp); elp.connect(fb); fb.connect(echo); elp.connect(wet); wet.connect(out);
  const side = p => { const n = ac.createStereoPanner ? ac.createStereoPanner() : ac.createGain(); if (n.pan) n.pan.value = p; n.connect(lp); return n; };
  return { L: side(-0.55), R: side(0.55), C: side(0) };
}

// Plucked tone (piano, pizzicato): saw and triangle, the filter closes fast
function pluckA(dst, f, t, vol, decay = 0.35, bright = 6) {
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(Math.min(9000, f * bright), t); lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.2), t + decay);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  lp.connect(g); g.connect(dst);
  stack(dst, f, t, t + decay, 'sawtooth', [0], lp);
  stack(dst, f, t, t + decay, 'triangle', [3], lp);
}
// Reed (clarinet): hollow odd-harmonic wave, soft attack, vibrato on long notes
function reed(dst, f, t, dur, vol, vib = false) {
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(5000, f * 6);
  lp.connect(g); g.connect(dst);
  const end = adsr(g, t, vol, 0.03, dur, 0.06, 0.85);
  const o = ac.createOscillator();
  o.setPeriodicWave(wave('clar')); o.frequency.setValueAtTime(f, t);
  o.connect(lp); o.start(t); o.stop(end + 0.05);
  const o2 = ac.createOscillator();         // a breathy second layer, detuned
  o2.type = 'triangle'; o2.frequency.setValueAtTime(f, t); o2.detune.value = 6;
  const g2 = ac.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(lp); o2.start(t); o2.stop(end + 0.05);
  if (vib) {
    const l = ac.createOscillator(), lg = ac.createGain();
    l.frequency.value = 5; lg.gain.setValueAtTime(0, t + 0.15); lg.gain.linearRampToValueAtTime(14, t + 0.4);
    l.connect(lg); lg.connect(o.detune); lg.connect(o2.detune); l.start(t); l.stop(end + 0.05);
  }
}
// Kick and snare with a bit more body than the chip versions
function kickA(dst, t, vol = 0.4) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
  o.connect(g); g.connect(dst); o.start(t); o.stop(t + 0.28);
}
function snareA(dst, t, vol = 0.14, brush = false) {
  const s = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(), len = brush ? 0.22 : 0.16;
  s.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = brush ? 3200 : 1900; bp.Q.value = brush ? 0.5 : 0.9;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (brush ? 0.02 : 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(bp); bp.connect(g); g.connect(dst); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  if (!brush) { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = 190; og.gain.setValueAtTime(vol * 0.6, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(og); og.connect(dst); o.start(t); o.stop(t + 0.1); }
}

// Calls fn(i, barStart) for each bar, a little ahead of time, while this music still plays
function barwise(count, barLen, t0, fn) {
  const me = music, offline = typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
  const step = i => {
    if (music !== me || i >= count) return;
    const tb = t0 + i * barLen;
    fn(i, tb);
    if (offline) step(i + 1);
    else setTimeout(() => step(i + 1), Math.max(0, (tb + barLen - ac.currentTime - 1.2) * 1000));
  };
  step(0);
  return t0 + count * barLen;
}

// Schedules the arrangement bar by bar, a little ahead, as long as this music still plays
function playValkyries(out, t0) {
  const E = 0.19, bar = 9 * E, mix = amigaMixer(out);
  const me = music, offline = typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
  const doBar = i => {
    if (music !== me || i >= V_BARS.length) return;
    const [x, y, z, w, ch] = V_BARS[i], tb = t0 + i * bar, last = i === V_BARS.length - 1;
    const lead = (n, at, len, vol = 0.055) => {
      brass(mix.L, hz(n), tb + at * E, len * E * 0.9, vol, len > 2);
      brass(mix.R, hz(n) / 2, tb + at * E, len * E * 0.9, vol * 0.75);           // horns an octave below
    };
    lead(x, 0, 1.5); lead(y, 1.5, 0.5, 0.045); lead(x, 2, 1);
    lead(z, 3, last ? 6 : 4.5, 0.06);
    if (w) lead(w, 7.5, 1.5, 0.05);
    const [bass, ...upper] = V_CHORDS[ch];
    for (let b = 0; b < 3; b++) {
      const tbeat = tb + b * 3 * E;
      bassA(mix.C, hz(bass) * (b === 1 ? 2 : 1), tbeat, E * 2.2, 0.16);
      for (const n of upper) strings(mix.R, hz(n), tbeat, E * 2.6, 0.022);       // chord on every beat
      // Tremolo figure: chord tones in sixteenths, an octave up
      for (let k = 0; k < 6; k++) strings(mix.L, hz(upper[k % 3]) * 2, tbeat + k * E * 0.5, E * 0.4, 0.014, 0.01);
    }
    timpani(mix.C, hz(bass) * (hz(bass) < 60 ? 2 : 1), tb, 0.3);
    if (i % 4 === 0 || last) cymbal(mix.C, tb, i % 4 === 0 ? 0.05 : 0.08, last ? 2.5 : 1.4);
    else cymbal(mix.R, tb + 6 * E, 0.02, 0.3);
    if (offline) doBar(i + 1);           // rendering a preview: everything at once
    else setTimeout(() => doBar(i + 1), Math.max(0, (tb + bar - ac.currentTime - 1.2) * 1000));
  };
  doBar(0);
  return t0 + V_BARS.length * bar + E * 3;
}

// Built-in tune for each station area
const TUNES = { yard: playWaltz, jobs: playCantina, market: playDisco, intro: playValkyries };
const decoded = new Map();          // area -> AudioBuffer of the player's own file, or null

async function ownTrack(area) {
  if (area === 'intro') return null;
  if (decoded.has(area)) return decoded.get(area);
  let buf = null;
  try {
    const blob = await getTrack(area);
    if (blob) buf = await ac.decodeAudioData(await blob.arrayBuffer());
  } catch (e) { buf = null; }
  decoded.set(area, buf);
  return buf;
}

// True when the browser can play this file (checked before it replaces the built-in music)
export async function canPlay(file) {
  if (!ac) return true;
  try { await ac.decodeAudioData(await file.arrayBuffer()); return true; } catch (e) { return false; }
}

// After a file was chosen or removed in the settings
export function trackChanged(area) {
  decoded.delete(area);
  if (music?.area === area) { stopMusic(true); startMusic(area); }
}

export function startMusic(area) {
  if (!ac || music?.area === area) return;
  stopMusic(true);
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, ac.currentTime);
  out.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.6);
  out.connect(master);
  const m = music = { area, out, timer: 0, src: null };
  duckHum(0.03);                           // the machine drone would sour the music
  ownTrack(area).then(buf => {
    if (music !== m) return;
    if (buf) {                             // the player's own file, looped and a bit quieter
      const src = m.src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf; src.loop = true; g.gain.value = 0.35;
      src.connect(g); g.connect(out); src.start();
      return;
    }
    const loop = start => {
      const end = TUNES[area](out, start);
      m.timer = setTimeout(() => music === m && loop(end), (end - ac.currentTime - 2) * 1000);
    };
    loop(ac.currentTime + 0.5);
  });
}

export function stopMusic(switching = false) {
  if (!music) return;
  const m = music, t = ac.currentTime;
  music = null;
  clearTimeout(m.timer);
  m.out.gain.cancelScheduledValues(t);
  m.out.gain.setValueAtTime(Math.max(0.0001, m.out.gain.value), t);
  m.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  m.src?.stop(t + 0.7);
  setTimeout(() => m.out.disconnect(), 800);
  if (!switching) duckHum(HUM_GAIN);
}
