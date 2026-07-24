type WhisperChunk = {
  text: string;
  timestamp: [number | null, number | null];
};

type AsrResult = {
  text: string;
  chunks?: WhisperChunk[];
};

let _pipelinePromise: Promise<any> | null = null;
let _onLoadProgress: ((pct: number) => void) | null = null;

export function onWhisperLoadProgress(cb: ((pct: number) => void) | null) {
  _onLoadProgress = cb;
}

async function loadPipeline(): Promise<any> {
  if (_pipelinePromise) return _pipelinePromise;
  _pipelinePromise = (async () => {
    const mod = await import("@huggingface/transformers");
    const { pipeline, env } = mod as any;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    try {
      env.backends.onnx.wasm.wasmPaths =
        "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/";
    } catch {
      /* env shape varies across versions; ignore */
    }
    const asr = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-tiny.en",
      {
        dtype: "q8",
        progress_callback: (info: any) => {
          if (!_onLoadProgress) return;
          if (info?.status === "progress" && typeof info.progress === "number") {
            _onLoadProgress(Math.max(0, Math.min(1, info.progress / 100)));
          } else if (info?.status === "ready") {
            _onLoadProgress(1);
          }
        },
      },
    );
    return asr;
  })().catch((err) => {
    _pipelinePromise = null;
    throw err;
  });
  return _pipelinePromise;
}

export async function preloadWhisper(): Promise<void> {
  await loadPipeline();
}

function downsampleTo16k(pcm: Float32Array, sr: number): Float32Array {
  if (sr === 16000) return pcm;
  const ratio = sr / 16000;
  const outLen = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(pcm.length - 1, i0 + 1);
    const frac = idx - i0;
    out[i] = pcm[i0] * (1 - frac) + pcm[i1] * frac;
  }
  return out;
}

function rmsEnergy(pcm: Float32Array): number {
  let s = 0;
  for (let i = 0; i < pcm.length; i += 1) s += pcm[i] * pcm[i];
  return Math.sqrt(s / Math.max(1, pcm.length));
}

const STOPWORDS = new Set([
  "the", "and", "of", "in", "on", "at", "to", "for", "with", "by",
  "a", "an", "is", "are", "was", "were", "be", "been", "being",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function bigramSet(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < tokens.length; i += 1) out.add(tokens[i] + " " + tokens[i + 1]);
  return out;
}

function containment<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const small = a.size < b.size ? a : b;
  const big = a.size < b.size ? b : a;
  for (const x of small) if (big.has(x)) inter += 1;
  return inter / small.size;
}

type Cue = { start: number; end: number; text?: string };

type CueIndex = {
  cue: Cue;
  midSec: number;
  tokens: string[];
  bigrams: Set<string>;
};

function buildCueIndex(cues: Cue[]): CueIndex[] {
  const out: CueIndex[] = [];
  for (const c of cues) {
    const text = typeof c.text === "string" ? c.text : "";
    const toks = tokenize(text);
    if (toks.length === 0) continue;
    out.push({
      cue: c,
      midSec: (c.start + c.end) / 2000,
      tokens: toks,
      bigrams: bigramSet(toks),
    });
  }
  return out;
}

type SyncDecision = {
  offset: number;
  confidence: number;
  matchedCount: number;
  totalSegments: number;
  reason?: string;
};

export type WhisperSyncOpts = {
  durationSec?: number;
  maxOffsetSec?: number;
  minScore?: number;
  minMatches?: number;
};

