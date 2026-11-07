import { callsForTouch, type VoiceCall } from '../domain/mouse-voice';

/**
 * Plays the synthesized voice of the mouse in the browser. A browser only lets sound start after someone has touched the page, which is always the case here, because the voice answers a touch.
 * Nothing is recorded and nothing leaves the device.
 */
export interface MouseVoice {
  /** The animal has been touched. Touches close together raise the alarm in its voice. */
  touched(): void;
  /** Scissors closing: a short dry click, also synthesized. */
  snip(): void;
  dispose(): void;
}

const LOUDEST = 0.13;

function playCall(context: AudioContext, output: AudioNode, call: VoiceCall, start: number) {
  const begin = start + call.at, end = begin + call.seconds;
  const shape = (parameter: AudioParam, scale: number) => {
    parameter.setValueAtTime(call.from * scale, begin);
    parameter.linearRampToValueAtTime(call.peak * scale, begin + call.seconds * 0.3);
    parameter.linearRampToValueAtTime(call.to * scale, end);
  };
  const envelope = context.createGain();
  const level = LOUDEST * call.level;
  envelope.gain.setValueAtTime(0, begin);
  envelope.gain.linearRampToValueAtTime(level, begin + Math.min(0.012, call.seconds * 0.25));
  envelope.gain.setValueAtTime(level, Math.max(begin + 0.012, end - call.seconds * 0.35));
  envelope.gain.linearRampToValueAtTime(0, end);
  envelope.connect(output);
  // A low call is a stack of harmonics over its fundamental, and a mid-frequency call is one tone.
  const partials = call.kind === 'low-harmonic' ? [[1, 1], [2, 0.42], [3, 0.16]] as const : [[1, 1]] as const;
  for (const [harmonic, share] of partials) {
    const tone = context.createOscillator();
    tone.type = 'sine';
    shape(tone.frequency, harmonic);
    const gain = context.createGain();
    gain.gain.value = share;
    tone.connect(gain).connect(envelope);
    tone.start(begin);
    tone.stop(end + 0.01);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }
}

export function createMouseVoice(): MouseVoice {
  let context: AudioContext | null = null, alarm = 0, lastTouch = -Infinity;
  return {
    touched() {
      const Context = window.AudioContext;
      if (!Context) return;
      try {
        context ??= new Context();
        if (context.state === 'suspended') void context.resume();
        const now = context.currentTime;
        alarm = now - lastTouch < 2.5 ? Math.min(1, alarm + 0.34) : 0;
        lastTouch = now;
        for (const call of callsForTouch(alarm, Math.random)) playCall(context, context.destination, call, now + 0.01);
      } catch { /* The animal stays silent where sound cannot start. */ }
    },
    snip() {
      const Context = window.AudioContext;
      if (!Context) return;
      try {
        context ??= new Context();
        if (context.state === 'suspended') void context.resume();
        const now = context.currentTime, length = Math.floor(context.sampleRate * 0.018);
        const buffer = context.createBuffer(1, length, context.sampleRate), samples = buffer.getChannelData(0);
        for (let index = 0; index < length; index++) samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
        const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
        source.buffer = buffer;
        filter.type = 'bandpass'; filter.frequency.value = 3400; filter.Q.value = 1.2;
        gain.gain.value = 0.05;
        source.connect(filter).connect(gain).connect(context.destination);
        source.start(now);
        source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      } catch { /* No sound where sound cannot start. */ }
    },
    dispose() { void context?.close(); context = null; },
  };
}
