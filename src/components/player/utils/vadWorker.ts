import { NonRealTimeVAD } from "@ricky0123/vad-web";

const VAD_CDN = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.24/dist/";
const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/";

let vadPromise: Promise<NonRealTimeVAD> | null = null;

function getVad(): Promise<NonRealTimeVAD> {
  if (!vadPromise) {
    vadPromise = NonRealTimeVAD.new({
      modelURL: VAD_CDN + "silero_vad_legacy.onnx",
      ortConfig: (ort) => {
        (ort as any).env.wasm.wasmPaths = ORT_CDN;
      },
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      minSpeechFrames: 3,
      redemptionFrames: 12,
    });
  }
  return vadPromise;
}

interface ProcessMessage {
  type: "process";
  id: number;
  pcm: Float32Array;
  sampleRate: number;
}

(self as unknown as Worker).onmessage = async (ev: MessageEvent<ProcessMessage>) => {
  const data = ev.data;
  if (!data || data.type !== "process") return;
  const { id, pcm, sampleRate } = data;
  try {
    const vad = await getVad();
    const segments: { start: number; end: number }[] = [];
    for await (const seg of vad.run(pcm, sampleRate)) {
      segments.push({ start: seg.start, end: seg.end });
    }
    (self as unknown as Worker).postMessage({ type: "segments", id, segments });
  } catch (e) {
    (self as unknown as Worker).postMessage({
      type: "error",
      id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
};

export {};
