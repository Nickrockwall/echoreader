import { audioGraph } from './audioGraph.ts';

export type AmbientId = 'rain' | 'fire' | 'cafe';

/** Each track builds its nodes on first use and tears them down when faded to silence. */
interface Voice {
  stop(): void;
}

const FADE = 0.4; // seconds (time constant) for volume changes
const LOOKAHEAD = 0.25; // seconds of events scheduled ahead of the clock
const TICK_MS = 60;

// ---- Building blocks -----------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, Record<'white' | 'pink' | 'brown', AudioBuffer>>();

/** Four-second stereo noise loops, generated once per context. */
function noise(ctx: BaseAudioContext) {
  let set = noiseCache.get(ctx);
  if (!set) {
    const make = (fill: (out: Float32Array) => void) => {
      const buf = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
      for (let c = 0; c < 2; c++) fill(buf.getChannelData(c));
      return buf;
    };
    set = {
      white: make((out) => {
        for (let i = 0; i < out.length; i++) out[i] = Math.random() * 2 - 1;
      }),
      // Paul Kellet's economy pink filter.
      pink: make((out) => {
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < out.length; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.099046;
          b1 = 0.963 * b1 + w * 0.2965164;
          b2 = 0.57 * b2 + w * 1.0526913;
          out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        }
      }),
      brown: make((out) => {
        let last = 0;
        for (let i = 0; i < out.length; i++) {
          last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          out[i] = last * 3.5;
        }
      }),
    };
    noiseCache.set(ctx, set);
  }
  return set;
}

/** Owns the continuously running sources of one track, so stopping it stops them all. */
class Sources {
  private nodes: AudioScheduledSourceNode[] = [];

  /** Starts `buffer` looping into `dest` (at a random point, so layers don't line up). */
  loop(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(dest);
    src.start(0, Math.random() * buffer.duration);
    this.nodes.push(src);
  }

  /** Slow sine modulation of an AudioParam around its current value. */
  lfo(ctx: AudioContext, param: AudioParam, rate: number, depth: number) {
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    osc.connect(gain(ctx, depth)).connect(param);
    osc.start();
    this.nodes.push(osc);
  }

  stop() {
    for (const n of this.nodes) n.stop();
    this.nodes = [];
  }
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

function gain(ctx: AudioContext, value: number) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/** A short decaying burst of filtered noise: a raindrop, a crackle, a pop. */
function burst(ctx: BaseAudioContext, ms: number, decay: number, smooth: number) {
  const len = Math.max(1, Math.round((ctx.sampleRate * ms) / 1000));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const out = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = last * smooth + (Math.random() * 2 - 1) * (1 - smooth);
    out[i] = last * Math.exp((-decay * i) / len);
  }
  // Normalize so `smooth` changes timbre, not loudness.
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (let i = 0; i < len; i++) out[i] /= peak;
  return buf;
}

/** Runs `schedule(from, to)` for each lookahead window until stopped. */
function scheduler(ctx: AudioContext, schedule: (from: number, to: number) => void) {
  let horizon = ctx.currentTime;
  const id = window.setInterval(() => {
    const to = ctx.currentTime + LOOKAHEAD;
    if (to > horizon) {
      schedule(Math.max(horizon, ctx.currentTime), to);
      horizon = to;
    }
  }, TICK_MS);
  return () => window.clearInterval(id);
}

/** Plays a one-shot buffer at `when` with a random stereo position. */
function shot(ctx: AudioContext, buffer: AudioBuffer, dest: AudioNode, when: number, level: number, rate = 1) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const g = gain(ctx, level);
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  src.connect(g).connect(pan).connect(dest);
  src.start(when);
}

// ---- Tracks --------------------------------------------------------------------

/** A heavy rain at night: wash, distant rumble, sizzle, and drops on near surfaces. */
function rain(ctx: AudioContext, out: AudioNode): Voice {
  const n = noise(ctx);
  const sources = new Sources();

  const wash = filter(ctx, 'highpass', 300);
  const body = gain(ctx, 0.55);
  wash.connect(filter(ctx, 'lowpass', 2600)).connect(body).connect(out);
  sources.loop(ctx, n.pink, wash);

  const distant = filter(ctx, 'lowpass', 170);
  const rumble = gain(ctx, 0.5);
  distant.connect(rumble).connect(out);
  sources.loop(ctx, n.brown, distant);

  const fizz = filter(ctx, 'highpass', 5500);
  fizz.connect(gain(ctx, 0.07)).connect(out);
  sources.loop(ctx, n.white, fizz);

  // The downpour swells and eases.
  sources.lfo(ctx, body.gain, 0.09, 0.12);
  sources.lfo(ctx, rumble.gain, 0.05, 0.2);

  const drops = [burst(ctx, 18, 9, 0.3), burst(ctx, 30, 7, 0.55), burst(ctx, 12, 12, 0.15)];
  const dropBus = filter(ctx, 'highpass', 1200);
  dropBus.connect(out);
  const stopDrops = scheduler(ctx, (from, to) => {
    // About 35 audible drops a second, Poisson-spaced.
    for (let t = from - Math.log(Math.random()) / 35; t < to; t -= Math.log(Math.random()) / 35) {
      const b = drops[Math.floor(Math.random() * drops.length)];
      shot(ctx, b, dropBus, t, 0.04 + Math.random() * 0.12, 0.6 + Math.random() * 1.2);
    }
  });

  return {
    stop() {
      stopDrops();
      sources.stop();
    },
  };
}

