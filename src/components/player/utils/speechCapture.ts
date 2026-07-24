import { AudioActivitySample } from "@/components/player/utils/subtitleSync";



interface TimeMapEntry {
  /** sample index, native rate, since capture start */
  offset: number;
  /** playback time at that sample */
  t: number;
}

const POLL_MS = 50; // 20 Hz
const FFT_SIZE = 8192; // analyser window; max 32768 in WebAudio spec
const GRID_STEP = 0.2; // activity sampling resolution (s)
const RUN_INTERVAL_MS = 8000; // how often to (re)run VAD
const MIN_SPAN_S = 25; // need this much audio buffered before first run
const MAX_SPAN_S = 120; // ring-buffer cap

export class SpeechCapture {
  private ctx: AudioContext;
  private source: AudioNode;
  private getCurrentTime: () => number;
  private sampleRate: number;

  private analyser: AnalyserNode | null = null;
  private worker: Worker | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private chunks: Float32Array[] = [];
  private totalSamples = 0;
  private map: TimeMapEntry[] = [];
  private droppedSamples = 0;

  private segments: { start: number; end: number }[] = [];
  private coveredFrom = Infinity;
  private coveredTo = -Infinity;

  private busy = false;
  private lastRunAt = 0;
  private lastSampleTime = -1;
  private reqId = 0;
  private stopped = false;
  private pendingMap: TimeMapEntry[] = [];
  private pendingId = 0;

  constructor(
    ctx: AudioContext,
    source: AudioNode,
    getCurrentTime: () => number,
  ) {
    this.ctx = ctx;
    this.source = source;
    this.getCurrentTime = getCurrentTime;
    this.sampleRate = ctx.sampleRate;
  }

