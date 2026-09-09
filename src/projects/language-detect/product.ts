import { francAll } from "franc";
import type { Product } from "../../products/types.js";

const MAX_TEXT_CHARS = 10_000;

/**
 * Octavo producto de Basalt: detecta el idioma de un texto — soporta 186
 * idiomas, sin depender de ninguna API externa.
 */
export const languageDetectProduct: Product = {
  id: "language-detect",
  method: "POST",
  path: "/language-detect",
  priceUsd: Number(process.env.AUTOMATON_PRICE_LANGUAGE_DETECT_USD ?? 0.002),
  description: "Detects the language of a text (186 languages supported), returning the top 3 most likely matches.",
  launchedAt: "2026-09-09",
  inputSchema: { type: "object", required: ["text"], properties: { text: { type: "string" } } },
  inputExample: { text: "Hello, this is a test." },
  outputSchema: {
    type: "object",
    properties: {
      language: { type: "string" },
      confident: { type: "boolean" },
      candidates: { type: "array", items: { type: "object", properties: { code: { type: "string" }, score: { type: "number" } } } },
    },
    required: ["language", "confident"],
  },
  outputExample: {
    language: "eng",
    confident: true,
    candidates: [
      { code: "eng", score: 0.98 },
      { code: "sco", score: 0.01 },
      { code: "gla", score: 0.005 },
    ],
  },
  handler(req, res) {
    const text = req.body?.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "Body must include { text: string }" });
      return;
    }
    try {
      const candidates = francAll(text.slice(0, MAX_TEXT_CHARS)).slice(0, 3);
      const [top] = candidates;
      res.json({
        language: top ? top[0] : "und",
        confident: top ? top[0] !== "und" : false,
        candidates: candidates.map(([code, score]) => ({ code, score })),
      });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : "Could not detect the language." });
    }
  },
};