export async function whisperEstimateOffset(
  audio: { pcm: Float32Array; sampleRate: number; startTime: number },
  cues: Cue[],
  opts: WhisperSyncOpts = {},
): Promise<SyncDecision | null> {
  const durationSec = Math.max(8, opts.durationSec ?? 25);
  const maxOffsetSec = opts.maxOffsetSec ?? 45;
  const minScore = opts.minScore ?? 0.6;
  const minMatches = opts.minMatches ?? 3;

  if (!audio?.pcm || !cues?.length) return null;

  const audioStart = audio.startTime;
  const wanted = Math.min(audio.pcm.length, Math.floor(durationSec * audio.sampleRate));
  const trimmed = audio.pcm.subarray(audio.pcm.length - wanted);
  if (rmsEnergy(trimmed) < 0.0005) {
    return { offset: 0, confidence: 0, matchedCount: 0, totalSegments: 0, reason: "silent" };
  }

  const pcm16k = downsampleTo16k(trimmed, audio.sampleRate);

  const pipeline = await loadPipeline();
  const result: AsrResult = await pipeline(pcm16k, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
  });

  const chunks = (result.chunks ?? []).filter(
    (c) => c.timestamp[0] != null && c.timestamp[1] != null && c.text.trim().length > 0,
  );
  if (chunks.length === 0) {
    return { offset: 0, confidence: 0, matchedCount: 0, totalSegments: 0, reason: "no-chunks" };
  }

  const seen = new Map<string, number>();
  const dedupedChunks: WhisperChunk[] = [];
  for (const c of chunks) {
    const key = c.text.trim().toLowerCase();
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n >= 1) continue;
    dedupedChunks.push(c);
  }
  const cleanedChunks = dedupedChunks.filter((c) => {
    const key = c.text.trim().toLowerCase();
    return (seen.get(key) ?? 0) < 5;
  });
  if (cleanedChunks.length === 0) {
    return { offset: 0, confidence: 0, matchedCount: 0, totalSegments: chunks.length, reason: "hallucinated" };
  }

  const _audioOffsetForChunkZero = audioStart + (trimmed.length - pcm16k.length * (audio.sampleRate / 16000)) / audio.sampleRate;
  const startPlayback = audioStart;
  const idx = buildCueIndex(cues);

  type Match = { offset: number; score: number };
  const matches: Match[] = [];

  for (const ch of cleanedChunks) {
    const text = ch.text || "";
    const toks = tokenize(text);
    if (toks.length < 2) continue;
    const bigs = bigramSet(toks);
    const tokSet = new Set(toks);
    const chMid = startPlayback + ((ch.timestamp[0]! + ch.timestamp[1]!) / 2);

    let best: { offset: number; score: number; bestCueText?: string } | null = null;
    for (const ci of idx) {
      if (Math.abs(ci.midSec - chMid) > maxOffsetSec) continue;
      const sBigram = containment(bigs, ci.bigrams);
      const sUnigram = containment(tokSet, new Set(ci.tokens));
      if (sBigram === 0 && sUnigram < 0.5) continue;
      const lenWeight = Math.min(1, ci.tokens.length / 6);
      const score = (sBigram * 1.5 + sUnigram * 0.5) * (0.5 + 0.5 * lenWeight);
      if (score < minScore) continue;
      const candidate = { offset: chMid - ci.midSec, score, bestCueText: (ci.cue.text || "").slice(0, 60) };
      if (!best || score > best.score) best = candidate;
    }
    // eslint-disable-next-line no-console
    console.debug("[sync] chunk", { t: chMid.toFixed(2), text: text.trim(), match: best });
    if (best) matches.push(best);
  }

  if (matches.length < minMatches) {
    return {
      offset: 0,
      confidence: 0,
      matchedCount: matches.length,
      totalSegments: chunks.length,
      reason: "few-matches",
    };
  }

  const BIN = 0.5;
  const bins = new Map<number, { count: number; sumOffset: number; sumScore: number }>();
  for (const m of matches) {
    const key = Math.round(m.offset / BIN);
    const cur = bins.get(key) ?? { count: 0, sumOffset: 0, sumScore: 0 };
    cur.count += 1;
    cur.sumOffset += m.offset;
    cur.sumScore += m.score;
    bins.set(key, cur);
  }
  let bestKey = 0;
  let bestStrength = 0;
  for (const [k, v] of bins) {
    const left = bins.get(k - 1);
    const right = bins.get(k + 1);
    const strength = v.count + (left?.count ?? 0) * 0.5 + (right?.count ?? 0) * 0.5;
    if (strength > bestStrength) {
      bestStrength = strength;
      bestKey = k;
    }
  }

  let cCount = 0;
  let cOff = 0;
  let cScore = 0;
  for (const k of [bestKey - 1, bestKey, bestKey + 1]) {
    const v = bins.get(k);
    if (!v) continue;
    cCount += v.count;
    cOff += v.sumOffset;
    cScore += v.sumScore;
  }
  if (cCount < minMatches) {
    return {
      offset: 0,
      confidence: 0,
      matchedCount: matches.length,
      totalSegments: chunks.length,
      reason: "no-cluster",
    };
  }
  const offsetSeconds = cOff / cCount;
  const avgScore = cScore / cCount;
  const inCluster = cCount / matches.length;
  const coverage = Math.min(1, matches.length / Math.max(3, chunks.length));
  const confidence = Math.max(
    0,
    Math.min(1, 0.5 * inCluster + 0.3 * Math.min(1, avgScore) + 0.2 * coverage),
  );

  return {
    offset: Math.round(offsetSeconds * 100) / 100,
    confidence,
    matchedCount: cCount,
    totalSegments: chunks.length,
  };
}
