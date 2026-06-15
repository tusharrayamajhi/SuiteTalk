/**
 * Turn text into a 768-dim embedding vector. Returns null on any failure so
 * callers can gracefully fall back to keyword search.
 */
export declare function embedText(text: string): Promise<number[] | null>;
/** pgvector text literal, e.g. [0.12,0.34,...] */
export declare function toVectorLiteral(values: number[]): string;
//# sourceMappingURL=embeddings.d.ts.map