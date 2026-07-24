export interface AudioActivitySample {
  t: number;
  e: number;
}

export interface SyncEstimate {
  offset: number;
  confidence: number;
}

interface EstimateOpts {
  maxOffsetSec?: number;
  stepSec?: number;
  minSpanSec?: number;
  minOnsets?: number;
}

interface Cue {
  start: number;
  end: number;
}

function pulsesFromSamples(
  samples: AudioActivitySample[],
  t0: number,
  t1: number,
  step: number,
): { presence: Float32Array; onsets: Float32Array; n: number } {
  const n = Math.max(1, Math.floor((t1 - t0) / step));
  const presence = new Float32Array(n);
  const onsets = new Float32Array(n);
  if (samples.length === 0) return { presence, onsets, n };

  const sorted = [...samples].sort((a, b) => a.t - b.t);
  let prev = 0;
  for (const s of sorted) {
    const i = Math.floor((s.t - t0) / step);
    if (i < 0 || i >= n) {
      prev = s.e > 0 ? 1 : 0;
      continue;
    }
    const cur = s.e > 0 ? 1 : 0;
    if (cur > presence[i]) presence[i] = cur;
    if (cur === 1 && prev === 0) onsets[i] = 1;
    prev = cur;
  }
  return { presence, onsets, n };
}

function pulsesFromCues(
  cues: Cue[],
  t0: number,
  t1: number,
  step: number,
): { presence: Float32Array; onsets: Float32Array; n: number; effective: number } {
  const n = Math.max(1, Math.floor((t1 - t0) / step));
  const presence = new Float32Array(n);
  const onsets = new Float32Array(n);
  let effective = 0;
  for (const c of cues) {
    const a = c.start / 1000;
    const b = c.end / 1000;
    if (b <= a) continue;
    const iStart = Math.floor((a - t0) / step);
    const iEnd = Math.floor((b - t0) / step);
    if (iEnd < 0 || iStart >= n) continue;
    if (iStart >= 0 && iStart < n) {
      onsets[iStart] = 1;
      effective += 1;
    }
    const s = Math.max(0, iStart);
    const e = Math.min(n - 1, iEnd);
    for (let i = s; i <= e; i += 1) presence[i] = 1;
  }
  return { presence, onsets, n, effective };
}

function detrend(a: Float32Array): Float64Array {
  const out = new Float64Array(a.length);
  let mean = 0;
  for (let i = 0; i < a.length; i += 1) mean += a[i];
  mean /= a.length || 1;
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] - mean;
  return out;
}

function l2(a: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * a[i];
  return Math.sqrt(s);
}

function quadraticPeakOffset(scores: number[], peak: number): number {
  if (peak <= 0 || peak >= scores.length - 1) return 0;
  const y0 = scores[peak - 1];
  const y1 = scores[peak];
  const y2 = scores[peak + 1];
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-12) return 0;
  const d = (0.5 * (y0 - y2)) / denom;
  if (!Number.isFinite(d) || d < -1 || d > 1) return 0;
  return d;
}

export function estimateSubtitleOffset(
  samples: AudioActivitySample[],
  cues: Cue[],
  opts: EstimateOpts = {},
): SyncEstimate | null {
  const maxOffset = opts.maxOffsetSec ?? 15;
  const step = opts.stepSec ?? 0.2;
  const minSpan = opts.minSpanSec ?? 25;
  const minOnsets = opts.minOnsets ?? 6;

  if (samples.length < 60 || cues.length === 0) return null;

  let t0 = Infinity;
  let t1 = -Infinity;
  for (const s of samples) {
    if (s.t < t0) t0 = s.t;
    if (s.t > t1) t1 = s.t;
  }
  if (!Number.isFinite(t0) || t1 - t0 < minSpan) return null;

  const aPulses = pulsesFromSamples(samples, t0, t1, step);
  const cPulses = pulsesFromCues(cues, t0 - maxOffset, t1 + maxOffset, step);

  const audioActiveCount = aPulses.onsets.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
  if (audioActiveCount < minOnsets) return null;
  if (cPulses.effective < minOnsets) return null;

  const aOn = detrend(aPulses.onsets);
  const aOnNorm = l2(aOn);
  if (aOnNorm < 1e-9) return null;

  const lagSteps = Math.round(maxOffset / step);
  const scores: number[] = new Array(lagSteps * 2 + 1).fill(-Infinity);

  const tCueStart = t0 - maxOffset;
  const indexOffsetInCueGrid = Math.round((t0 - tCueStart) / step);

  for (let L = -lagSteps; L <= lagSteps; L += 1) {
    const bSlice = new Float32Array(aPulses.n);
    for (let i = 0; i < aPulses.n; i += 1) {
      const j = i + indexOffsetInCueGrid - L;
      if (j >= 0 && j < cPulses.onsets.length) bSlice[i] = cPulses.onsets[j];
    }
    let active = 0;
    for (let i = 0; i < bSlice.length; i += 1) if (bSlice[i] > 0) active += 1;
    if (active < minOnsets) continue;

    const bDet = detrend(bSlice);
    const bNorm = l2(bDet);
    if (bNorm < 1e-9) continue;

    let dot = 0;
    for (let i = 0; i < bDet.length; i += 1) dot += aOn[i] * bDet[i];
    scores[L + lagSteps] = dot / (aOnNorm * bNorm);
  }

  let bestIdx = -1;
  let bestScore = -Infinity;
  let sumValid = 0;
  let cntValid = 0;
  let sumSqValid = 0;
  for (let i = 0; i < scores.length; i += 1) {
    if (!Number.isFinite(scores[i])) continue;
    cntValid += 1;
    sumValid += scores[i];
    sumSqValid += scores[i] * scores[i];
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIdx = i;
    }
  }
  if (cntValid < 5 || bestIdx <= 0 || bestIdx >= scores.length - 1) return null;

  const mean = sumValid / cntValid;
  const variance = Math.max(0, sumSqValid / cntValid - mean * mean);
  const std = Math.sqrt(variance);

  if (bestScore <= 0) return null;
  if (std < 1e-9) return null;
  const z = (bestScore - mean) / std;

  let secondBest = -Infinity;
  for (let i = 0; i < scores.length; i += 1) {
    if (i === bestIdx) continue;
    if (Math.abs(i - bestIdx) <= 1) continue;
    if (Number.isFinite(scores[i]) && scores[i] > secondBest) secondBest = scores[i];
  }
  const margin = Number.isFinite(secondBest) ? bestScore - secondBest : bestScore;

  const subBin = quadraticPeakOffset(scores, bestIdx);
  const offsetSeconds = ((bestIdx - lagSteps) + subBin) * step;

  if (Math.abs(offsetSeconds) > maxOffset - step) return null;

  const zNorm = Math.min(1, Math.max(0, (z - 1.5) / 4));
  const marginNorm = Math.min(1, Math.max(0, margin / 0.2));
  const corrNorm = Math.min(1, Math.max(0, bestScore));
  const confidence = 0.5 * corrNorm + 0.3 * marginNorm + 0.2 * zNorm;

  return {
    offset: Math.round(offsetSeconds * 100) / 100,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}
