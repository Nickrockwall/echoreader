import { speech } from './speechEngine.ts';

/**
 *  speech <audio> ─▶ voiceGain ──────────────┐
 *                                            ├─▶ master ─▶ destination
 *  rain / fire / cafe ─▶ ambientBus (duck) ──┘
 */
export interface AudioGraph {
  ctx: AudioContext;
  voice: GainNode;
  ambient: GainNode;
}

/** How far ambience dips while the voice is speaking. */
const DUCK_LEVEL = 0.45;
const DUCK_TIME = 0.35; // seconds (time constant)

let graph: AudioGraph | null = null;
let ducking = true;

/**
 * Creates the shared graph on first use. Must first be called from a user gesture
 * (browsers keep an AudioContext suspended until then).
 */
export function audioGraph(): AudioGraph {
  if (!graph) {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const master = ctx.createGain();
    master.connect(ctx.destination);

    const voice = ctx.createGain();
    // Take over the volume the element had been using on its own.
    voice.gain.value = speech.audio.volume;
    speech.audio.volume = 1;
    voice.connect(master);
    // From here on the speech element is heard only through the graph.
    ctx.createMediaElementSource(speech.audio).connect(voice);

    const ambient = ctx.createGain();
    ambient.connect(master);

    graph = { ctx, voice, ambient };
    speech.subscribe((s) => applyDuck(s.status === 'playing'));
  }
  if (graph.ctx.state === 'suspended') void graph.ctx.resume();
  return graph;
}

/** The graph if something already created it; never creates one. */
export const existingGraph = () => graph;

function applyDuck(speaking: boolean) {
  if (!graph) return;
  const target = ducking && speaking ? DUCK_LEVEL : 1;
  graph.ambient.gain.setTargetAtTime(target, graph.ctx.currentTime, DUCK_TIME);
}

export function setDucking(on: boolean) {
  ducking = on;
  applyDuck(speech.snapshot.status === 'playing');
}

// Handle for inspecting the mix from the console and browser tests (dev builds only).
if (import.meta.env.DEV) (window as unknown as { __audioGraph: () => AudioGraph | null }).__audioGraph = existingGraph;

export function setVoiceVolume(v: number) {
  if (graph) graph.voice.gain.setTargetAtTime(v, graph.ctx.currentTime, 0.05);
  // Before the graph exists the element plays directly; keep its own volume in step.
  else speech.audio.volume = Math.min(1, v);
}
