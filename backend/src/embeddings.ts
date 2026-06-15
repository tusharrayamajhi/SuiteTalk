import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Standalone embedding client (separate module to avoid an ai.ts <-> db.ts cycle).
const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// gemini-embedding-001 supports configurable dimensions; request 768 to match the
// knowledge_base.embedding vector(768) column. (Cosine search is scale-invariant,
// so the truncated Matryoshka vector needs no manual normalization.)
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

/**
 * Turn text into a 768-dim embedding vector. Returns null on any failure so
 * callers can gracefully fall back to keyword search.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  try {
    const resp: any = await client.models.embedContent({
      model: EMBED_MODEL,
      contents: text,
      config: { outputDimensionality: EMBED_DIM },
    });
    const values: number[] | undefined =
      resp?.embeddings?.[0]?.values ?? resp?.embedding?.values;
    return Array.isArray(values) && values.length ? values : null;
  } catch (err: any) {
    console.error("[Embed] embedContent failed:", err?.message || err);
    return null;
  }
}

/** pgvector text literal, e.g. [0.12,0.34,...] */
export function toVectorLiteral(values: number[]): string {
  return "[" + values.join(",") + "]";
}