  start() {
    try {
      this.worker = new Worker(new URL("./vadWorker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (ev) => this.onWorkerMessage(ev);
      this.worker.onerror = () => this.stop();

      this.analyser = this.ctx.createAnalyser();
   
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0;

   
      this.source.connect(this.analyser);

      this.pollTimer = setInterval(() => this.poll(), POLL_MS);
    } catch {
      this.stop();
    }
  }

  private poll() {
    if (this.stopped || !this.analyser) return;
    const now = this.getCurrentTime();
  
    if (
      this.lastSampleTime >= 0 &&
      Math.abs(now - this.lastSampleTime) > 0.5
    ) {
      this.resetBuffer();
    }
    const win = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(win);


    const sliceLen = Math.min(
      win.length,
      Math.ceil((POLL_MS / 1000) * this.sampleRate),
    );
    const start = win.length - sliceLen;
    const chunk = new Float32Array(sliceLen);
    chunk.set(win.subarray(start));

    this.map.push({
      offset: this.droppedSamples + this.totalSamples,
      t: now - sliceLen / this.sampleRate,
    });
    this.chunks.push(chunk);
    this.totalSamples += sliceLen;
    this.lastSampleTime = now;

    this.trim();
    this.maybeRun();
  }

  private resetBuffer() {
    this.chunks = [];
    this.totalSamples = 0;
    this.map = [];
    this.droppedSamples = 0;
    this.segments = [];
    this.coveredFrom = Infinity;
    this.coveredTo = -Infinity;
  }

  private trim() {
    const maxSamples = this.sampleRate * MAX_SPAN_S;
    while (this.totalSamples > maxSamples && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.totalSamples -= dropped.length;
      this.droppedSamples += dropped.length;
      this.map.shift();
    }
  }

  private maybeRun() {
    if (this.busy || !this.worker) return;
    if (this.totalSamples < this.sampleRate * MIN_SPAN_S) return;
    if (performance.now() - this.lastRunAt < RUN_INTERVAL_MS) return;

    const pcm = new Float32Array(this.totalSamples);
    let off = 0;
    for (const c of this.chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    const baseOffset = this.map.length
      ? this.map[0].offset
      : this.droppedSamples;
    const mapSnapshot = this.map.map((m) => ({
      offset: m.offset - baseOffset,
      t: m.t,
    }));

    this.busy = true;
    this.lastRunAt = performance.now();
    const id = ++this.reqId;
    this.pendingMap = mapSnapshot;
    this.pendingId = id;
    this.worker.postMessage({
      type: "process",
      id,
      pcm,
      sampleRate: this.sampleRate,
    });
  }

  private onWorkerMessage(ev: MessageEvent) {
    const data = ev.data;
    if (!data) return;
    if (data.type === "error") {
      this.busy = false;
      return;
    }
    if (data.type !== "segments" || data.id !== this.pendingId) {
      this.busy = false;
      return;
    }
    this.busy = false;

    const map = this.pendingMap;
    if (!map.length) return;

    const toPlaybackTime = (sampleIdx: number): number => {
      let lo = 0;
      let hi = map.length - 1;
      let idx = 0;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (map[m].offset <= sampleIdx) {
          idx = m;
          lo = m + 1;
        } else {
          hi = m - 1;
        }
      }
      const entry = map[idx];
      return entry.t + (sampleIdx - entry.offset) / this.sampleRate;
    };

    const segs: { start: number; end: number }[] = [];
    for (const s of data.segments as { start: number; end: number }[]) {
      const startSample = (s.start / 1000) * this.sampleRate;
      const endSample = (s.end / 1000) * this.sampleRate;
      const a = toPlaybackTime(startSample);
      const b = toPlaybackTime(endSample);
      if (b > a) segs.push({ start: a, end: b });
    }
    this.segments = segs;
    this.coveredFrom = map[0].t;
    const lastEntry = map[map.length - 1];
    this.coveredTo = Math.max(
      lastEntry.t,
      segs.length ? segs[segs.length - 1].end : lastEntry.t,
    );
  }

  isReady(): boolean {
    return this.segments.length > 0 && this.coveredTo > this.coveredFrom;
  }

  getActivitySamples(): AudioActivitySample[] {
    if (!this.isReady()) return [];
    const out: AudioActivitySample[] = [];
    const segs = this.segments;
    let si = 0;
    for (let t = this.coveredFrom; t <= this.coveredTo; t += GRID_STEP) {
      while (si < segs.length && segs[si].end < t) si += 1;
      const inSpeech =
        si < segs.length && segs[si].start <= t && segs[si].end >= t;
      out.push({ t, e: inSpeech ? 1 : 0 });
    }
    return out;
  }

  getAudioWindow(durationSec: number): {
    pcm: Float32Array;
    sampleRate: number;
    startTime: number;
    endTime: number;
  } | null {
    if (this.chunks.length === 0 || this.map.length === 0) return null;
    const baseOffset = this.map[0].offset;
    const totalSamples = this.totalSamples;
    if (totalSamples <= 0) return null;
    const wanted = Math.min(
      totalSamples,
      Math.ceil(durationSec * this.sampleRate),
    );
    const buf = new Float32Array(wanted);
    let pos = 0;
    let drop = totalSamples - wanted;
    for (const c of this.chunks) {
      let chunk = c;
      if (drop >= chunk.length) {
        drop -= chunk.length;
        continue;
      }
      if (drop > 0) {
        chunk = chunk.subarray(drop);
        drop = 0;
      }
      const space = buf.length - pos;
      if (chunk.length <= space) {
        buf.set(chunk, pos);
        pos += chunk.length;
      } else {
        buf.set(chunk.subarray(0, space), pos);
        pos = buf.length;
        break;
      }
    }
    const startSample = baseOffset + (totalSamples - wanted);
    const toPlaybackTime = (sampleIdx: number): number => {
      let lo = 0;
      let hi = this.map.length - 1;
      let idx = 0;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (this.map[m].offset <= sampleIdx) {
          idx = m;
          lo = m + 1;
        } else {
          hi = m - 1;
        }
      }
      const entry = this.map[idx];
      return entry.t + (sampleIdx - entry.offset) / this.sampleRate;
    };
    const startTime = toPlaybackTime(startSample);
    const endTime = startTime + wanted / this.sampleRate;
    return { pcm: buf, sampleRate: this.sampleRate, startTime, endTime };
  }

  stop() {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    try {
      this.source?.disconnect?.(this.analyser as AudioNode);
    } catch {
      // ignore
    }
    this.analyser = null;
    this.worker?.terminate();
    this.worker = null;
    this.resetBuffer();
  }
}
