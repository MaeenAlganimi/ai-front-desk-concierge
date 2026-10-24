import { GoogleGenAI } from "@google/genai";

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
export async function embed(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY || process.env.CONCIERGE_MOCK === "1")
    return mockEmbedding(text);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const result = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: text,
    config: { outputDimensionality: 768 },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values || values.length !== 768)
    throw new Error("Invalid embedding response");
  return values;
}
