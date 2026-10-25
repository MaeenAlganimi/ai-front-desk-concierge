import { GoogleGenAI } from "@google/genai";
import { hasGeminiKeys, withKeys } from "./keys";

export function mockEmbedding(text: string): number[] {
  const vector = Array<number>(768).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 2166136261;
    for (const ch of word) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    vector[(hash >>> 0) % 768] += 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}
const cache = new Map<string, number[]>();
export async function embed(text: string): Promise<number[]> {
  if (!hasGeminiKeys()) return mockEmbedding(text);
  const hit = cache.get(text);
  if (hit) return hit;
  const result = await withKeys((apiKey) =>
    new GoogleGenAI({ apiKey }).models.embedContent({
      model: "gemini-embedding-001",
      contents: text,
      config: { outputDimensionality: 768, abortSignal: AbortSignal.timeout(15000) },
    }),
  );
  const values = result.embeddings?.[0]?.values;
  if (!values || values.length !== 768)
    throw new Error("Invalid embedding response");
  if (cache.size > 500) cache.clear();
  cache.set(text, values);
  return values;
}
