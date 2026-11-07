/**
 * What the mouse says when it is touched. The sound is synthesized here and is not a recording of a mouse. Its pitch follows two kinds of call described by Grimsley et al. 2016
 * (https://doi.org/10.3389/fnbeh.2016.00038): low frequency harmonic calls, with a fundamental below 8 kHz and harmonics from near 5 kHz, which are linked to pain and agitation, and
 * mid-frequency calls of 2 to 43 ms between 9 and 15 kHz, emitted mostly under restraint. Most calls of a mouse are ultrasonic and could not be heard, so they are left out.
 * How long a low call lasts, its loudness, its pitch contour and how a touch leads to a call are choices for listening.
 */
export interface VoiceCall {
  /** Seconds after the touch. */
  readonly at: number;
  readonly seconds: number;
  /** Fundamental at the start, at the peak and at the end, in hertz. */
  readonly from: number;
  readonly peak: number;
  readonly to: number;
  /** Share of the loudest sound. */
  readonly level: number;
  /** A low call is rich in harmonics, and a mid-frequency call is nearly a pure tone. */
  readonly kind: 'low-harmonic' | 'mid-frequency';
}

export const VOICE_SOURCE = Object.freeze({ citation: 'Grimsley et al. 2016, Front Behav Neurosci 10:38', doi: '10.3389/fnbeh.2016.00038' });

export const VOICE_RANGE = Object.freeze({
  lowFundamental: [5000, 8000] as const,
  midFrequency: [9000, 15000] as const,
  midSeconds: [0.002, 0.043] as const,
});

const between = (random: () => number, low: number, high: number) => low + random() * (high - low);

/**
 * The calls for one touch. `alarm`, from 0 to 1, grows with repeated touches: a stronger answer is longer and has more parts.
 */
export function callsForTouch(alarm: number, random: () => number): VoiceCall[] {
  const strength = Math.max(0, Math.min(1, alarm));
  const calls: VoiceCall[] = [];
  const parts = 1 + Math.round(strength * 2 + random() * 0.6);
  let at = 0;
  for (let part = 0; part < parts; part++) {
    const seconds = between(random, 0.09, 0.15) + strength * between(random, 0.02, 0.12);
    const peak = between(random, 6400, 7900);
    calls.push({ at, seconds, from: between(random, 5100, 5900), peak, to: between(random, 5000, 5700), level: 0.62 + 0.38 * strength, kind: 'low-harmonic' });
    at += seconds + between(random, 0.03, 0.07);
  }
  // Now and then, and more when alarmed, a short high call ends it.
  if (random() < 0.3 + 0.5 * strength) {
    const pitch = between(random, 10000, 13500);
    calls.push({ at, seconds: between(random, 0.018, VOICE_RANGE.midSeconds[1]), from: pitch, peak: pitch * 1.02, to: pitch * 0.98, level: 0.3, kind: 'mid-frequency' });
  }
  return calls;
}
