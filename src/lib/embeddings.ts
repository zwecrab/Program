/**
 * Local embeddings (Phase 2 brief §17.2): Xenova/bge-small-en-v1.5 via
 * transformers.js, 384 dims, running in Node on your machine. Source text
 * never goes to an API.
 *
 * `EMBEDDINGS=fake` swaps in a deterministic hashing embedder so tests and
 * offline builds run without the model. Never use it for the real index.
 */
import { EMBEDDING_DIMS } from "@/db/schema";

export interface Embedder {
  name: string;
  dims: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export const MODEL_ID = "Xenova/bge-small-en-v1.5";
/** bge recommends a query instruction for retrieval; passages are embedded bare. */
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

let cached: Promise<Embedder> | undefined;

export function getEmbedder(): Promise<Embedder> {
  if (!cached) cached = process.env.EMBEDDINGS === "fake" ? Promise.resolve(fakeEmbedder()) : loadTransformers();
  return cached;
}

async function loadTransformers(): Promise<Embedder> {
  const { pipeline } = await import("@huggingface/transformers");
  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "fp32" });
  return {
    name: MODEL_ID,
    dims: EMBEDDING_DIMS,
    async embed(texts) {
      const out: Float32Array[] = [];
      const batch = 16;
      for (let i = 0; i < texts.length; i += batch) {
        const slice = texts.slice(i, i + batch);
        const t = await extractor(slice, { pooling: "cls", normalize: true });
        const data = t.data as Float32Array;
        for (let r = 0; r < slice.length; r++) out.push(data.slice(r * EMBEDDING_DIMS, (r + 1) * EMBEDDING_DIMS));
      }
      return out;
    },
  };
}

/** Deterministic bag-of-hashed-words embedding. Similar texts land near each other; that is all tests need. */
export function fakeEmbedder(): Embedder {
  return {
    name: "fake-hash-384",
    dims: EMBEDDING_DIMS,
    async embed(texts) {
      return texts.map((t) => {
        const v = new Float32Array(EMBEDDING_DIMS);
        for (const w of t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)) {
          let h = 2166136261;
          for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
          v[Math.abs(h) % EMBEDDING_DIMS] += 1;
          v[Math.abs(h >> 7) % EMBEDDING_DIMS] += 0.5;
        }
        return normalize(v);
      });
    },
  };
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** libSQL expects vector32('[..]') text or a raw F32 blob; we pass the blob. */
export function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