/** A wood fire: a low breathing roar, a faint hiss, crackles in clusters, an occasional pop. */
function fire(ctx: AudioContext, out: AudioNode): Voice {
  const n = noise(ctx);
  const sources = new Sources();

  const low = filter(ctx, 'lowpass', 380);
  const roar = gain(ctx, 0.6);
  low.connect(roar).connect(out);
  sources.loop(ctx, n.brown, low);

  const air = filter(ctx, 'bandpass', 1800, 0.6);
  const hiss = gain(ctx, 0.025);
  air.connect(hiss).connect(out);
  sources.loop(ctx, n.white, air);

  const crackles = [burst(ctx, 3, 14, 0), burst(ctx, 6, 10, 0.2), burst(ctx, 2, 18, 0)];
  const pop = burst(ctx, 28, 6, 0.6);
  const crackleBus = filter(ctx, 'highpass', 900);
  crackleBus.connect(out);

  let nextBreath = ctx.currentTime;
  const stopEvents = scheduler(ctx, (from, to) => {
    // The roar breathes: drift its level toward a new random target every half second or so.
    while (nextBreath < to) {
      roar.gain.setTargetAtTime(0.4 + Math.random() * 0.4, nextBreath, 0.25);
      hiss.gain.setTargetAtTime(0.015 + Math.random() * 0.025, nextBreath, 0.1);
      nextBreath += 0.3 + Math.random() * 0.5;
    }
    for (let t = from - Math.log(Math.random()) / 4; t < to; t -= Math.log(Math.random()) / 4) {
      // A cluster of a few crackles close together.
      const count = 1 + Math.floor(Math.random() * 5);
      for (let k = 0, at = t; k < count; k++, at += 0.008 + Math.random() * 0.06) {
        const b = crackles[Math.floor(Math.random() * crackles.length)];
        shot(ctx, b, crackleBus, at, 0.08 + Math.random() * 0.3, 0.7 + Math.random() * 0.8);
      }
      if (Math.random() < 0.06) shot(ctx, pop, out, t + 0.02, 0.35 + Math.random() * 0.25, 0.6 + Math.random() * 0.4);
    }
  });

  return {
    stop() {
      stopEvents();
      sources.stop();
    },
  };
}

let cafeBuffer: Promise<AudioBuffer> | null = null;

/** Decodes the café recording and folds its tail into its head so the loop has no seam. */
function loadCafe(ctx: AudioContext) {
  cafeBuffer ??= (async () => {
    const res = await fetch('/ambient/cafe.ogg');
    const raw = await ctx.decodeAudioData(await res.arrayBuffer());
    const fade = Math.floor(raw.sampleRate * 3);
    const len = raw.length - fade;
    const out = ctx.createBuffer(raw.numberOfChannels, len, raw.sampleRate);
    for (let c = 0; c < raw.numberOfChannels; c++) {
      const src = raw.getChannelData(c);
      const dst = out.getChannelData(c);
      dst.set(src.subarray(0, len));
      for (let i = 0; i < fade; i++) {
        // Equal-power crossfade: the tail fades out under the incoming head.
        const x = i / fade;
        dst[i] = src[i] * Math.sin((x * Math.PI) / 2) + src[len + i] * Math.cos((x * Math.PI) / 2);
      }
    }
    return out;
  })();
  cafeBuffer.catch(() => (cafeBuffer = null));
  return cafeBuffer;
}

/** Café murmur: a public-domain restaurant recording, softened so it sits behind the voice. */
function cafe(ctx: AudioContext, out: AudioNode): Voice {
  const sources = new Sources();
  let stopped = false;
  const tone = filter(ctx, 'lowpass', 5000);
  tone.connect(gain(ctx, 0.9)).connect(out);
  void loadCafe(ctx).then((buffer) => {
    if (!stopped) sources.loop(ctx, buffer, tone);
  });
  return {
    stop() {
      stopped = true;
      sources.stop();
    },
  };
}

const BUILDERS: Record<AmbientId, (ctx: AudioContext, out: AudioNode) => Voice> = { rain, fire, cafe };

// ---- Mixer ---------------------------------------------------------------------

interface Channel {
  out: GainNode;
  voice: Voice | null;
  stopTimer: number;
}

const channels = new Map<AmbientId, Channel>();

/** Sets a track's volume (0–1). Silence stops the track after its fade so it costs nothing. */
export function setAmbientVolume(id: AmbientId, volume: number) {
  if (volume <= 0 && !channels.has(id)) return;
  const { ctx, ambient } = audioGraph();
  let ch = channels.get(id);
  if (!ch) {
    const out = gain(ctx, 0);
    out.connect(ambient);
    ch = { out, voice: null, stopTimer: 0 };
    channels.set(id, ch);
  }
  window.clearTimeout(ch.stopTimer);
  // Squared for a perceptually even slider.
  ch.out.gain.setTargetAtTime(volume * volume, ctx.currentTime, FADE);
  if (volume > 0) {
    ch.voice ??= BUILDERS[id](ctx, ch.out);
  } else {
    const c = ch;
    c.stopTimer = window.setTimeout(() => {
      c.voice?.stop();
      c.out.disconnect();
      channels.delete(id);
    }, FADE * 5000);
  }
}
