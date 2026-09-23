import { extractFeatures, compareFeatures } from "./audio.js";
self.onmessage = ({ data }) => {
  try {
    const a = extractFeatures(data.a, data.sampleRate),
      b = extractFeatures(data.b, data.sampleRate);
    self.postMessage({ id: data.id, result: compareFeatures(a, b) });
  } catch {
    self.postMessage({
      id: data.id,
      result: {
        valid: false,
        reason: "Analysis failed. Try a different excerpt or audio file.",
      },
    });
  }
};
