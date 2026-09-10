import { countTokens as countCl100k } from "gpt-tokenizer";
import { countTokens as countO200k } from "gpt-tokenizer/encoding/o200k_base";
import type { Product } from "../../products/types.js";

const COUNTERS: Record<string, (text: string) => number> = {
  cl100k_base: countCl100k,
  o200k_base: countO200k,
};

/**
 * Fifteenth Basalt product: counts tokens the way GPT-family models actually
 * see them (real BPE encoding, not a word-count guess) — an agent building a
 * prompt needs this before calling an LLM, to stay under a context window or
 * estimate cost. Pure local tokenization, no network call to any model API.
 */
export const tokenCountProduct: Product = {
  id: "token-count",
  method: "POST",
  path: "/token-count",
  priceUsd: Number(process.env.AUTOMATON_PRICE_TOKEN_COUNT_USD ?? 0.002),
  description:
    "Counts tokens in a text using real GPT-family BPE encodings (cl100k_base or o200k_base) — check length before calling an LLM.",
  launchedAt: "2026-09-10",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text: { type: "string" },
      encoding: { type: "string", enum: ["cl100k_base", "o200k_base"] },
    },
  },
  inputExample: { text: "Hola, esto es una prueba de conteo de tokens.", encoding: "cl100k_base" },
  outputSchema: {
    type: "object",
    properties: {
      encoding: { type: "string" },
      characters: { type: "number" },
      tokens: { type: "number" },
    },
    required: ["encoding", "characters", "tokens"],
  },
  outputExample: { encoding: "cl100k_base", characters: 46, tokens: 13 },
  handler(req, res) {
    const { text, encoding } = req.body ?? {};
    if (typeof text !== "string" || text.length === 0) {
      res.status(400).json({ error: "Body must include { text: string, encoding?: 'cl100k_base'|'o200k_base' }" });
      return;
    }
    const enc = typeof encoding === "string" && encoding in COUNTERS ? encoding : "cl100k_base";
    res.json({ encoding: enc, characters: text.length, tokens: COUNTERS[enc](text) });
  },
};
